import { DEFAULT_AVATAR_ID } from '../data/avatarPresets'
import { DEFAULT_REPORT_SUBJECTS, DEFAULT_TEST_SUBJECTS } from '../data/scenario'
import { DEFAULT_CHAT_OPENING, DEFAULT_CHAT_VOICE } from '../chat/voiceDefaults'

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
  /** コーチングタイムの聞き取りを使えるようにする（東進高校生部門） */
  coachingEnabled: boolean
  /** 雑談の最初のひとこと */
  chatOpening: string
  /** 返事をサーバー（Claude）に作ってもらう。切るとダミーの固定文で動作だけ試せる */
  chatUseApi: boolean
  /** つなぎ言葉で沈黙を埋める。切ると返事ができるまで黙る */
  chatFillerEnabled: boolean
  /** 何回のやりとりで 1 セットにするか。話し終えるとアバターが締める */
  chatTurnsPerSet: number
  /** 返事の声。PC で動かしている AivisSpeech を使うか、ブラウザの読み上げか */
  chatVoiceMode: 'aivis' | 'browser'
  /** AivisSpeech の声（例: まお） */
  chatVoiceSpeaker: string
  /** そのスタイル（例: おちつき） */
  chatVoiceStyle: string
  /** 話す速さ */
  chatSpeedScale: number
  /** 声の高さ。0 から動かすと音が荒れることがある */
  chatPitchScale: number
  /** 抑揚の強さ（AivisSpeech では「感情表現の強さ」） */
  chatIntonationScale: number
  /** 抑揚の動き。上げると早口で生っぽくなる */
  chatTempoDynamicsScale: number
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
  coachingEnabled: true,
  // 声まわりの初期値は src/chat/voiceDefaults.ts に置いてある。
  // 事前生成のスクリプトが Node から同じ値を読めるようにするため
  chatOpening: DEFAULT_CHAT_OPENING,
  chatUseApi: true,
  chatFillerEnabled: true,
  chatTurnsPerSet: 5,
  chatVoiceMode: 'aivis',
  chatVoiceSpeaker: DEFAULT_CHAT_VOICE.speaker,
  chatVoiceStyle: DEFAULT_CHAT_VOICE.style,
  chatSpeedScale: DEFAULT_CHAT_VOICE.speedScale,
  chatPitchScale: DEFAULT_CHAT_VOICE.pitchScale,
  chatIntonationScale: DEFAULT_CHAT_VOICE.intonationScale,
  chatTempoDynamicsScale: DEFAULT_CHAT_VOICE.tempoDynamicsScale,
}
