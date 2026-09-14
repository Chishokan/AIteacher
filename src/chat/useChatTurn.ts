import { useCallback, useMemo, useRef, useState } from 'react'
import { cancelSpeech } from '../speech/tts'
import { stopAllAudio } from './audioPlayer'
import type { Voice } from './voice'
import { startPushToTalk, type PushToTalkHandle } from './pushToTalk'
import { emptyMetrics, type ChatPhase, type ChatTurn, type TurnMetrics } from './types'
import { RETRY_NOTICE } from './fixedLines'
import type { ReplySource } from './reply'
import {
  chooseFiller,
  chooseThinkingFiller,
  detectScene,
  rememberFiller,
  type FillerPick,
} from './fillers'

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
  /** つなぎ言葉を使うか。切ると計測欄に「オフ」と出る */
  fillerEnabled?: boolean
  /** その文言の音声が用意できているか。用意できたものしかつなぎ言葉に使わない */
  isFillerReady?: (text: string) => boolean
  /** 生徒の名前。無ければ「{名前}」入りのつなぎ言葉は使わない */
  studentName?: string
}

/** つなぎ言葉を言い終えても返事ができていないとき、2 段目までこれだけ待つ */
const SECOND_FILLER_WAIT_MS = 400

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 押して話すターン制。
 *
 * 守っていること（引き継ぎ仕様 3.1）
 * - 自動でマイクを開かない。生徒が押すまで待つ。時間による打ち切りもしない
 * - アバターが話している間は押せない（自分の声を拾わないため）
 * - 聞き取れなかったときは話さず、押し直してもらう案内だけ出す
 */
export function useChatTurn({
  opening,
  replySource,
  voice,
  fallbackVoice,
  fillerEnabled = true,
  isFillerReady,
  studentName,
}: UseChatTurnOptions) {
  const [state, setState] = useState<ChatState>(INITIAL)

  const listeningRef = useRef<PushToTalkHandle | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const turnsRef = useRef<ChatTurn[]>([])
  const busyRef = useRef(false)
  /** 直近に使ったつなぎ言葉。同じものが続かないように覚えておく */
  const recentFillersRef = useRef<string[]>([])
  /** 名前入りのつなぎ言葉を前に使ってから何ターンたったか */
  const turnsSinceNameRef = useRef(Number.POSITIVE_INFINITY)

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

  /**
   * 生徒の発話を受けて、返事をする。
   *
   * 沈黙を作らないために、順番がふつうと違う（引き継ぎ仕様 3.2）。
   *  1. 場面を判定して、つなぎ言葉を選ぶ（AI は使わない。一瞬で決まる）
   *  2. 返事づくりを**先に走らせる**（待たない）
   *  3. その裏でつなぎ言葉を鳴らす → 生徒が話し終えた直後に声が出る
   *  4. 言い終えても返事が来ていなければ、400ms 待って「考え中」で 2 段目
   *  5. 返事が来たら鳴らす
   */
  const handleTranscript = useCallback(
    async (transcript: string) => {
      const studentDoneAt = Date.now()
      pushTurn({ who: 'student', text: transcript, at: studentDoneAt })
      patch({ phase: 'thinking', interim: '', notice: '' })

      const abort = new AbortController()
      abortRef.current = abort

      // --- 1. つなぎ言葉を選ぶ ---------------------------------------------
      const pick: FillerPick = fillerEnabled
        ? chooseFiller(transcript, {
            isReady: isFillerReady ?? (() => false),
            studentName,
            recent: recentFillersRef.current,
            turnsSinceName: turnsSinceNameRef.current,
            random: Math.random,
          })
        : { text: null, scene: detectScene(transcript), skipReason: 'オフ', usedName: false }

      const metrics: TurnMetrics = {
        ...emptyMetrics(),
        fillerScene: pick.scene,
        fillerSkipReason: pick.skipReason,
      }

      // --- 2. 返事づくりを先に走らせる（待たない）--------------------------
      const thinkStart = Date.now()
      let replyDone = false
      // 返事づくりにかかった時間。つなぎ言葉を鳴らしている間も進むので、
      // あとから測ると鳴らした時間まで混ざる。返ってきた時点で止める
      let thinkMs: number | null = null
      const replyPromise = replySource
        .respond(turnsRef.current, {
          signal: abort.signal,
          filler: pick.text,
          scene: pick.scene,
        })
        .finally(() => {
          replyDone = true
          thinkMs = Date.now() - thinkStart
        })

      // --- 3. つなぎ言葉を鳴らす -------------------------------------------
      /** 最後のつなぎ言葉を言い終えた時刻。途中の沈黙を測るのに使う */
      let fillerDoneAt: number | null = null
      if (pick.text) {
        recentFillersRef.current = rememberFiller(recentFillersRef.current, pick.text)
        turnsSinceNameRef.current = pick.usedName ? 0 : turnsSinceNameRef.current + 1
        metrics.fillerCount += 1

        await say(pick.text, () => {
          metrics.firstVoiceMs = Date.now() - studentDoneAt
          patch({ metrics: { ...metrics } })
        })
        fillerDoneAt = Date.now()

        // --- 4. まだ返事が来ていなければ、少し待って「考え中」で 2 段目 ----
        if (!replyDone && !abort.signal.aborted) {
          await sleep(SECOND_FILLER_WAIT_MS)
          if (!replyDone && !abort.signal.aborted) {
            const waiting = chooseThinkingFiller(
              isFillerReady ?? (() => false),
              recentFillersRef.current,
              Math.random,
            )
            if (waiting) {
              recentFillersRef.current = rememberFiller(recentFillersRef.current, waiting)
              metrics.fillerCount += 1
              patch({ metrics: { ...metrics } })
              await say(waiting)
              fillerDoneAt = Date.now()
            }
          }
        }
      } else {
        turnsSinceNameRef.current += 1
      }

      // --- 5. 返事を待って鳴らす -------------------------------------------
      const reply = await replyPromise
      metrics.thinkMs = thinkMs

      if (abort.signal.aborted) return

      if (reply.status === 'fatal') {
        patch({ phase: 'idle', fatal: reply.message, metrics: { ...metrics } })
        return
      }
      if (reply.status === 'retryable') {
        // 返事できなかった発言は履歴から外し、「あなたの番」に戻す
        turnsRef.current = turnsRef.current.filter((t) => t.at !== studentDoneAt)
        patch({
          phase: 'idle',
          turns: turnsRef.current,
          notice: reply.message,
          metrics: { ...metrics },
        })
        return
      }

      pushTurn({ who: 'ai', text: reply.text, at: Date.now() })

      const spoken = await say(reply.text, () => {
        const now = Date.now()
        metrics.firstVoiceMs ??= now - studentDoneAt
        // つなぎ言葉を言い終えてから、返事が始まるまでの沈黙
        if (fillerDoneAt !== null) metrics.gapMs = now - fillerDoneAt
        patch({ metrics: { ...metrics } })
      })
      metrics.ttsMs = spoken.ttsMs
      metrics.ttsPrebuilt = spoken.prebuilt

      patch({ phase: 'idle', metrics: { ...metrics } })
    },
    [fillerEnabled, isFillerReady, patch, pushTurn, replySource, say, studentName],
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
