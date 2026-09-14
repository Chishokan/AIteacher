import { speak } from '../speech/tts'
import { playAudio } from './audioPlayer'
import { fetchPrebuiltAudio } from './prebuiltClips'

/**
 * 返事をしゃべるところ。
 *
 * PC で動かしている AivisSpeech に作ってもらうのが本命。
 * つながらないときはブラウザの読み上げに落として、会話は続けられるようにする。
 *
 * 毎回同じ文言（最初のひとこと、つなぎ言葉）は、先に作って置いてあれば
 * そちらを鳴らす。その場で作ると数秒かかるため。
 */

export interface SpeakOptions {
  /** 実際に音が出はじめた時点で呼ばれる */
  onFirstVoice?: () => void
  signal?: AbortSignal
}

export type SpeakOutcome =
  /**
   * 鳴った。
   * @property ttsMs 音声を用意するのにかかった時間
   * @property prebuilt 事前に作っておいたものを鳴らしたか
   */
  | { status: 'ok'; ttsMs: number; prebuilt: boolean }
  /** 鳴らせなかった。message を画面に出す */
  | { status: 'failed'; message: string }

export interface Voice {
  speak(text: string, options?: SpeakOptions): Promise<SpeakOutcome>
}

export interface AivisVoiceSettings {
  speaker: string
  style: string
  speedScale: number
  pitchScale: number
  intonationScale: number
  tempoDynamicsScale: number
}

/** PC の AivisSpeech に作ってもらう */
export function createAivisVoice(settings: AivisVoiceSettings): Voice {
  return {
    async speak(text, options = {}) {
      const startedAt = Date.now()

      // 先に作ってあるものは、その場で合成せずに鳴らす（待ち時間ゼロ）。
      // 声や速さを変えたあとは見つからないので、下の合成に落ちる
      const ready = await fetchPrebuiltAudio(text, settings, options.signal)
      if (ready) {
        const ttsMs = Date.now() - startedAt
        try {
          await playAudio(ready, options.onFirstVoice, options.signal)
        } catch {
          return { status: 'failed', message: '音声を鳴らせませんでした。' }
        }
        return { status: 'ok', ttsMs, prebuilt: true }
      }

      let response: Response
      try {
        response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            text,
            speaker: settings.speaker,
            style: settings.style,
            params: {
              speedScale: settings.speedScale,
              pitchScale: settings.pitchScale,
              intonationScale: settings.intonationScale,
              tempoDynamicsScale: settings.tempoDynamicsScale,
            },
          }),
          signal: options.signal,
        })
      } catch {
        if (options.signal?.aborted) return { status: 'ok', ttsMs: 0, prebuilt: false }
        return { status: 'failed', message: '音声を作るところにつながりませんでした。' }
      }

      const contentType = response.headers.get('content-type') ?? ''
      if (!response.ok || !contentType.startsWith('audio/')) {
        // 開発サーバーが動いていないと、ここに index.html が返ってくる
        if (contentType.includes('text/html')) {
          return {
            status: 'failed',
            message: '雑談のサーバーが動いていません。npm run dev で起動してください。',
          }
        }
        let message = '音声を作れませんでした。'
        try {
          const body = (await response.json()) as { message?: string }
          if (body.message) message = body.message
        } catch {
          // JSON でなければ既定の文言のまま
        }
        return { status: 'failed', message }
      }

      const data = await response.arrayBuffer()
      const ttsMs = Date.now() - startedAt
      try {
        await playAudio(data, options.onFirstVoice, options.signal)
      } catch {
        return { status: 'failed', message: '音声を鳴らせませんでした。' }
      }
      return { status: 'ok', ttsMs, prebuilt: false }
    },
  }
}

/** ブラウザの読み上げ。AivisSpeech が使えないときの受け皿 */
export function createBrowserVoice(rate?: number, pitch?: number, voiceURI?: string): Voice {
  return {
    async speak(text, options = {}) {
      const startedAt = Date.now()
      let ttsMs = 0
      try {
        await speak(text, {
          rate,
          pitch,
          voiceURI,
          signal: options.signal,
          onStart: () => {
            ttsMs = Date.now() - startedAt
            options.onFirstVoice?.()
          },
        })
      } catch {
        return { status: 'failed', message: '読み上げができませんでした。' }
      }
      return { status: 'ok', ttsMs, prebuilt: false }
    },
  }
}
