import type { ReplySource, ReplyResult } from './reply'
import type { ChatTurn } from './types'

/**
 * 返事の文をサーバーに作ってもらう。
 *
 * API キーはサーバー側だけが持つ。ブラウザからは直接 Claude を呼ばない。
 */

const ENDPOINT = '/api/voice-chat'

/** 雑談か、コーチングタイムか。サーバー側で指示文が変わる */
export type ChatMode = 'chat' | 'coaching'

interface ServerResponse {
  ok: boolean
  text?: string
  kind?: 'retryable' | 'fatal'
  message?: string
}

/** @param mode 省略すると雑談 */
export function createApiReplySource(mode: ChatMode = 'chat'): ReplySource {
  return {
    async respond(
      history: ChatTurn[],
      { signal, filler, scene, closing, topic, style, facts } = {},
    ): Promise<ReplyResult> {
      let response: Response
      try {
        response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            turns: history.map((turn) => ({ who: turn.who, text: turn.text })),
            // すでに声に出した前置き。続きだけを書かせる
            filler: filler ?? null,
            // 「質問」ならサーバー側で「まず答える」返し方になる
            scene: scene ?? null,
            // 1 セットの最後。話を広げずに締めさせる
            closing: closing ?? false,
            // コーチングタイムで聞いている話題と、返し方の決め打ち
            mode,
            topic: topic ?? null,
            style: style ?? null,
            // 名簿から分かっていること。ここに無いことは言わせない
            facts: facts ?? [],
          }),
          signal,
        })
      } catch (error) {
        if (signal?.aborted) return { status: 'retryable', message: '中断しました' }
        return {
          status: 'retryable',
          message: '接続できませんでした。もう一度話しかけてください。',
        }
      }

      // 開発サーバーが動いていないと、API のパスに index.html が返ってくる
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        return {
          status: 'fatal',
          message: '雑談のサーバーが動いていません。npm run dev で起動してください。',
        }
      }

      let body: ServerResponse
      try {
        body = (await response.json()) as ServerResponse
      } catch {
        return { status: 'retryable', message: '返事を読み取れませんでした。もう一度話しかけてください。' }
      }

      if (body.ok && body.text) return { status: 'ok', text: body.text }
      return {
        status: body.kind === 'fatal' ? 'fatal' : 'retryable',
        message: body.message ?? 'うまく返事が作れませんでした。',
      }
    },
  }
}
