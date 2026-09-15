/**
 * 「この回はどう返すか」を決める。
 *
 * 毎回「相手の言葉をなぞる ＋ 新しい質問」だと、会話が一本調子になる。
 * そこで、回ごとに返し方の型を変える。
 *
 * **乱数は使わない。** 何回目かで決まるので、同じ流れなら同じ型になり、
 * 単体テストで確かめられる（`__tests__/replyStyle.test.ts`）。
 * つなぎ言葉の場面判定と同じ考え方。
 */

export type ReplyStyle =
  /** 話を引き出す短い質問を 1 つ返す */
  | 'question'
  /** 質問はせず、自分のことを一言そえる */
  | 'self'
  /** 質問はせず、短く受けとめるだけ */
  | 'echo'
  /** 生徒から聞かれたので、まず答える */
  | 'answer'
  /** このセットの最後。話を広げずに締める */
  | 'closing'

/**
 * 2 回目以降のくり返し。
 * 質問が多すぎず、少なすぎないところ（およそ半分）に落としてある。
 */
const CYCLE: ReplyStyle[] = ['question', 'self', 'question', 'echo']

export interface ReplyStyleInput {
  /**
   * これまでにアバターが話した回数。
   * 最初のひとことも 1 回に数える（会話の始まりでは 1）
   */
  aiTurns: number
  /** 生徒の発言の場面。「質問」なら、まず答える */
  scene?: string | null
  /**
   * このやりとりでセットを締めくくるか。
   * 何回で 1 セットにするかは、会話を進めているブラウザ側が決める
   */
  closing?: boolean
  /**
   * 返し方の決め打ち。
   * コーチングタイムでは、話題の最後を受けとめだけにして、
   * 次の質問を決まった文言で読み上げるために使う
   */
  forced?: ReplyStyle | null
}

export function chooseReplyStyle({ aiTurns, scene, closing, forced }: ReplyStyleInput): ReplyStyle {
  // 決め打ちがあれば、それに従う。進行を持っている側の指図が最優先
  if (forced) return forced
  // セットの最後は、聞かれていても締めにまわす
  // （聞かれたことには、締めの言葉の中で答えさせる）
  if (closing) return 'closing'
  // 聞かれたことには答える。型のくり返しより優先する
  if (scene === '質問') return 'answer'

  // これから作るのが何回目の返事か（最初のひとことのあとが 0）
  const index = Math.max(0, aiTurns - 1)
  // はじめのうちは、まず生徒の話を引き出す
  if (index === 0) return 'question'
  return CYCLE[(index - 1) % CYCLE.length]!
}
