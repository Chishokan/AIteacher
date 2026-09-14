/**
 * 事前に作っておいた雑談の音声（`public/audio/chat/`）を探す。
 *
 * 毎回同じ文言（最初のひとこと、つなぎ言葉など）は、AivisSpeech にその場で
 * 作らせると数秒かかる（Mac の CPU で 12 文字 6.7 秒の実測）。
 * `npm run gen:chat-audio` で先に作って置いておき、あればそれを鳴らす。
 *
 * **声・速さ・高さ・抑揚を変えたら作り直しが要る。**
 * 作ったときの条件を manifest.json に残してあるので、いまの設定と食い違えば
 * 「見つからなかった」ことにして、その場で合成する側に落とす。
 */

/** 音声を作ったときの条件。1 つでも違えば別の音声として扱う */
export interface PrebuiltVoice {
  speaker: string
  style: string
  speedScale: number
  pitchScale: number
  intonationScale: number
  tempoDynamicsScale: number
}

export interface PrebuiltClip {
  /** 何に使う音声か（人が読むためだけのもの） */
  id: string
  /** 事前生成した文言 */
  text: string
  /** public/audio/chat/ からのファイル名 */
  file: string
  voice: PrebuiltVoice
}

export interface PrebuiltManifest {
  clips: PrebuiltClip[]
}

const EMPTY: PrebuiltManifest = { clips: [] }

/** 鍵の区切り。文中には出てこない文字を使う */
const SEP = '\u001f'

/** 小数の誤差でとり違えないように、そろえてから比べる */
function round(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0
}

/**
 * 「この文言を、この声で」を 1 本の文字列にしたもの。
 * 事前生成したものと、いま鳴らしたいものを突き合わせる鍵に使う。
 */
export function clipKey(text: string, voice: PrebuiltVoice): string {
  return [
    text.trim(),
    voice.speaker,
    voice.style,
    round(voice.speedScale),
    round(voice.pitchScale),
    round(voice.intonationScale),
    round(voice.tempoDynamicsScale),
  ].join(SEP)
}

/** 一覧の中から、文言と声がそろって一致するものを探す */
export function findPrebuiltClip(
  manifest: PrebuiltManifest,
  text: string,
  voice: PrebuiltVoice,
): PrebuiltClip | null {
  const wanted = clipKey(text, voice)
  return manifest.clips.find((clip) => clipKey(clip.text, clip.voice) === wanted) ?? null
}

/**
 * 読み込んだ manifest.json を、信用できる形にそろえる。
 * 手で書き換えて壊れていても、雑談が止まらないようにする。
 */
export function parsePrebuiltManifest(raw: unknown): PrebuiltManifest {
  if (typeof raw !== 'object' || raw === null) return EMPTY
  const clips = (raw as { clips?: unknown }).clips
  if (!Array.isArray(clips)) return EMPTY

  const valid: PrebuiltClip[] = []
  for (const item of clips) {
    if (typeof item !== 'object' || item === null) continue
    const { id, text, file, voice } = item as Record<string, unknown>
    if (typeof text !== 'string' || !text.trim()) continue
    if (typeof file !== 'string' || !file) continue
    if (typeof voice !== 'object' || voice === null) continue
    const v = voice as Record<string, unknown>
    if (typeof v.speaker !== 'string' || typeof v.style !== 'string') continue
    valid.push({
      id: typeof id === 'string' ? id : '',
      text,
      file,
      voice: {
        speaker: v.speaker,
        style: v.style,
        speedScale: round(v.speedScale),
        pitchScale: round(v.pitchScale),
        intonationScale: round(v.intonationScale),
        tempoDynamicsScale: round(v.tempoDynamicsScale),
      },
    })
  }
  return { clips: valid }
}

function chatAudioDir(): string {
  return `${import.meta.env.BASE_URL}audio/chat/`
}

/** 一覧は 1 度だけ読んで覚えておく */
let manifestPromise: Promise<PrebuiltManifest> | null = null

export function loadPrebuiltManifest(): Promise<PrebuiltManifest> {
  if (manifestPromise) return manifestPromise

  manifestPromise = fetch(`${chatAudioDir()}manifest.json`)
    .then(async (response) => {
      if (!response.ok) return EMPTY
      // 置かれていないパスに index.html が返ってくる配信があるため、種類も見る
      const type = response.headers.get('content-type') ?? ''
      if (!type.includes('json')) return EMPTY
      return parsePrebuiltManifest(await response.json())
    })
    .catch(() => EMPTY)

  return manifestPromise
}

/** 覚えている一覧を忘れる（テスト用） */
export function forgetPrebuiltManifest(): void {
  manifestPromise = null
}

/**
 * 事前生成があれば、その音声データを返す。無ければ null。
 * null が返ったら、呼ぶ側はその場で合成する。
 */
export async function fetchPrebuiltAudio(
  text: string,
  voice: PrebuiltVoice,
  signal?: AbortSignal,
): Promise<ArrayBuffer | null> {
  const clip = findPrebuiltClip(await loadPrebuiltManifest(), text, voice)
  if (!clip) return null

  try {
    const response = await fetch(`${chatAudioDir()}${clip.file}`, { signal })
    if (!response.ok) return null
    const type = response.headers.get('content-type') ?? ''
    if (type.includes('text/html')) return null
    return await response.arrayBuffer()
  } catch {
    // 一覧にあってもファイルが無いことはある。そのときは合成に落とす
    return null
  }
}
