import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { handleVoiceChat } from './voiceChat'
import { fetchStudents, isConfigured, type SupabaseOptions } from './students'
import {
  AivisEngineError,
  DEFAULT_ENGINE_URL,
  DEFAULT_VOICE_PARAMS,
  listVoices,
  resolveStyleId,
  synthesize,
  type VoiceParams,
} from './aivis'

/**
 * 開発サーバー（npm run dev）に、雑談の API を同居させる。
 *
 * API キーはこのプラグイン（＝ Node 側）にしか渡らない。
 * ブラウザに配るコードには入らない。
 */

const BODY_LIMIT = 256 * 1024

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer | string) => {
      body += chunk
      if (body.length > BODY_LIMIT) reject(new Error('リクエストが大きすぎます'))
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

interface TtsRequestBody {
  text?: unknown
  speaker?: unknown
  style?: unknown
  params?: Partial<VoiceParams>
}

function toParams(raw: Partial<VoiceParams> | undefined): VoiceParams {
  const num = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return {
    speedScale: num(raw?.speedScale, DEFAULT_VOICE_PARAMS.speedScale),
    pitchScale: num(raw?.pitchScale, DEFAULT_VOICE_PARAMS.pitchScale),
    intonationScale: num(raw?.intonationScale, DEFAULT_VOICE_PARAMS.intonationScale),
    tempoDynamicsScale: num(raw?.tempoDynamicsScale, DEFAULT_VOICE_PARAMS.tempoDynamicsScale),
  }
}

export interface ChatApiOptions {
  apiKey: string | undefined
  /** AivisSpeech Engine の場所。既定は 127.0.0.1:10101 */
  engineUrl: string
  /** 生徒名簿を Supabase から読むときの設定。無ければ端末の名簿を使う */
  supabase: SupabaseOptions
}

export function chatApiPlugin({ apiKey, engineUrl, supabase }: ChatApiOptions): Plugin {
  return {
    name: 'aitecher-chat-api',
    // 本番のビルドには含めない
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/voice-chat', (req, res) => {
        void (async () => {
          if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, kind: 'fatal', message: 'POST で呼んでください。' })
            return
          }
          try {
            const raw = await readBody(req)
            const { status, body } = await handleVoiceChat(JSON.parse(raw), apiKey)
            sendJson(res, status, body)
          } catch {
            sendJson(res, 400, { ok: false, kind: 'fatal', message: '内容を読み取れませんでした。' })
          }
        })()
      })

      // 使える声の一覧。設定画面の選択肢に使う
      server.middlewares.use('/api/tts/voices', (req, res) => {
        void (async () => {
          try {
            sendJson(res, 200, { ok: true, voices: await listVoices(engineUrl) })
          } catch (error) {
            const message =
              error instanceof AivisEngineError
                ? error.message
                : 'AivisSpeech につながりません。'
            sendJson(res, 200, { ok: false, message, voices: [] })
          }
        })()
      })

      // 返事を音声にする
      server.middlewares.use('/api/tts', (req, res) => {
        void (async () => {
          if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, message: 'POST で呼んでください。' })
            return
          }
          const startedAt = Date.now()
          try {
            const body = JSON.parse(await readBody(req)) as TtsRequestBody
            const text = typeof body.text === 'string' ? body.text.trim() : ''
            if (!text) {
              sendJson(res, 400, { ok: false, message: '読み上げる文章がありません。' })
              return
            }
            const speaker = typeof body.speaker === 'string' ? body.speaker : ''
            const style = typeof body.style === 'string' ? body.style : ''
            const styleId = await resolveStyleId(speaker, style, engineUrl)
            const { audio, contentType } = await synthesize(
              text,
              styleId,
              toParams(body.params),
              engineUrl,
            )

            // 本文は残さない。長さと時間だけ
            server.config.logger.info(
              `  [tts] ${text.length}文字 ${Date.now() - startedAt}ms ${(audio.byteLength / 1024).toFixed(0)}KB`,
            )
            res.statusCode = 200
            res.setHeader('content-type', contentType)
            res.setHeader('cache-control', 'no-store')
            res.end(Buffer.from(audio))
          } catch (error) {
            const retryable = error instanceof AivisEngineError ? error.retryable : true
            const message =
              error instanceof AivisEngineError ? error.message : '音声を作れませんでした。'
            server.config.logger.warn(`  [tts] 失敗 (${Date.now() - startedAt}ms) ${message}`)
            sendJson(res, 503, { ok: false, retryable, message })
          }
        })()
      })

      // 生徒名簿。Supabase を設定していなければ「未設定」を返すだけ
      server.middlewares.use('/api/students', (req, res) => {
        void (async () => {
          const startedAt = Date.now()
          const result = await fetchStudents(supabase)
          if (result.ok) {
            // 名簿の中身はログに残さない（個人情報のため）。件数と時間だけ
            server.config.logger.info(
              `  [students] ${result.rows.length}件 ${Date.now() - startedAt}ms`,
            )
            res.setHeader('cache-control', 'no-store')
            sendJson(res, 200, { ok: true, rows: result.rows })
            return
          }
          if (result.kind === 'unconfigured') {
            sendJson(res, 200, { ok: false, kind: 'unconfigured', message: result.message })
            return
          }
          server.config.logger.warn(`  [students] 失敗 (${Date.now() - startedAt}ms)`)
          sendJson(res, 200, { ok: false, kind: 'error', message: result.message })
        })()
      })

      const ready = apiKey ? 'ANTHROPIC_API_KEY を読み込みました' : 'ANTHROPIC_API_KEY が未設定です（雑談の返事は作れません）'
      server.config.logger.info(`  ➜  雑談 API: /api/voice-chat  ${ready}`)
      server.config.logger.info(`  ➜  音声 API: /api/tts  AivisSpeech = ${engineUrl}`)
      server.config.logger.info(
        `  ➜  名簿 API: /api/students  ${
          isConfigured(supabase)
            ? `Supabase = ${supabase.url}（テーブル ${supabase.table || 'students'}）`
            : 'Supabase は未設定（端末に取り込んだ名簿を使います）'
        }`,
      )
    },
  }
}
