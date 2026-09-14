/** SpeechRecognition（音声認識）のラッパー */

export interface ListenOptions {
  lang?: string
  /** 話し始めるまでの待ち時間（ミリ秒） */
  startTimeoutMs?: number
  /** 話し始めてから打ち切るまでの最大時間（ミリ秒） */
  maxDurationMs?: number
  /** 認識途中の文字列（確定前）を受け取る */
  onInterim?: (text: string) => void
  /** マイクが実際に開いたとき */
  onStart?: () => void
  signal?: AbortSignal
}

export type ListenResult =
  | { status: 'ok'; transcript: string; alternatives: string[]; confidence: number }
  /** 何も話されなかった */
  | { status: 'timeout' }
  /** 外から中断された */
  | { status: 'aborted' }
  | { status: 'error'; code: string; message: string }

export function getRecognitionCtor(): { new (): SpeechRecognition } | undefined {
  if (typeof window === 'undefined') return undefined
  return window.SpeechRecognition ?? window.webkitSpeechRecognition
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionCtor() !== undefined
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'マイクの使用が許可されていません。ブラウザの設定でマイクを許可してください。',
  'service-not-allowed': 'マイクの使用が許可されていません。ブラウザの設定を確認してください。',
  'audio-capture': 'マイクが見つかりません。接続を確認してください。',
  network: 'ネットワークにつながらないため、音声認識ができませんでした。',
  'language-not-supported': 'この端末では日本語の音声認識が使えません。',
}

/**
 * マイクを開いて 1 回ぶんの発話を聞き取る。
 * 例外は投げず、必ず ListenResult を返す。
 */
export function listen(options: ListenOptions = {}): Promise<ListenResult> {
  const Ctor = getRecognitionCtor()
  if (!Ctor) {
    return Promise.resolve({
      status: 'error',
      code: 'unsupported',
      message: 'このブラウザは音声認識に対応していません。',
    })
  }

  const {
    lang = 'ja-JP',
    startTimeoutMs = 8000,
    maxDurationMs = 20_000,
    onInterim,
    onStart,
    signal,
  } = options

  return new Promise<ListenResult>((resolve) => {
    const recognition = new Ctor()
    recognition.lang = lang
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 3

    let settled = false
    let heardSpeech = false
    let best: { transcript: string; alternatives: string[]; confidence: number } | null = null
    let startTimer: ReturnType<typeof setTimeout> | undefined
    let durationTimer: ReturnType<typeof setTimeout> | undefined

    const cleanup = () => {
      clearTimeout(startTimer)
      clearTimeout(durationTimer)
      signal?.removeEventListener('abort', onAbort)
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      recognition.onstart = null
      recognition.onspeechstart = null
    }

    const settle = (result: ListenResult) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    const stopAndSettle = (result: ListenResult) => {
      // 先に結果を確定させる。abort() が同期的に onerror を呼ぶ実装があり、
      // 順序を逆にすると 'aborted' が本来の結果を上書きしてしまう
      settle(result)
      try {
        recognition.abort()
      } catch {
        // 既に停止している場合は無視する
      }
    }

    function onAbort() {
      stopAndSettle({ status: 'aborted' })
    }

    if (signal?.aborted) {
      resolve({ status: 'aborted' })
      return
    }
    signal?.addEventListener('abort', onAbort)

    recognition.onstart = () => {
      onStart?.()
      startTimer = setTimeout(() => {
        if (!heardSpeech) stopAndSettle({ status: 'timeout' })
      }, startTimeoutMs)
      durationTimer = setTimeout(() => {
        // 話し続けている場合はここまでで打ち切り、途中経過を答えとして使う
        if (best) stopAndSettle({ status: 'ok', ...best })
        else stopAndSettle({ status: 'timeout' })
      }, maxDurationMs)
    }

    recognition.onspeechstart = () => {
      heardSpeech = true
      clearTimeout(startTimer)
    }

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (!result) continue
        const top = result[0]
        if (!top) continue

        if (result.isFinal) {
          heardSpeech = true
          const alternatives: string[] = []
          for (let j = 0; j < result.length; j += 1) {
            const alt = result[j]
            if (alt) alternatives.push(alt.transcript.trim())
          }
          best = {
            transcript: top.transcript.trim(),
            alternatives,
            confidence: top.confidence,
          }
        } else {
          heardSpeech = true
          interim += top.transcript
        }
      }
      if (interim) onInterim?.(interim.trim())
      if (best) stopAndSettle({ status: 'ok', ...best })
    }

    recognition.onerror = (event) => {
      if (event.error === 'aborted') {
        // abort() 由来。すでに settle 済みのことが多い
        settle({ status: 'aborted' })
        return
      }
      if (event.error === 'no-speech') {
        settle({ status: 'timeout' })
        return
      }
      settle({
        status: 'error',
        code: event.error,
        message: ERROR_MESSAGES[event.error] ?? `音声認識に失敗しました（${event.error}）`,
      })
    }

    recognition.onend = () => {
      // 確定結果が来ないまま終了した場合の保険
      if (best) settle({ status: 'ok', ...best })
      else settle({ status: 'timeout' })
    }

    try {
      recognition.start()
    } catch (error) {
      settle({
        status: 'error',
        code: 'start-failed',
        message: error instanceof Error ? error.message : 'マイクを開けませんでした。',
      })
    }
  })
}
