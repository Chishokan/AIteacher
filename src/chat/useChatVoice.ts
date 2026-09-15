import { useEffect, useMemo, useState } from 'react'
import { createAivisVoice, createBrowserVoice, type Voice } from './voice'
import { allFillerLines } from './fillers'
import { readyTexts } from './prebuiltClips'
import type { Settings } from '../logic/settings'

/**
 * 話す声と、つなぎ言葉の準備。
 *
 * 雑談（`ChatScreen`）とコーチングタイム（`CoachingScreen`）で同じものを使う。
 * どちらも設定の `chat*` をそのまま使い、声の作り方は変えない。
 */

export interface ChatVoices {
  /** 本命の声。設定しだいで AivisSpeech かブラウザの読み上げ */
  voice: Voice
  /** 本命が使えなかったときの受け皿 */
  browserVoice: Voice
  /** その文言の音声が用意できているか（つなぎ言葉に使う） */
  isFillerReady: (text: string) => boolean
}

export function useChatVoice(settings: Settings, studentName?: string): ChatVoices {
  const browserVoice = useMemo(
    () => createBrowserVoice(settings.rate, settings.pitch, settings.voiceURI),
    [settings.pitch, settings.rate, settings.voiceURI],
  )

  const usingBrowserVoice = settings.chatVoiceMode === 'browser'

  const voice = useMemo(() => {
    if (usingBrowserVoice) return browserVoice
    return createAivisVoice({
      speaker: settings.chatVoiceSpeaker,
      style: settings.chatVoiceStyle,
      speedScale: settings.chatSpeedScale,
      pitchScale: settings.chatPitchScale,
      intonationScale: settings.chatIntonationScale,
      tempoDynamicsScale: settings.chatTempoDynamicsScale,
    })
  }, [
    browserVoice,
    usingBrowserVoice,
    settings.chatVoiceSpeaker,
    settings.chatVoiceStyle,
    settings.chatSpeedScale,
    settings.chatPitchScale,
    settings.chatIntonationScale,
    settings.chatTempoDynamicsScale,
  ])

  /**
   * つなぎ言葉のうち、いま鳴らせるもの。
   *
   * その場で作ると逆に遅くなるので、**先に作ってあるものしか使わない**
   * （引き継ぎ仕様 3.2 の 6）。ただしブラウザの読み上げは待ち時間がないので、
   * そのときは全部使ってよい。
   */
  const [readyFillers, setReadyFillers] = useState<Set<string> | null>(null)

  useEffect(() => {
    if (usingBrowserVoice) {
      setReadyFillers(null)
      return
    }
    let active = true
    const texts = allFillerLines(studentName).map((line) => line.text)
    void readyTexts(texts, {
      speaker: settings.chatVoiceSpeaker,
      style: settings.chatVoiceStyle,
      speedScale: settings.chatSpeedScale,
      pitchScale: settings.chatPitchScale,
      intonationScale: settings.chatIntonationScale,
      tempoDynamicsScale: settings.chatTempoDynamicsScale,
    }).then((ready) => {
      if (active) setReadyFillers(ready)
    })
    return () => {
      active = false
    }
  }, [
    studentName,
    usingBrowserVoice,
    settings.chatVoiceSpeaker,
    settings.chatVoiceStyle,
    settings.chatSpeedScale,
    settings.chatPitchScale,
    settings.chatIntonationScale,
    settings.chatTempoDynamicsScale,
  ])

  const isFillerReady = useMemo(() => {
    if (usingBrowserVoice) return () => true
    const ready = readyFillers
    return (text: string) => ready?.has(text) ?? false
  }, [readyFillers, usingBrowserVoice])

  return { voice, browserVoice, isFillerReady }
}
