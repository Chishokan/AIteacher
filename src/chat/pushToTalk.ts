import { getRecognitionCtor } from '../speech/stt'

/**
 * 「押して話す」ための音声認識。
 *
 * 既存の聞き取り（src/speech/stt.ts の listen）とは別物にしている。
 * あちらは「一定時間しゃべらなければ打ち切る」が、雑談では
 * 生徒が押すまで待ちたいので、時間による打ち切りを入れない。
 */

export type PushToTalkResult =
  /** 聞き取れた */
  | { status: 'ok'; transcript: string }
  /** 何も聞き取れなかった。アバターは話さず、押し直してもらう */
  | { status: 'empty' }
  | { status: 'error'; code: string; message: string }

export interface PushToTalkHandle {
  /** 生徒がもう一度押したときに呼ぶ。確定して result が解決する */
  stop: () => void
  result: Promise<PushToTalkResult>
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'マイクの使用が許可されていません。ブラウザの設定で許可してください。',
  'service-not-allowed': 'マイクの使用が許可されていません。ブラウザの設定を確認してください。',
  'audio-capture': 'マイクが見つかりません。接続を確認してください。',
  network: 'ネットワークにつながらないため、聞き取りができませんでした。',
  'language-not-supported': 'この端末では日本語の聞き取りが使えません。',
}

/**
 * マイクを開く。かならず画面のタップの中から呼ぶこと。
 * 生徒がもう一度押すか、ブラウザが発話の切れ目を見つけた時点で確定する。
 */
export function startPushToTalk(onInterim?: (text: string) => void): PushToTalkHandle {
  const Ctor = getRecognitionCtor()
  if (!Ctor) {
    return {
      stop: () => {},
      result: Promise.resolve({
        status: 'error',
        code: 'unsupported',
        message: 'このブラウザは音声の聞き取りに対応していません。',
      }),
    }
  }

  const recognition = new Ctor()
  recognition.lang = 'ja-JP'
  // iOS では continuous を立てると結果が伸び続けるため、1 発話ずつ確定させる
  recognition.continuous = false
  recognition.interimResults = true
  recognition.maxAlternatives = 3

  let settled = false
  let best = ''
  let resolveResult: (result: PushToTalkResult) => void = () => {}
  const result = new Promise<PushToTalkResult>((resolve) => {
    resolveResult = resolve
  })

  const settle = (value: PushToTalkResult) => {
    if (settled) return
    settled = true
    recognition.onresult = null
    recognition.onerror = null
    recognition.onend = null
    resolveResult(value)
  }

  recognition.onresult = (event) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const item = event.results[i]
      const top = item?.[0]
      if (!item || !top) continue
      if (item.isFinal) best = `${best}${top.transcript}`.trim()
      else interim += top.transcript
    }
    if (interim) onInterim?.(interim.trim())
  }

  recognition.onerror = (event) => {
    if (event.error === 'aborted') return
    if (event.error === 'no-speech') {
      settle({ status: 'empty' })
      return
    }
    settle({
      status: 'error',
      code: event.error,
      message: ERROR_MESSAGES[event.error] ?? `聞き取りに失敗しました（${event.error}）`,
    })
  }

  recognition.onend = () => {
    settle(best ? { status: 'ok', transcript: best } : { status: 'empty' })
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

  return {
    stop: () => {
      try {
        recognition.stop()
      } catch {
        // すでに止まっている場合は onend が処理する
      }
    },
    result,
  }
}
