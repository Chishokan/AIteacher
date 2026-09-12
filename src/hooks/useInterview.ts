import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Answer, Question, Scenario, Session } from '../types'
import { parseAnswer, parseYesNo } from '../logic/parseAnswer'
import { confirmSentence, formatAnswer } from '../logic/interview'
import { cancelSpeech, speak } from '../speech/tts'
import { playClips } from '../speech/clips'
import { listen } from '../speech/stt'
import type { Settings } from '../logic/settings'

export type Phase =
  | 'idle'
  | 'greeting'
  | 'asking'
  | 'listening'
  | 'thinking'
  | 'confirming'
  | 'closing'
  | 'done'

/** 画面から面談の進行に割り込むための指示 */
/** 指示を 1 つだけ受け取る待ち受け口 */
interface CommandWaiter {
  deliver: (command: Command) => void
}

type Command =
  | { type: 'touch'; value?: number; text: string }
  | { type: 'skip' }
  | { type: 'repeat' }
  | { type: 'listen' }
  | { type: 'stop' }

export interface InterviewState {
  phase: Phase
  /** 現在の質問の位置。未開始なら -1 */
  index: number
  question: Question | null
  answers: Answer[]
  /** アバターが今しゃべっている文章 */
  caption: string
  /** 認識途中の文字列 */
  interim: string
  /** 「聞き取れませんでした」などの画面向けメッセージ */
  notice: string
  /**
   * 確認中の答え。値は音声で読み上げないため、ここを画面に大きく出す。
   * 確認していないあいだは null
   */
  pendingAnswer: { label: string; display: string } | null
  /** 同じ質問で聞き直した回数 */
  attempts: number
  /** マイクが開いているか */
  micActive: boolean
  /**
   * マイクが使えず、自動では聞き取りを始められない状態。
   * 端末によっては、画面をタップした直後でないと音声認識を始められない
   */
  micBlocked: boolean
  error: string | null
}

const INITIAL_STATE: InterviewState = {
  phase: 'idle',
  index: -1,
  question: null,
  answers: [],
  caption: '',
  interim: '',
  notice: '',
  pendingAnswer: null,
  attempts: 0,
  micActive: false,
  micBlocked: false,
  error: null,
}

/** これ以上聞き直しても進まないので、画面入力を促す回数 */
const MAX_VOICE_ATTEMPTS = 3
/** 読み上げ終了からマイクを開くまでの間。自分の声を拾わないようにする */
const MIC_OPEN_DELAY_MS = 300

/**
 * アバターが一度にしゃべる内容。
 * clips が空のときは、文章をそのまま読み上げる。
 */
interface Line {
  text: string
  clips: string[]
}

/** 複数の文をつなぐ。1 つでも音声がないものが混ざれば、全体を読み上げにまわす */
function join(...parts: Line[]): Line {
  const text = parts.map((part) => part.text).join(' ')
  const clips = parts.every((part) => part.clips.length > 0)
    ? parts.flatMap((part) => part.clips)
    : []
  return { text, clips }
}

/**
 * 聞き直しが続いたら、画面入力もできることを伝える。
 * 何を聞かれているのかを見失わないよう、質問文は必ず後ろに残す。
 */
function withTouchHint(question: Question, lead: Line, attempts: number): Line {
  if (attempts < MAX_VOICE_ATTEMPTS) return lead
  return join(
    lead,
    { text: '画面のボタンからも入力できます。', clips: ['touch-hint'] },
    againLine(question),
  )
}

/** 質問そのもの */
function askLine(question: Question): Line {
  return { text: question.prompt, clips: question.audio ? [question.audio] : [] }
}

/** 聞き取れなかったときの言い直し */
function againLine(question: Question): Line {
  if (!question.rePrompt) return askLine(question)
  return { text: question.rePrompt, clips: question.audioAgain ? [question.audioAgain] : [] }
}

/** 確認のときに鳴らす音声。値は画面に出すので、種類ぶんだけあればよい */
function confirmClip(question: Question): string {
  if (question.kind === 'score') return 'confirm-score'
  if (question.kind === 'grade') return 'confirm-grade'
  return 'confirm-other'
}

class StoppedError extends Error {
  constructor() {
    super('interview stopped')
    this.name = 'StoppedError'
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    signal?.addEventListener('abort', done)
  })
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export interface UseInterviewOptions {
  scenario: Scenario
  settings: Settings
  onFinish?: (session: Session) => void
}

export function useInterview({ scenario, settings, onFinish }: UseInterviewOptions) {
  const [state, setState] = useState<InterviewState>(INITIAL_STATE)

  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const scenarioRef = useRef(scenario)
  scenarioRef.current = scenario
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish

  /** 面談全体の中断 */
  const runAbortRef = useRef<AbortController | null>(null)
  /** 現在の 1 ステップ（読み上げ or 聞き取り）の中断 */
  const stepAbortRef = useRef<AbortController | null>(null)
  const waiterRef = useRef<CommandWaiter | null>(null)
  const queuedCommandsRef = useRef<Command[]>([])
  const runningRef = useRef(false)

  const patch = useCallback((next: Partial<InterviewState>) => {
    setState((prev) => ({ ...prev, ...next }))
  }, [])

  const sendCommand = useCallback((command: Command) => {
    // 進行中の読み上げ・聞き取りを止めて、すぐに指示を反映させる
    stepAbortRef.current?.abort()
    cancelSpeech()
    const waiter = waiterRef.current
    if (waiter) {
      waiterRef.current = null
      waiter.deliver(command)
    } else {
      queuedCommandsRef.current.push(command)
    }
  }, [])

  /**
   * 次の指示を待つ。
   *
   * 音声の聞き取りと競争させる場合、待ち受けを解除したあとに指示が届くと
   * 取りこぼしてしまうため、cancel() が「届いていた指示」を返すようにしている。
   */
  const takeCommand = useCallback((): {
    promise: Promise<Command>
    cancel: () => Command | null
  } => {
    const queued = queuedCommandsRef.current.shift()
    if (queued) return { promise: Promise.resolve(queued), cancel: () => queued }

    let received: Command | null = null
    const waiter: CommandWaiter = { deliver: () => {} }
    const promise = new Promise<Command>((resolve) => {
      waiter.deliver = (command) => {
        received = command
        resolve(command)
      }
    })
    waiterRef.current = waiter

    return {
      promise,
      cancel: () => {
        if (waiterRef.current === waiter) waiterRef.current = null
        return received
      },
    }
  }, [])

  const nextCommand = useCallback((): Promise<Command> => takeCommand().promise, [takeCommand])

  /** 面談全体が止められていたら例外で抜ける */
  const ensureRunning = useCallback(() => {
    if (runAbortRef.current?.signal.aborted) throw new StoppedError()
  }, [])

  /**
   * アバターにしゃべらせる。
   *
   * clips に音声ファイルの名前をわたすと、それを順番に鳴らす。
   * 1 本でも置かれていなければ、文章をそのまま読み上げる。
   */
  const say = useCallback(
    async (text: string, phase: Phase, clips: string[] = []) => {
      ensureRunning()
      const step = new AbortController()
      stepAbortRef.current = step
      patch({ phase, caption: text, interim: '', micActive: false })

      const usable = clips.filter(Boolean)
      if (usable.length > 0 && (await playClips(usable, step.signal))) {
        ensureRunning()
        return
      }

      try {
        await speak(text, {
          rate: settingsRef.current.rate,
          pitch: settingsRef.current.pitch,
          voiceURI: settingsRef.current.voiceURI,
          signal: step.signal,
        })
      } catch {
        // 読み上げに失敗しても、字幕は出ているので面談は続ける
        patch({ error: '音声が出せませんでした。字幕を読んで答えてください。' })
      }
      ensureRunning()
    },
    [ensureRunning, patch],
  )

  /**
   * 音声の聞き取りと、画面からの指示を同時に待つ。
   * 先に来たほうを返す。
   */
  const listenOrCommand = useCallback(
    async (question: Question | null): Promise<
      | { via: 'voice'; transcript: string | null; failure?: 'timeout' | 'error'; message?: string }
      | { via: 'command'; command: Command }
    > => {
      ensureRunning()
      const step = new AbortController()
      stepAbortRef.current = step

      patch({ phase: 'listening', interim: '', micActive: true, question })

      const voice = listen({
        startTimeoutMs: settingsRef.current.listenTimeoutSec * 1000,
        signal: step.signal,
        onInterim: (text) => patch({ interim: text }),
      }).then((result) => ({ kind: 'voice' as const, result }))

      const pending = takeCommand()
      const command = pending.promise.then((c) => ({ kind: 'command' as const, command: c }))
      const winner = await Promise.race([voice, command])

      step.abort()
      patch({ micActive: false, interim: '' })

      if (winner.kind === 'command') return { via: 'command', command: winner.command }

      // 聞き取りが先に終わっても、ぎりぎりで届いた画面操作は捨てない
      const late = pending.cancel()
      if (late) return { via: 'command', command: late }

      const result = winner.result
      if (result.status === 'ok') return { via: 'voice', transcript: result.transcript }
      if (result.status === 'aborted') {
        // 画面操作で打ち切られた。指示が届くのを待つ
        return { via: 'command', command: await nextCommand() }
      }
      if (result.status === 'timeout') return { via: 'voice', transcript: null, failure: 'timeout' }
      return { via: 'voice', transcript: null, failure: 'error', message: result.message }
    },
    [ensureRunning, nextCommand, patch, takeCommand],
  )

  /**
   * 聞き取った答えを画面に出して「はい / いいえ」を聞く。true なら確定。
   * 値は読み上げず、画面を見て答えてもらう。
   */
  const confirmAnswer = useCallback(
    async (question: Question, answer: Answer): Promise<boolean> => {
      patch({
        pendingAnswer: {
          label: question.label ?? question.section,
          display: formatAnswer(question, answer),
        },
      })
      await say(confirmSentence(question), 'confirming', [confirmClip(question)])
      await sleep(MIC_OPEN_DELAY_MS, runAbortRef.current?.signal)

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const outcome = await listenOrCommand(question)
        if (outcome.via === 'command') {
          if (outcome.command.type === 'stop') throw new StoppedError()
          // 画面の「はい」「いいえ」はそのまま返事として扱う
          if (outcome.command.type === 'touch') {
            return parseYesNo(outcome.command.text) === true
          }
          // 「今すぐ話す」は、言い直さずにもう一度聞く
          if (outcome.command.type === 'listen') continue
          // それ以外の操作（とばす・言い直し）は、確認をやめて質問に戻す
          queuedCommandsRef.current.unshift(outcome.command)
          return false
        }
        if (outcome.transcript === null) {
          // 無言は「そのとおり」とみなさず、もう一度だけ聞く
          if (attempt === 0) {
            await say('あっていたら「はい」、ちがったら「いいえ」と言ってください。', 'confirming', ['confirm-retry'])
            await sleep(MIC_OPEN_DELAY_MS, runAbortRef.current?.signal)
            continue
          }
          return true
        }
        const yes = parseYesNo(outcome.transcript)
        if (yes === true) return true
        if (yes === false) return false
        await say('あっていたら「はい」、ちがったら「いいえ」と言ってください。', 'confirming', ['confirm-retry'])
        await sleep(MIC_OPEN_DELAY_MS, runAbortRef.current?.signal)
      }
      return true
    },
    [listenOrCommand, patch, say],
  )

  /** 確認の表示を必ず片づけたうえで結果を返す */
  const confirmAndClear = useCallback(
    async (question: Question, answer: Answer): Promise<boolean> => {
      try {
        return await confirmAnswer(question, answer)
      } finally {
        patch({ pendingAnswer: null })
      }
    },
    [confirmAnswer, patch],
  )

  /** 1 問ぶんの聞き取り。null なら中断 */
  const askQuestion = useCallback(
    async (question: Question, index: number): Promise<Answer> => {
      patch({ index, question, attempts: 0, notice: '', error: null, pendingAnswer: null, micBlocked: false })
      let attempts = 0
      let line = askLine(question)
      /** 「今すぐ話す」で来たときは、読み上げを飛ばしてマイクを開く */
      let openMicNow = false

      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (openMicNow) {
          openMicNow = false
          patch({ caption: line.text })
        } else {
          await say(line.text, 'asking', line.clips)
          await sleep(MIC_OPEN_DELAY_MS, runAbortRef.current?.signal)
        }
        ensureRunning()

        const outcome = await listenOrCommand(question)

        if (outcome.via === 'command') {
          const { command } = outcome
          if (command.type === 'stop') throw new StoppedError()
          if (command.type === 'repeat') {
            line = askLine(question)
            continue
          }
          if (command.type === 'listen') {
            openMicNow = true
            continue
          }
          if (command.type === 'skip') {
            await say('わかりました。この質問はとばしますね。', 'thinking', ['skip'])
            return {
              questionId: question.id,
              viaTouch: true,
              skipped: true,
              answeredAt: new Date().toISOString(),
            }
          }
          // 画面から直接入力された答え
          const answer: Answer = {
            questionId: question.id,
            value: command.value,
            text: command.text,
            viaTouch: true,
            skipped: false,
            answeredAt: new Date().toISOString(),
          }
          await say('ありがとう。', 'thinking', ['touch-accepted'])
          return answer
        }

        if (outcome.transcript === null) {
          attempts += 1
          patch({
            attempts,
            notice:
              outcome.failure === 'error'
                ? (outcome.message ?? '音声認識に失敗しました。')
                : '聞き取れませんでした。もう一度お願いします。',
          })
          if (outcome.failure === 'error') {
            // マイクが使えない状況。声で聞き直しても直らないため画面入力に切り替える
            await say('うまく聞き取れないみたいです。画面から入力してください。', 'thinking', ['touch-fallback'])
            // 何を聞かれているか分からなくならないよう、字幕は質問に戻しておく
            patch({ caption: question.prompt, micBlocked: true })
            const command = await nextCommand()
            // タップした直後ならマイクを開けることがあるので、読み上げを挟まずに試す
            if (command.type === 'listen') {
              openMicNow = true
              continue
            }
            queuedCommandsRef.current.unshift(command)
            line = againLine(question)
            continue
          }
          line = withTouchHint(question, againLine(question), attempts)
          continue
        }

        patch({ phase: 'thinking', notice: '', micBlocked: false })
        const parsed = parseAnswer(question, outcome.transcript)

        if (parsed.status === 'repeat') {
          line = askLine(question)
          continue
        }
        if (parsed.status === 'skip') {
          await say('わかりました。この質問はとばしますね。', 'thinking', ['skip'])
          return {
            questionId: question.id,
            transcript: outcome.transcript,
            viaTouch: false,
            skipped: true,
            answeredAt: new Date().toISOString(),
          }
        }
        if (parsed.status === 'unclear') {
          attempts += 1
          patch({ attempts, notice: parsed.reason })
          line = withTouchHint(question, { text: parsed.reason, clips: [parsed.clip] }, attempts)
          continue
        }

        const answer: Answer = {
          questionId: question.id,
          value: parsed.value,
          text: parsed.text,
          transcript: outcome.transcript,
          viaTouch: false,
          skipped: false,
          answeredAt: new Date().toISOString(),
        }

        const needsConfirm =
          settingsRef.current.confirmAnswers &&
          (question.confirm ?? ['score', 'grade'].includes(question.kind))

        if (!needsConfirm) return answer
        if (await confirmAndClear(question, answer)) return answer

        attempts = 0
        patch({ attempts, notice: '言い直してください。' })
        line = againLine(question)
      }
    },
    [confirmAndClear, ensureRunning, listenOrCommand, nextCommand, patch, say],
  )

  const start = useCallback(
    async (studentName: string) => {
      if (runningRef.current) return
      runningRef.current = true

      runAbortRef.current?.abort()
      const run = new AbortController()
      runAbortRef.current = run
      queuedCommandsRef.current = []
      waiterRef.current = null

      const currentScenario = scenarioRef.current
      const session: Session = {
        id: newId(),
        scenarioId: currentScenario.id,
        studentName: studentName.trim() || '名前なし',
        startedAt: new Date().toISOString(),
        questions: currentScenario.questions,
        answers: [],
      }

      setState({ ...INITIAL_STATE, phase: 'greeting' })

      try {
        await say(currentScenario.greeting, 'greeting', ['greeting'])

        for (const [index, question] of currentScenario.questions.entries()) {
          const answer = await askQuestion(question, index)
          session.answers.push(answer)
          patch({ answers: [...session.answers] })
        }

        await say(currentScenario.closing, 'closing', ['closing'])
        session.finishedAt = new Date().toISOString()
        patch({ phase: 'done', caption: currentScenario.closing, question: null, micActive: false })
        onFinishRef.current?.(session)
      } catch (error) {
        if (!(error instanceof StoppedError)) {
          patch({
            phase: 'idle',
            error: error instanceof Error ? error.message : String(error),
            micActive: false,
          })
        }
      } finally {
        runningRef.current = false
        cancelSpeech()
      }
    },
    [askQuestion, patch, say],
  )

  const stop = useCallback(() => {
    runAbortRef.current?.abort()
    sendCommand({ type: 'stop' })
    cancelSpeech()
    setState({ ...INITIAL_STATE })
  }, [sendCommand])

  useEffect(() => {
    return () => {
      runAbortRef.current?.abort()
      cancelSpeech()
    }
  }, [])

  const actions = useMemo(
    () => ({
      start,
      stop,
      /** 質問をもう一度読み上げる */
      repeat: () => sendCommand({ type: 'repeat' }),
      /**
       * 読み上げを待たずに、すぐマイクを開く。
       * 画面のタップから間をおかずに開くので、
       * ユーザー操作の直後でないと音声認識を始められない端末でも動く。
       */
      listenNow: () => sendCommand({ type: 'listen' }),
      /** この質問をとばす */
      skip: () => sendCommand({ type: 'skip' }),
      /** 画面から答えを入力する */
      answerByTouch: (text: string, value?: number) =>
        sendCommand({ type: 'touch', text, value }),
    }),
    [sendCommand, start, stop],
  )

  return { state, actions }
}
