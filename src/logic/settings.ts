import { DEFAULT_AVATAR_ID } from '../data/avatarPresets'
import { DEFAULT_REPORT_SUBJECTS, DEFAULT_TEST_SUBJECTS } from '../data/scenario'

export interface Settings {
  /** 面談の名前 */
  title: string
  testSubjects: string[]
  reportSubjects: string[]
  maxScore: number
  /** 読み上げの速さ */
  rate: number
  /** 声の高さ */
  pitch: number
  /** 使用する音声の voiceURI（未設定なら自動選択） */
  voiceURI?: string
  /** 話し始めるまでの待ち時間（秒） */
  listenTimeoutSec: number
  /** 復唱して確認するか */
  confirmAnswers: boolean
  /** アバターの見た目（AVATAR_PRESETS の id） */
  avatarId: string
  /** 通知表の評定も聞く */
  includeReport: boolean
  /** ふりかえり（手ごたえ・理由）も聞く */
  includeReview: boolean
  /** 次の目標も聞く */
  includeGoal: boolean

  // ---- 雑談（定期テストの聞き取りとは独立した機能） ----
  /** 雑談メニューを使えるようにする */
  chatEnabled: boolean
  /** 雑談の最初のひとこと */
  chatOpening: string
  /** 返事をサーバー（Claude）に作ってもらう。切るとダミーの固定文で動作だけ試せる */
  chatUseApi: boolean
}

export const defaultSettings: Settings = {
  title: '成績ヒアリング',
  testSubjects: [...DEFAULT_TEST_SUBJECTS],
  reportSubjects: [...DEFAULT_REPORT_SUBJECTS],
  maxScore: 100,
  rate: 1.0,
  pitch: 1.1,
  listenTimeoutSec: 8,
  confirmAnswers: true,
  avatarId: DEFAULT_AVATAR_ID,
  // まずは定期テストの聞き取りだけで運用する。必要になったら設定で足す
  includeReport: false,
  includeReview: false,
  includeGoal: false,

  chatEnabled: true,
  chatOpening: 'こんにちは。今日はどんな一日だった？',
  chatUseApi: true,
}
