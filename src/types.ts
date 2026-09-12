/** アプリ全体で共有する型定義 */

/** 質問の回答形式 */
export type AnswerKind =
  /** 定期テストの得点（0〜満点の整数） */
  | 'score'
  /** 通知表の評定（1〜5 の整数） */
  | 'grade'
  /** 選択肢から 1 つ選ぶ */
  | 'choice'
  /** はい / いいえ */
  | 'yesno'
  /** 自由記述（聞き取った文章をそのまま残す） */
  | 'free'

/** シナリオ中の 1 問 */
export interface Question {
  /** 一意な ID。結果の保存キーにもなる */
  id: string
  /** 章立て（結果画面のグルーピングに使う） */
  section: string
  /** アバターが読み上げる文章 */
  prompt: string
  /** 画面に大きく表示する短い見出し（省略時は prompt を使う） */
  label?: string
  kind: AnswerKind
  /** score のときの満点。既定は 100 */
  maxScore?: number
  /** choice のときの選択肢 */
  choices?: string[]
  /** 聞き取れなかったときにアバターが言い直す文章 */
  rePrompt?: string
  /** 復唱して確認するか。既定は score / grade / choice で true */
  confirm?: boolean
  /** この質問を飛ばしてよいか（「わからない」を許可する） */
  skippable?: boolean
  /** 用意した音声のファイル名（拡張子なし）。無ければ読み上げにまわる */
  audio?: string
  /** 言い直しの音声のファイル名 */
  audioAgain?: string
}

/** 面談シナリオ */
export interface Scenario {
  id: string
  title: string
  /** 開始時の挨拶 */
  greeting: string
  /** 終了時のあいさつ */
  closing: string
  questions: Question[]
}

/** 1 問ぶんの回答 */
export interface Answer {
  questionId: string
  /** 数値回答（score / grade） */
  value?: number
  /** 文字列回答（free / choice / yesno は 'はい' | 'いいえ'） */
  text?: string
  /** 実際に聞き取れた生の音声認識結果 */
  transcript?: string
  /** 音声ではなく画面タップで入力された */
  viaTouch: boolean
  /** 「わからない」等でスキップした */
  skipped: boolean
  answeredAt: string
}

/** 1 回の面談セッション */
export interface Session {
  id: string
  scenarioId: string
  studentName: string
  startedAt: string
  finishedAt?: string
  /** 実施時点の質問。設定を変えても過去の記録が崩れないよう控えておく */
  questions: Question[]
  answers: Answer[]
}

/** アバターの表示状態 */
export type AvatarMood = 'idle' | 'speaking' | 'listening' | 'thinking' | 'happy' | 'confused'
