/**
 * マイクの使用許可をあつかう。
 *
 * 音声認識（SpeechRecognition）は、読み上げが終わってから始まるため、
 * 画面をタップしてから 20 秒ほど経つ。ブラウザが「ユーザー操作の直後」と
 * みなす時間（Chrome では 5 秒）を過ぎているので、そのままでは許可を聞く
 * ダイアログが出ないまま「不許可」で進んでしまう。
 *
 * そこで、はじめるボタンを押したその場で getUserMedia を呼び、
 * 許可を取ってしまう。一度許可されればサイトごとに覚えられるので、
 * あとから始まる音声認識もダイアログなしで動く。
 */

export type MicStatus =
  /** 使える */
  | 'granted'
  /** 拒否された、またはブラウザの設定で止められている */
  | 'denied'
  /** マイクが見つからない */
  | 'unavailable'
  /** https でないため使えない */
  | 'insecure'
  /** このブラウザでは確認できない（そのまま進めてよい） */
  | 'unsupported'

export const MIC_MESSAGES: Record<Exclude<MicStatus, 'granted' | 'unsupported'>, string> = {
  denied: 'マイクの使用が許可されていません。ブラウザの設定でマイクを「許可」にして、ページを開き直してください。',
  unavailable: 'マイクが見つかりません。接続を確認してください。',
  insecure: 'このページは https で開かないとマイクが使えません。',
}

/**
 * マイクの使用許可を求める。
 * かならず画面のタップなど、ユーザー操作の中から呼ぶこと。
 */
export async function requestMicrophone(): Promise<MicStatus> {
  if (typeof window === 'undefined') return 'unsupported'
  if (!window.isSecureContext) return 'insecure'
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported'

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    // 許可さえ取れればよい。録音は音声認識の側が改めて開くので、すぐ閉じる
    for (const track of stream.getTracks()) track.stop()
    return 'granted'
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'unavailable'
    return 'unsupported'
  }
}

/**
 * いまの許可の状態を、ダイアログを出さずに調べる。
 * 対応していないブラウザでは 'unsupported' を返す。
 */
export async function checkMicrophone(): Promise<MicStatus> {
  if (typeof window === 'undefined') return 'unsupported'
  if (!window.isSecureContext) return 'insecure'
  if (!navigator.permissions?.query) return 'unsupported'

  try {
    // microphone は一部のブラウザにしかないため、型の上でも指定しておく
    const status = await navigator.permissions.query({
      name: 'microphone' as PermissionName,
    })
    if (status.state === 'granted') return 'granted'
    if (status.state === 'denied') return 'denied'
    return 'unsupported'
  } catch {
    return 'unsupported'
  }
}
