/**
 * PC で動かしている AivisSpeech Engine に、返事を音声にしてもらう。
 *
 * クラウドの API は使わない。同じ PC の中で動いているエンジン
 * （既定では http://127.0.0.1:10101）に話しかける。
 * VOICEVOX ENGINE と互換の HTTP API を持っている。
 */

/** エンジンの場所。別のポートで動かしている場合は .env.local で変える */
export const DEFAULT_ENGINE_URL = 'http://127.0.0.1:10101'

/** 合成には時間がかかることがある（Mac の CPU で 12 文字 7 秒ほど） */
const SYNTHESIS_TIMEOUT_MS = 60_000
const LIST_TIMEOUT_MS = 5_000

export interface AivisStyle {
  name: string
  id: number
}

export interface AivisSpeaker {
  name: string
  speaker_uuid: string
  styles: AivisStyle[]
}

/** 画面の選択肢に出す、声とスタイルの組 */
export interface VoiceChoice {
  /** 「まお / おちつき」のような表示名 */
  label: string
  speaker: string
  style: string
  styleId: number
}

/**
 * 声を指定する項目。
 * AivisSpeech は VOICEVOX と数値の意味が違うところがあるので、
 * 対応が分かるように名前を付けておく。
 */
export interface VoiceParams {
  /** 話す速さ */
  speedScale: number
  /** 声の高さ。0 から動かすと音が荒れることがある */
  pitchScale: number
  /** 抑揚の強さ（AivisSpeech では「感情表現の強さ」の意味） */
  intonationScale: number
  /** 抑揚の動き。上げると早口で生っぽくなる */
  tempoDynamicsScale: number
}

export const DEFAULT_VOICE_PARAMS: VoiceParams = {
  speedScale: 1.0,
  pitchScale: 0.0,
  intonationScale: 1.0,
  tempoDynamicsScale: 1.0,
}

export class AivisEngineError extends Error {
  /** 待てば直る類か */
  readonly retryable: boolean

  // 引数に readonly を付ける書き方（パラメータプロパティ）は使わない。
  // このファイルは scripts/gen-chat-audio.mjs から Node が直に読むが、
  // Node の型の読み飛ばしはその書き方に対応していない
  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = 'AivisEngineError'
    this.retryable = retryable
  }
}

function engineUrl(base: string, path: string, query: Record<string, string> = {}): string {
  const url = new URL(path, base)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  return url.toString()
}

async function request(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AivisEngineError('AivisSpeech の応答が返ってきませんでした。', true)
    }
    throw new AivisEngineError(
      'AivisSpeech につながりません。AivisSpeech を起動してから、もう一度試してください。',
      true,
    )
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 使える声の一覧。
 * スタイルの ID はエンジンが作るもので固定ではないため、
 * 決め打ちにせず毎回ここから引く。
 */
export async function listVoices(base = DEFAULT_ENGINE_URL): Promise<VoiceChoice[]> {
  const response = await request(engineUrl(base, '/speakers'), { method: 'GET' }, LIST_TIMEOUT_MS)
  if (!response.ok) {
    throw new AivisEngineError(`AivisSpeech から声の一覧を取れませんでした（${response.status}）。`, true)
  }
  const speakers = (await response.json()) as AivisSpeaker[]
  return speakers.flatMap((speaker) =>
    speaker.styles.map((style) => ({
      label: `${speaker.name} / ${style.name}`,
      speaker: speaker.name,
      style: style.name,
      styleId: style.id,
    })),
  )
}

/** 名前で選ばれた声を、エンジンのスタイル ID に読み替える */
export async function resolveStyleId(
  speakerName: string,
  styleName: string,
  base = DEFAULT_ENGINE_URL,
): Promise<number> {
  const voices = await listVoices(base)
  const exact = voices.find((v) => v.speaker === speakerName && v.style === styleName)
  if (exact) return exact.styleId
  const sameSpeaker = voices.find((v) => v.speaker === speakerName)
  if (sameSpeaker) return sameSpeaker.styleId
  const first = voices[0]
  if (first) return first.styleId
  throw new AivisEngineError('AivisSpeech に使える声が見つかりませんでした。', false)
}

/**
 * 文章を音声にする。
 *
 * `/audio_query` で合成用の設定を作り、速さなどを書き換えてから
 * `/synthesis` に渡す、という 2 段階になっている。
 */
export async function synthesize(
  text: string,
  styleId: number,
  params: VoiceParams,
  base = DEFAULT_ENGINE_URL,
): Promise<{ audio: ArrayBuffer; contentType: string }> {
  const queryResponse = await request(
    engineUrl(base, '/audio_query', { speaker: String(styleId), text }),
    { method: 'POST' },
    LIST_TIMEOUT_MS,
  )
  if (!queryResponse.ok) {
    throw new AivisEngineError(`音声の設定を作れませんでした（${queryResponse.status}）。`, true)
  }
  const audioQuery = (await queryResponse.json()) as Record<string, unknown>

  // 速さなどを反映する。指定していない項目はエンジンの初期値のまま
  audioQuery.speedScale = params.speedScale
  audioQuery.pitchScale = params.pitchScale
  audioQuery.intonationScale = params.intonationScale
  audioQuery.tempoDynamicsScale = params.tempoDynamicsScale

  const synthesisResponse = await request(
    engineUrl(base, '/synthesis', { speaker: String(styleId) }),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(audioQuery),
    },
    SYNTHESIS_TIMEOUT_MS,
  )
  if (!synthesisResponse.ok) {
    throw new AivisEngineError(`音声を作れませんでした（${synthesisResponse.status}）。`, true)
  }

  return {
    audio: await synthesisResponse.arrayBuffer(),
    contentType: synthesisResponse.headers.get('content-type') ?? 'audio/wav',
  }
}
