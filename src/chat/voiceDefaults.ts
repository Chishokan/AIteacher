import type { PrebuiltVoice } from './prebuiltClips'

/**
 * 雑談の声の初期値。
 *
 * ここだけは他のファイルを読み込まないようにしてある。
 * 事前生成のスクリプト（scripts/gen-chat-audio.mjs）が Node から直に読むため、
 * 画面まわりを巻き込むと動かせなくなる。
 */

/** 雑談の最初のひとこと */
export const DEFAULT_CHAT_OPENING = 'こんにちは。今日はどんな一日だった？'

/** AivisSpeech に渡す声の初期値 */
export const DEFAULT_CHAT_VOICE: PrebuiltVoice = {
  speaker: 'まお',
  style: 'おちつき',
  speedScale: 1.0,
  // 0 から動かすと音が荒れることがある
  pitchScale: 0.0,
  intonationScale: 1.0,
  tempoDynamicsScale: 1.0,
}
