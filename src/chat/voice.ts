import { speak } from '../speech/tts'
import { playAudio } from './audioPlayer'

/**
 * 返事をしゃべるところ。
 *
 * PC で動かしている AivisSpeech に作ってもらうのが本命。
 * つながらないときはブラウザの読み上げに落として、会話は続けられるようにする。
 */

export interface SpeakOptions {
  /** 実際に音が出はじめた時点で呼ばれる */
  onFirstVoice?: () => void
  signal?: AbortSignal
}

export type SpeakOutcome =
  /** 鳴った。ttsMs は音声を用意するのにかかった時間 */
  | { status: 'ok'; ttsMs: number }
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
        if (options.signal?.aborted) return { status: 'ok', ttsMs: 0 }
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
      return { status: 'ok', ttsMs }
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
      return { status: 'ok', ttsMs }
    },
  }
}
