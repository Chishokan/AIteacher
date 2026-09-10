import { useEffect, useState } from 'react'
import { japaneseVoices, loadVoices } from '../speech/tts'

/** 利用可能な日本語音声の一覧を返す */
export function useJapaneseVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    let active = true
    void loadVoices().then((all) => {
      if (active) setVoices(japaneseVoices(all))
    })
    return () => {
      active = false
    }
  }, [])

  return voices
}
