/** SpeechSynthesis（音声合成）のラッパー */

export interface SpeakOptions {
  /** 話す速さ。0.1〜10（既定 1.0） */
  rate?: number
  /** 声の高さ。0〜2（既定 1.1） */
  pitch?: number
  /** 音量。0〜1 */
  volume?: number
  /** 使用する音声。未指定なら日本語の音声を自動で選ぶ */
  voiceURI?: string
  /** 読み上げが実際に始まったとき */
  onStart?: () => void
  /** 中断シグナル */
  signal?: AbortSignal
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/**
 * 利用可能な音声一覧を取得する。
 * 一部のブラウザは初回が空配列を返すため、voiceschanged を待つ。
 */
export function loadVoices(timeoutMs = 3000): Promise<SpeechSynthesisVoice[]> {
  if (!isSpeechSynthesisSupported()) return Promise.resolve([])

  const current = window.speechSynthesis.getVoices()
  if (current.length > 0) return Promise.resolve(current)

  return new Promise((resolve) => {
    const finish = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', finish)
      clearTimeout(timer)
      resolve(window.speechSynthesis.getVoices())
    }
    const timer = setTimeout(finish, timeoutMs)
    window.speechSynthesis.addEventListener('voiceschanged', finish)
  })
}

/** 日本語の音声を優先度つきで返す */
export function pickJapaneseVoice(
  voices: SpeechSynthesisVoice[],
  preferredURI?: string,
): SpeechSynthesisVoice | undefined {
  if (preferredURI) {
    const preferred = voices.find((v) => v.voiceURI === preferredURI)
    if (preferred) return preferred
  }
  const japanese = voices.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('ja'))
  if (japanese.length === 0) return undefined

  // 端末内蔵の音声のほうが遅延が少なく、オフラインでも動く
  return japanese.find((v) => v.localService) ?? japanese[0]
}

export function japaneseVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('ja'))
}

/** 読み上げをすべて止める */
export function cancelSpeech(): void {
  if (!isSpeechSynthesisSupported()) return
  window.speechSynthesis.cancel()
}

/**
 * 文章を読み上げ、読み終わったら解決する Promise を返す。
 * signal で中断された場合も（エラーにせず）解決する。
 */
export function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  if (!isSpeechSynthesisSupported() || !text.trim()) return Promise.resolve()

  const synth = window.speechSynthesis
  synth.cancel() // 前の読み上げが残っていると発話が始まらない端末がある

  return new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ja-JP'
    utterance.rate = options.rate ?? 1.0
    utterance.pitch = options.pitch ?? 1.1
    utterance.volume = options.volume ?? 1.0

    const voice = pickJapaneseVoice(synth.getVoices(), options.voiceURI)
    if (voice) utterance.voice = voice

    let settled = false
    const cleanup = () => {
      clearInterval(keepAlive)
      clearTimeout(watchdog)
      options.signal?.removeEventListener('abort', onAbort)
    }
    const finish = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const onAbort = () => {
      synth.cancel()
      finish()
    }

    // Chrome は長い文章の途中で読み上げが止まることがあるため、定期的に resume する
    const keepAlive = setInterval(() => {
      if (synth.speaking && !synth.paused) {
        synth.pause()
        synth.resume()
      }
    }, 10_000)

    // 端末によっては onend も onerror も来ないことがある。
    // 読み上げに必要な時間を見積もって、それを大きく超えたら先に進む。
    const estimatedMs = (text.length / (utterance.rate || 1)) * 260 + 3000
    const watchdog = setTimeout(() => {
      synth.cancel()
      finish()
    }, Math.min(estimatedMs, 60_000))

    utterance.onstart = () => options.onStart?.()
    utterance.onend = finish
    utterance.onerror = (event) => {
      if (settled) return
      settled = true
      cleanup()
      // 中断は正常系として扱う
      if (event.error === 'interrupted' || event.error === 'canceled') resolve()
      else reject(new Error(`音声合成に失敗しました: ${event.error}`))
    }

    if (options.signal?.aborted) {
      finish()
      return
    }
    options.signal?.addEventListener('abort', onAbort)
    synth.speak(utterance)
  })
}

/**
 * iOS / Safari 対策。
 * ユーザー操作の中で一度だけ無音を読み上げて、音声合成を解禁する。
 */
export function unlockSpeechSynthesis(): void {
  if (!isSpeechSynthesisSupported()) return
  const utterance = new SpeechSynthesisUtterance(' ')
  utterance.volume = 0
  utterance.lang = 'ja-JP'
  window.speechSynthesis.speak(utterance)
}
