import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { handleVoiceChat } from './voiceChat'

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

export function chatApiPlugin(apiKey: string | undefined): Plugin {
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

      const ready = apiKey ? 'ANTHROPIC_API_KEY を読み込みました' : 'ANTHROPIC_API_KEY が未設定です（雑談の返事は作れません）'
      server.config.logger.info(`  ➜  雑談 API: /api/voice-chat  ${ready}`)
    },
  }
}
