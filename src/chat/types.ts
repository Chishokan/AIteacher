/** 雑談機能の型。既存の聞き取り（src/logic 以下）とは共有しない */

/** いま何をしているか */
export type ChatPhase =
  /** 生徒が押すのを待っている */
  | 'idle'
  /** 生徒の声を聞いている */
  | 'recording'
  /** 返事を作っている */
  | 'thinking'
  /** アバターが話している */
  | 'speaking'

export interface ChatTurn {
  who: 'student' | 'ai'
  text: string
  at: number
}

/** 1 回の返事にかかった時間。「遅い」を数字で見るために残す */
export interface TurnMetrics {
  /** 生徒が話し終えてから、最初の声が出るまで */
  firstVoiceMs: number | null
  /** つなぎ言葉を言い終えてから、返事が始まるまでの沈黙 */
  gapMs: number | null
  /** 返事の文を作るのにかかった時間 */
  thinkMs: number | null
  /** 返事を音声にするのにかかった時間 */
  ttsMs: number | null
  /** つなぎ言葉を鳴らした回数 */
  fillerCount: number
  /** つなぎ言葉の場面 */
  fillerScene: string | null
  /** つなぎ言葉を使わなかった理由 */
  fillerSkipReason: string | null
}

export function emptyMetrics(): TurnMetrics {
  return {
    firstVoiceMs: null,
    gapMs: null,
    thinkMs: null,
    ttsMs: null,
    fillerCount: 0,
    fillerScene: null,
    fillerSkipReason: null,
  }
}
