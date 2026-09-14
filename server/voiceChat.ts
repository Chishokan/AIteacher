import Anthropic from '@anthropic-ai/sdk'
import { CONVERSATION_OPENER, REFUSAL_REPLY, SYSTEM_PROMPT, turnInstruction } from './prompts'

/**
 * 雑談の返事を作る。
 *
 * フレームワークに依存しない形にしてある。いまは Vite の dev サーバーから
 * 呼んでいるが、そのまま Vercel の関数などに移せる。
 *
 * 会話の本文はログに残さない（生徒は未成年のため）。
 * 記録するのはモデル名・トークン数・かかった時間だけ。
 */

export interface VoiceChatTurn {
  who: 'student' | 'ai'
  text: string
}

export interface VoiceChatRequest {
  turns: VoiceChatTurn[]
  /** すでに声に出したつなぎ言葉（実装順 5 で使う） */
  filler?: string | null
}

export type VoiceChatResponse =
  | { ok: true; text: string }
  /** 会話は続けてよい。生徒の発言は履歴から外して「あなたの番」に戻す */
  | { ok: false; kind: 'retryable'; message: string; retryAfterSec?: number }
  /** 会話を止める */
  | { ok: false; kind: 'fatal'; message: string }

const MODEL = 'claude-sonnet-5'

function isTurn(value: unknown): value is VoiceChatTurn {
  if (typeof value !== 'object' || value === null) return false
  const turn = value as Record<string, unknown>
  return (turn.who === 'student' || turn.who === 'ai') && typeof turn.text === 'string'
}

function parseRequest(body: unknown): VoiceChatRequest | null {
  if (typeof body !== 'object' || body === null) return null
  const raw = body as Record<string, unknown>
  if (!Array.isArray(raw.turns) || !raw.turns.every(isTurn)) return null
  const filler = typeof raw.filler === 'string' && raw.filler ? raw.filler : null
  return { turns: raw.turns as VoiceChatTurn[], filler }
}

/** 会話の履歴を、API に渡す形に組み立てる */
export function buildMessages(request: VoiceChatRequest): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = []

  // messages は user から始める必要がある。アバターの最初のひとことの前に
  // 見えない一言を置いて、形をそろえる
  if (request.turns[0]?.who === 'ai') {
    messages.push({ role: 'user', content: CONVERSATION_OPENER })
  }
  for (const turn of request.turns) {
    messages.push({ role: turn.who === 'ai' ? 'assistant' : 'user', content: turn.text })
  }

  // このターンの注意は、最後の生徒の発言に足す
  const last = messages[messages.length - 1]
  if (last && last.role === 'user' && typeof last.content === 'string') {
    last.content = `${last.content}\n\n${turnInstruction(request.filler ?? null)}`
  }
  return messages
}

/** SDK の例外を、画面に出す日本語と「続けてよいか」に振り分ける */
function describeError(error: unknown): VoiceChatResponse {
  if (error instanceof Anthropic.AuthenticationError) {
    return { ok: false, kind: 'fatal', message: 'APIキーが正しくありません。' }
  }
  if (error instanceof Anthropic.NotFoundError) {
    return { ok: false, kind: 'fatal', message: 'モデル名が見つかりません。' }
  }
  if (error instanceof Anthropic.RateLimitError) {
    // 今月の上限に達した場合は、待っても回復しない
    const details = (error.error as { error?: { details?: { error_code?: string } } } | undefined)
      ?.error?.details
    if (details?.error_code === 'enforced_spend_limit_reached') {
      return { ok: false, kind: 'fatal', message: '今月の利用上限に達しました。' }
    }
    const retryAfter = Number(error.headers?.get?.('retry-after') ?? '')
    const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : undefined
    return {
      ok: false,
      kind: 'retryable',
      message: seconds
        ? `少し混み合っています。${seconds}秒ほど待ってから、もう一度話しかけてください。`
        : '少し混み合っています。もう一度話しかけてください。',
      ...(seconds ? { retryAfterSec: seconds } : {}),
    }
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return { ok: false, kind: 'fatal', message: 'このキーでは使えない操作です。' }
  }
  if (error instanceof Anthropic.BadRequestError) {
    return { ok: false, kind: 'fatal', message: 'リクエストが受け付けられませんでした。' }
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { ok: false, kind: 'retryable', message: '接続できませんでした。もう一度話しかけてください。' }
  }
  if (error instanceof Anthropic.APIError) {
    if (error.status === 402) {
      return { ok: false, kind: 'fatal', message: 'クレジット残高か支払い設定に問題があります。' }
    }
    // 529（混雑）と 5xx は、待てば直る
    if (error.status && error.status >= 500) {
      return { ok: false, kind: 'retryable', message: '混み合っています。もう一度話しかけてください。' }
    }
    return { ok: false, kind: 'fatal', message: `エラーが起きました（${error.status}）。` }
  }
  return { ok: false, kind: 'retryable', message: '接続できませんでした。もう一度話しかけてください。' }
}

export interface HandleResult {
  status: number
  body: VoiceChatResponse
}

/**
 * @param body クライアントから届いた JSON
 * @param apiKey サーバー側だけが持つ API キー
 */
export async function handleVoiceChat(body: unknown, apiKey: string | undefined): Promise<HandleResult> {
  if (!apiKey) {
    return {
      status: 500,
      body: {
        ok: false,
        kind: 'fatal',
        message: 'APIキーが設定されていません。.env.local に ANTHROPIC_API_KEY を書いて、開発サーバーを再起動してください。',
      },
    }
  }

  const request = parseRequest(body)
  if (!request || request.turns.length === 0) {
    return { status: 400, body: { ok: false, kind: 'fatal', message: '会話の内容を受け取れませんでした。' } }
  }

  const client = new Anthropic({ apiKey })
  const startedAt = Date.now()

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      // 短い相槌に深く考える必要はない。thinking は送らない（Sonnet 5 では adaptive）
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      messages: buildMessages(request),
    })

    const elapsed = Date.now() - startedAt
    // 本文は残さない。数字だけ
    console.log(
      `[voice-chat] ${MODEL} ${elapsed}ms in=${response.usage.input_tokens} out=${response.usage.output_tokens} stop=${response.stop_reason}`,
    )

    if (response.stop_reason === 'refusal') {
      return { status: 200, body: { ok: true, text: REFUSAL_REPLY } }
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim()

    if (!text) {
      return { status: 200, body: { ok: false, kind: 'retryable', message: 'うまく返事が作れませんでした。もう一度話しかけてください。' } }
    }
    return { status: 200, body: { ok: true, text } }
  } catch (error) {
    const described = describeError(error)
    const status = error instanceof Anthropic.APIError ? (error.status ?? 502) : 502
    console.log(`[voice-chat] エラー ${status} (${Date.now() - startedAt}ms) kind=${described.ok ? '-' : described.kind}`)
    return { status, body: described }
  }
}
