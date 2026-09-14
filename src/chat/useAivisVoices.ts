import { useEffect, useState } from 'react'

/** 設定画面に出す、AivisSpeech の声の一覧 */
export interface VoiceChoice {
  label: string
  speaker: string
  style: string
}

interface State {
  voices: VoiceChoice[]
  /** つながらないときの案内 */
  problem: string | null
  loading: boolean
}

/**
 * PC で動いている AivisSpeech から、使える声を取ってくる。
 * 起動していなければ、その旨を返す（設定画面はそのまま開ける）。
 */
export function useAivisVoices(): State {
  const [state, setState] = useState<State>({ voices: [], problem: null, loading: true })

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const response = await fetch('/api/tts/voices')
        const contentType = response.headers.get('content-type') ?? ''
        if (!contentType.includes('application/json')) {
          throw new Error('開発サーバーが動いていません')
        }
        const body = (await response.json()) as { ok: boolean; voices?: VoiceChoice[]; message?: string }
        if (!active) return
        if (body.ok && body.voices?.length) {
          setState({ voices: body.voices, problem: null, loading: false })
        } else {
          setState({
            voices: [],
            problem: body.message ?? 'AivisSpeech から声の一覧を取れませんでした。',
            loading: false,
          })
        }
      } catch {
        if (!active) return
        setState({
          voices: [],
          problem:
            'AivisSpeech につながりません。AivisSpeech を起動してから、設定を開き直してください。',
          loading: false,
        })
      }
    })()
    return () => {
      active = false
    }
  }, [])

  return state
}
