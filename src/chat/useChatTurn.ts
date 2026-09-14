import { useCallback, useMemo, useRef, useState } from 'react'
import { cancelSpeech } from '../speech/tts'
import { stopAllAudio } from './audioPlayer'
import type { Voice } from './voice'
import { startPushToTalk, type PushToTalkHandle } from './pushToTalk'
import { emptyMetrics, type ChatPhase, type ChatTurn, type TurnMetrics } from './types'
import { RETRY_NOTICE } from './fixedLines'
import type { ReplySource } from './reply'

export interface ChatState {
  phase: ChatPhase
  turns: ChatTurn[]
  /** 聞き取り中の文字。iOS では不安定なので表示は控えめにする */
  interim: string
  /** 「もう一度押してください」などの案内 */
  notice: string
  /** 直近の返事にかかった時間 */
  metrics: TurnMetrics | null
  /** 会話を止めたほうがよいエラー */
  fatal: string | null
}

const INITIAL: ChatState = {
  phase: 'idle',
  turns: [],
  interim: '',
  notice: '',
  metrics: null,
  fatal: null,
}

interface SayResult {
  ttsMs: number
  /** 事前に作っておいた音声を鳴らしたか */
  prebuilt: boolean
}

export interface UseChatTurnOptions {
  /** アバターの最初のひとこと */
  opening: string
  replySource: ReplySource
  /** 返事をしゃべるところ */
  voice: Voice
  /** voice が使えなかったときの受け皿（ブラウザの読み上げ） */
  fallbackVoice?: Voice
}

/**
 * 押して話すターン制。
 *
 * 守っていること（引き継ぎ仕様 3.1）
 * - 自動でマイクを開かない。生徒が押すまで待つ。時間による打ち切りもしない
 * - アバターが話している間は押せない（自分の声を拾わないため）
 * - 聞き取れなかったときは話さず、押し直してもらう案内だけ出す
 */
export function useChatTurn({ opening, replySource, voice, fallbackVoice }: UseChatTurnOptions) {
  const [state, setState] = useState<ChatState>(INITIAL)

  const listeningRef = useRef<PushToTalkHandle | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const turnsRef = useRef<ChatTurn[]>([])
  const busyRef = useRef(false)

  const patch = useCallback((next: Partial<ChatState>) => {
    setState((prev) => ({ ...prev, ...next }))
  }, [])

  /**
   * しゃべらせる。用意した声が使えなければ、読み上げに落として続ける。
   * @returns 音声を用意するのにかかった時間と、事前生成を鳴らしたか
   */
  const say = useCallback(
    async (text: string, onFirstVoice?: () => void): Promise<SayResult> => {
      patch({ phase: 'speaking' })
      const outcome = await voice.speak(text, { onFirstVoice })
      if (outcome.status === 'ok') return { ttsMs: outcome.ttsMs, prebuilt: outcome.prebuilt }

      // 声が出せなくても、字幕は出ているので会話は続ける
      patch({ notice: `${outcome.message} いまはブラウザの読み上げで進めます。` })
      if (!fallbackVoice) return { ttsMs: 0, prebuilt: false }
      const fallback = await fallbackVoice.speak(text, { onFirstVoice })
      return fallback.status === 'ok'
        ? { ttsMs: fallback.ttsMs, prebuilt: fallback.prebuilt }
        : { ttsMs: 0, prebuilt: false }
    },
    [fallbackVoice, patch, voice],
  )

  const pushTurn = useCallback(
    (turn: ChatTurn) => {
      turnsRef.current = [...turnsRef.current, turn]
      patch({ turns: turnsRef.current })
    },
    [patch],
  )

  /** 画面を開いたときに、最初のひとことを言う */
  const begin = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    turnsRef.current = []
    setState({ ...INITIAL })
    pushTurn({ who: 'ai', text: opening, at: Date.now() })
    await say(opening)
    patch({ phase: 'idle' })
    busyRef.current = false
  }, [opening, patch, pushTurn, say])

  /** 生徒の発話を受けて、返事をする */
  const handleTranscript = useCallback(
    async (transcript: string) => {
      const studentDoneAt = Date.now()
      pushTurn({ who: 'student', text: transcript, at: studentDoneAt })
      patch({ phase: 'thinking', interim: '', notice: '' })

      const abort = new AbortController()
      abortRef.current = abort

      const thinkStart = Date.now()
      const reply = await replySource.respond(turnsRef.current, abort.signal)
      const thinkMs = Date.now() - thinkStart

      if (abort.signal.aborted) return

      if (reply.status === 'fatal') {
        patch({ phase: 'idle', fatal: reply.message })
        return
      }
      if (reply.status === 'retryable') {
        // 返事できなかった発言は履歴から外し、「あなたの番」に戻す
        turnsRef.current = turnsRef.current.filter((t) => t.at !== studentDoneAt)
        patch({ phase: 'idle', turns: turnsRef.current, notice: reply.message })
        return
      }

      const metrics: TurnMetrics = { ...emptyMetrics(), thinkMs }
      pushTurn({ who: 'ai', text: reply.text, at: Date.now() })

      const spoken = await say(reply.text, () => {
        metrics.firstVoiceMs = Date.now() - studentDoneAt
        patch({ metrics: { ...metrics } })
      })
      metrics.ttsMs = spoken.ttsMs
      metrics.ttsPrebuilt = spoken.prebuilt

      patch({ phase: 'idle', metrics: { ...metrics } })
    },
    [patch, pushTurn, replySource, say],
  )

  /** マイクのボタン。押すたびに「開く」と「送る」が入れ替わる */
  const pressMic = useCallback(() => {
    // アバターが話している / 返事を作っている間は受け付けない
    if (state.phase === 'speaking' || state.phase === 'thinking') return

    if (state.phase === 'recording') {
      listeningRef.current?.stop()
      return
    }

    patch({ phase: 'recording', interim: '', notice: '' })
    const handle = startPushToTalk((interim) => patch({ interim }))
    listeningRef.current = handle

    void handle.result.then((result) => {
      listeningRef.current = null
      if (result.status === 'ok') {
        void handleTranscript(result.transcript)
        return
      }
      if (result.status === 'empty') {
        // 聞き取れなかったときはアバターは話さない
        patch({ phase: 'idle', interim: '', notice: RETRY_NOTICE })
        return
      }
      patch({ phase: 'idle', interim: '', notice: result.message })
    })
  }, [handleTranscript, patch, state.phase])

  /** 画面を離れるときに、鳴っているものを止める */
  const stop = useCallback(() => {
    abortRef.current?.abort()
    listeningRef.current?.stop()
    listeningRef.current = null
    cancelSpeech()
    stopAllAudio()
    busyRef.current = false
    turnsRef.current = []
    setState({ ...INITIAL })
  }, [])

  const actions = useMemo(() => ({ begin, pressMic, stop }), [begin, pressMic, stop])
  return { state, actions }
}
