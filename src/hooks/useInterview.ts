import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Answer, Question, Scenario, Session } from '../types'
import { parseAnswer, parseYesNo } from '../logic/parseAnswer'
import { confirmSentence } from '../logic/interview'
import { cancelSpeech, speak } from '../speech/tts'
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
  | { type: 'retry' }
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
  /** 同じ質問で聞き直した回数 */
  attempts: number
  /** マイクが開いているか */
  micActive: boolean
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
  attempts: 0,
  micActive: false,
  error: null,
}

/** これ以上聞き直しても進まないので、画面入力を促す回数 */
const MAX_VOICE_ATTEMPTS = 3
/** 読み上げ終了からマイクを開くまでの間。自分の声を拾わないようにする */
const MIC_OPEN_DELAY_MS = 300

/**
 * 聞き直しが続いたら、画面入力もできることを伝える。
 * 何を聞かれているのかを見失わないよう、質問文は必ず後ろに残す。
 */
function withTouchHint(question: Question, lead: string, attempts: number): string {
  if (attempts < MAX_VOICE_ATTEMPTS) return lead
  return `${lead} 画面のボタンからも入力できます。${question.rePrompt ?? question.prompt}`
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

  /** アバターにしゃべらせる */
  const say = useCallback(
    async (text: string, phase: Phase) => {
      ensureRunning()
      const step = new AbortController()
      stepAbortRef.current = step
      patch({ phase, caption: text, interim: '', micActive: false })
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

  /** 復唱して「はい / いいえ」を聞く。true なら確定 */
  const confirmAnswer = useCallback(
    async (question: Question, answer: Answer): Promise<boolean> => {
      await say(confirmSentence(question, answer), 'confirming')
      await sleep(MIC_OPEN_DELAY_MS, runAbortRef.current?.signal)

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const outcome = await listenOrCommand(question)
        if (outcome.via === 'command') {
          if (outcome.command.type === 'stop') throw new StoppedError()
          // 確認中の画面操作は「訂正したい」とみなす
          queuedCommandsRef.current.unshift(outcome.command)
          return false
        }
        if (outcome.transcript === null) {
          // 無言は「そのとおり」とみなさず、もう一度だけ聞く
          if (attempt === 0) {
            await say('あっていたら「はい」、ちがったら「いいえ」と言ってください。', 'confirming')
            await sleep(MIC_OPEN_DELAY_MS, runAbortRef.current?.signal)
            continue
          }
          return true
        }
        const yes = parseYesNo(outcome.transcript)
        if (yes === true) return true
        if (yes === false) return false
        await say('あっていたら「はい」、ちがったら「いいえ」と言ってください。', 'confirming')
        await sleep(MIC_OPEN_DELAY_MS, runAbortRef.current?.signal)
      }
      return true
    },
    [listenOrCommand, say],
  )

  /** 1 問ぶんの聞き取り。null なら中断 */
  const askQuestion = useCallback(
    async (question: Question, index: number): Promise<Answer> => {
      patch({ index, question, attempts: 0, notice: '', error: null })
      let attempts = 0
      let prompt = question.prompt

      // eslint-disable-next-line no-constant-condition
      while (true) {
        await say(prompt, 'asking')
        await sleep(MIC_OPEN_DELAY_MS, runAbortRef.current?.signal)
        ensureRunning()

        const outcome = await listenOrCommand(question)

        if (outcome.via === 'command') {
          const { command } = outcome
          if (command.type === 'stop') throw new StoppedError()
          if (command.type === 'repeat') {
            prompt = question.prompt
            continue
          }
          if (command.type === 'retry') {
            prompt = question.rePrompt ?? question.prompt
            continue
          }
          if (command.type === 'skip') {
            await say('わかりました。この質問はとばしますね。', 'thinking')
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
          await say(`${command.text} ですね。ありがとう。`, 'thinking')
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
            await say('うまく聞き取れないみたいです。画面から入力してください。', 'thinking')
            // 何を聞かれているか分からなくならないよう、字幕は質問に戻しておく
            patch({ caption: question.prompt })
            const command = await nextCommand()
            queuedCommandsRef.current.unshift(command)
            prompt = question.rePrompt ?? question.prompt
            continue
          }
          prompt = withTouchHint(question, question.rePrompt ?? question.prompt, attempts)
          continue
        }

        patch({ phase: 'thinking', notice: '' })
        const parsed = parseAnswer(question, outcome.transcript)

        if (parsed.status === 'repeat') {
          prompt = question.prompt
          continue
        }
        if (parsed.status === 'skip') {
          await say('わかりました。この質問はとばしますね。', 'thinking')
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
          prompt = withTouchHint(question, parsed.reason, attempts)
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
          (question.confirm ?? ['score', 'grade', 'choice'].includes(question.kind))

        if (!needsConfirm) return answer
        if (await confirmAnswer(question, answer)) return answer

        attempts = 0
        patch({ attempts, notice: '言い直してください。' })
        prompt = question.rePrompt ?? question.prompt
      }
    },
    [confirmAnswer, ensureRunning, listenOrCommand, nextCommand, patch, say],
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
        await say(currentScenario.greeting, 'greeting')

        for (const [index, question] of currentScenario.questions.entries()) {
          const answer = await askQuestion(question, index)
          session.answers.push(answer)
          patch({ answers: [...session.answers] })
        }

        await say(currentScenario.closing, 'closing')
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
      /** すぐに聞き直す */
      retry: () => sendCommand({ type: 'retry' }),
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
