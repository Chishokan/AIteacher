/**
 * 雑談の「毎回同じ文言」を、先に音声にして public/audio/chat/ に置く。
 *
 *   npm run gen:chat-audio
 *   npm run gen:chat-audio -- --check          作らずに、そろっているかだけ見る
 *   npm run gen:chat-audio -- --speaker まお --style おちつき --speed 1.05
 *
 * **AivisSpeech アプリを起動してから実行すること。** ローカルのエンジンに作らせる。
 *
 * なぜ要るか：その場で作らせると、Mac の CPU で 12 文字 6.7 秒かかる。
 * 最初のひとことは画面を開くたびに同じなので、先に作っておけば待ち時間がなくなる。
 *
 * 作るのは 1 本ずつ、順番に。ローカルのエンジンは 1 件ずつしか処理できないので、
 * まとめて投げると雑談の返事の声を待たせることになる（引き継ぎ仕様 4 章）。
 *
 * 声・速さ・高さ・抑揚を変えたら作り直しが要る。作ったときの条件は
 * manifest.json に残していて、アプリは条件が食い違えば「無いもの」として
 * その場の合成に落ちる。壊れるのではなく、遅くなるだけ。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const { DEFAULT_ENGINE_URL, AivisEngineError, resolveStyleId, synthesize } = await import(
  path.join(root, 'server/aivis.ts')
)
// 画面まわりを巻き込まずに読めるものだけを取り込む（Node からそのまま読むため）
const { DEFAULT_CHAT_OPENING, DEFAULT_CHAT_VOICE } = await import(
  path.join(root, 'src/chat/voiceDefaults.ts')
)
const { fixedLines } = await import(path.join(root, 'src/chat/fixedLines.ts'))
const { clipKey } = await import(path.join(root, 'src/chat/prebuiltClips.ts'))

// ---------------------------------------------------------------------------
// 実行時の指定
// ---------------------------------------------------------------------------

/** `--key value` と `--flag` を読む */
function parseArgs(argv) {
  const values = {}
  const flags = new Set()
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const name = token.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      flags.add(name)
    } else {
      values[name] = next
      i += 1
    }
  }
  return { values, flags }
}

const { values, flags } = parseArgs(process.argv.slice(2))

const num = (raw, fallback) => {
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    console.error(`数字で指定してください: ${raw}`)
    process.exit(1)
  }
  return parsed
}

/** .env.local に AIVIS_ENGINE_URL を書いている場合に拾う */
function readEnvFile(name) {
  const file = path.join(root, name)
  if (!existsSync(file)) return {}
  /** @type {Record<string,string>} */
  const env = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (!match) continue
    env[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
  return env
}

const fileEnv = { ...readEnvFile('.env'), ...readEnvFile('.env.local') }
const engineUrl =
  values.engine ?? process.env.AIVIS_ENGINE_URL ?? fileEnv.AIVIS_ENGINE_URL ?? DEFAULT_ENGINE_URL

/** 事前生成の条件。既定は voiceDefaults.ts の初期値（＝設定画面の初期値） */
const voice = {
  speaker: values.speaker ?? DEFAULT_CHAT_VOICE.speaker,
  style: values.style ?? DEFAULT_CHAT_VOICE.style,
  speedScale: num(values.speed, DEFAULT_CHAT_VOICE.speedScale),
  pitchScale: num(values.pitch, DEFAULT_CHAT_VOICE.pitchScale),
  intonationScale: num(values.intonation, DEFAULT_CHAT_VOICE.intonationScale),
  tempoDynamicsScale: num(values.tempo, DEFAULT_CHAT_VOICE.tempoDynamicsScale),
}

const opening = values.opening ?? DEFAULT_CHAT_OPENING
const outDir = path.resolve(root, values.out ?? 'public/audio/chat')
const manifestPath = path.join(outDir, 'manifest.json')

const checkOnly = flags.has('check')
const force = flags.has('force')
const keepOld = flags.has('keep-old')

// ---------------------------------------------------------------------------
// 何を作るか
// ---------------------------------------------------------------------------

const lines = fixedLines(opening)

/** ファイル名。人が見て分かる名前 + 条件のハッシュ */
function fileNameFor(line) {
  const digest = createHash('sha256').update(clipKey(line.text, voice)).digest('hex').slice(0, 8)
  const safeId = line.id.replace(/[^a-z0-9_-]/gi, '') || 'clip'
  return `${safeId}-${digest}.wav`
}

/** すでに置いてあるもの。条件が同じなら作り直さない */
function readExisting() {
  if (!existsSync(manifestPath)) return new Map()
  try {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const clips = Array.isArray(raw?.clips) ? raw.clips : []
    const map = new Map()
    for (const clip of clips) {
      if (!clip?.text || !clip?.file || !clip?.voice) continue
      if (!existsSync(path.join(outDir, clip.file))) continue
      map.set(clipKey(clip.text, clip.voice), clip)
    }
    return map
  } catch {
    // 壊れていたら、無いものとして作り直す
    return new Map()
  }
}

const existing = readExisting()

console.log(`AivisSpeech: ${engineUrl}`)
console.log(`声         : ${voice.speaker} / ${voice.style}`)
console.log(
  `調整       : 速さ ${voice.speedScale} / 高さ ${voice.pitchScale} / 抑揚 ${voice.intonationScale} / 抑揚の動き ${voice.tempoDynamicsScale}`,
)
console.log(`置き場所   : ${path.relative(root, outDir)}`)
console.log('')

const planned = lines.map((line) => {
  const key = clipKey(line.text, voice)
  const hit = existing.get(key)
  return {
    line,
    key,
    file: hit?.file ?? fileNameFor(line),
    /** すでにあるか */
    ready: Boolean(hit),
  }
})

// ---------------------------------------------------------------------------
// 見るだけ（--check）
// ---------------------------------------------------------------------------

if (checkOnly) {
  const missing = planned.filter((item) => !item.ready)
  for (const item of planned) {
    console.log(`${item.ready ? '済' : '未'}  ${item.line.id.padEnd(14)} ${item.line.text}`)
  }
  console.log('')
  if (missing.length === 0) {
    console.log(`${planned.length} 本すべてそろっています。`)
  } else {
    console.log(`${missing.length} / ${planned.length} 本が足りません。`)
    console.log('AivisSpeech を起動して、npm run gen:chat-audio を実行してください。')
  }
  process.exit(0)
}

// ---------------------------------------------------------------------------
// 作る
// ---------------------------------------------------------------------------

mkdirSync(outDir, { recursive: true })

let styleId
try {
  styleId = await resolveStyleId(voice.speaker, voice.style, engineUrl)
} catch (error) {
  const message = error instanceof AivisEngineError ? error.message : String(error)
  console.error(`\n${message}`)
  console.error('AivisSpeech アプリを起動してから、もう一度実行してください。')
  process.exit(1)
}

let made = 0
let skipped = 0

// 1 本ずつ、順番に。まとめて投げるとエンジンを占有してしまう
for (const item of planned) {
  if (item.ready && !force) {
    console.log(`済  ${item.line.id.padEnd(14)} ${item.line.text}`)
    skipped += 1
    continue
  }

  const startedAt = Date.now()
  let audio
  try {
    ;({ audio } = await synthesize(item.line.text, styleId, voice, engineUrl))
  } catch (error) {
    const message = error instanceof AivisEngineError ? error.message : String(error)
    console.error(`\n作れませんでした（${item.line.id}）: ${message}`)
    process.exit(1)
  }

  writeFileSync(path.join(outDir, item.file), Buffer.from(audio))
  item.ready = true
  made += 1
  console.log(
    `新  ${item.line.id.padEnd(14)} ${item.line.text}  ` +
      `[${Date.now() - startedAt}ms ${(audio.byteLength / 1024).toFixed(0)}KB]`,
  )
}

// ---------------------------------------------------------------------------
// 一覧を書き、使わなくなったファイルを片づける
// ---------------------------------------------------------------------------

const manifest = {
  generatedAt: new Date().toISOString(),
  note: '作り直すときは npm run gen:chat-audio。声や速さを変えたら作り直しが要ります',
  voice,
  clips: planned.map((item) => ({
    id: item.line.id,
    text: item.line.text,
    file: item.file,
    note: item.line.note,
    voice,
  })),
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

const used = new Set(planned.map((item) => item.file))
const stale = readdirSync(outDir).filter((f) => /\.(wav|mp3|m4a|ogg)$/i.test(f) && !used.has(f))
if (stale.length && !keepOld) {
  for (const file of stale) {
    rmSync(path.join(outDir, file))
    console.log(`削除  ${file}（いまの条件では使われません）`)
  }
} else if (stale.length) {
  console.log(`\n使われていないファイルが ${stale.length} 本あります（--keep-old のため残しました）`)
}

console.log(`\n新しく作った ${made} 本 / そのまま ${skipped} 本 / 合計 ${planned.length} 本`)
if (made > 0) console.log('雑談を開き直すと、最初のひとことがすぐ鳴ります。')
