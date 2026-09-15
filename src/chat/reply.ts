import type { ChatTurn } from './types'

/**
 * 返事の文を作るところ。
 *
 * ステップ 1 ではダミー。ステップ 2 で /api/voice-chat（Claude）に差し替える。
 * 差し替えても画面と進行の作りが変わらないよう、ここで境目を切っている。
 */

export type ReplyResult =
  | { status: 'ok'; text: string }
  /** 会話は続けてよいエラー（混雑・1分の上限など） */
  | { status: 'retryable'; message: string }
  /** 会話を止めるエラー（キーの誤りなど） */
  | { status: 'fatal'; message: string }

export interface RespondOptions {
  signal?: AbortSignal
  /**
   * すでに声に出したつなぎ言葉。
   * 渡すと「その続きだけを書いて」と伝わり、二重の相槌にならない（引き継ぎ仕様 3.2 の 4）
   */
  filler?: string | null
  /**
   * 生徒の発言の場面（つなぎ言葉の判定と同じもの）。
   * 「質問」なら、サーバー側で「まず答える」返し方に切り替わる
   */
  scene?: string | null
  /**
   * このやりとりで 1 セットを締めくくるか。
   * true だと、話を広げずに「またね」で終える返事になる
   */
  closing?: boolean
  /**
   * いま聞いている話題（コーチングタイムの質問）。
   * 渡すと、その話題から離れない返事になる
   */
  topic?: string | null
  /**
   * 返し方を決め打ちにする。
   * 'echo' だと質問をせず受けとめるだけになる。
   * 次の質問をこちらが決まった文言で言うときに使う
   */
  style?: 'echo' | null
  /**
   * 名簿から分かっている事実。
   * アバターはここに書いたことにしか触れない
   */
  facts?: string[]
}

export interface ReplySource {
  respond(history: ChatTurn[], options?: RespondOptions): Promise<ReplyResult>
}

const DUMMY_REPLIES = [
  'へえ、それでどうなったの？',
  'そうなんだー。誰と行ったの？',
  'いいねー。いちばん楽しかったのはどれ？',
  'うんうん。そのあとは何をしてたの？',
  'なるほどねー。それってよくあることなの？',
]

/** ダミーの返事。返事の文を作るのにかかる時間だけ本物に似せてある */
export function createDummyReplySource(delayMs = 600): ReplySource {
  let count = 0
  return {
    async respond(_history, { signal } = {}) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, delayMs)
        function done() {
          clearTimeout(timer)
          signal?.removeEventListener('abort', done)
          resolve()
        }
        signal?.addEventListener('abort', done)
      })
      if (signal?.aborted) return { status: 'retryable', message: '中断しました' }
      const text = DUMMY_REPLIES[count % DUMMY_REPLIES.length]!
      count += 1
      return { status: 'ok', text }
    },
  }
}
