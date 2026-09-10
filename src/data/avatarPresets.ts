import type { AvatarMood } from '../types'

/**
 * アバターの見た目の候補。
 *
 * 画像素材を足すときは
 *  1. 画像を `public/avatar/<フォルダ名>/` に置く
 *  2. 下の AVATAR_PRESETS に 1 つ追加する
 * だけでよい。設定画面の「アバター」から選べるようになる。
 *
 * 表情の絵が用意されていない場合は idle の絵で代用される。
 * 逆に、ここに書いたのにファイルが無いと読み込みに失敗するので、
 * 実際に置いた絵だけを書くこと。
 */
export interface AvatarPreset {
  id: string
  /** 設定画面に出す名前 */
  name: string
  /** 設定画面に出す一言説明 */
  description: string
  /** 'drawn' は組み込みの絵、'images' は用意した画像 */
  kind: 'drawn' | 'images'
  /** kind が 'images' のときの、表情ごとの画像。配列にするとコマ送りされる */
  images?: Partial<Record<AvatarMood, string | string[]>>
  /** まばたき用の絵（目を閉じた一枚） */
  blink?: string
  /**
   * まばたきをさせる表情。
   * まばたきの絵は表情を 1 つしか持てないため、それに近い表情のときだけ使う。
   * 省略すると待機中と聞き取り中だけ。
   */
  blinkMoods?: AvatarMood[]
  /**
   * 背景が透過していない素材を、角の丸い枠に収めて表示する。
   * 白背景のイラストをそのまま使うときに指定する。
   */
  framed?: boolean
  /** 口パクの 1 コマの長さ（ミリ秒） */
  mouthFrameMs?: number
  /** まばたきの間隔（ミリ秒） */
  blinkIntervalMs?: number
  /** まばたきで目を閉じている時間（ミリ秒） */
  blinkHoldMs?: number
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: 'drawn',
    name: 'アンドロイド（女性）',
    description: '組み込みの絵。素材がなくても動きます',
    kind: 'drawn',
  },
  {
    id: 'male',
    name: 'ティーチャー（男性）',
    description: '8 つの表情を用意した画像素材',
    kind: 'images',
    images: {
      idle: 'avatar/male/idle.webp',
      // 口の開きが違う 2 枚を交互に出して口パクにする
      speaking: ['avatar/male/speaking-1.webp', 'avatar/male/speaking-2.webp'],
      listening: 'avatar/male/listening.webp',
      thinking: 'avatar/male/thinking.webp',
      happy: 'avatar/male/happy.webp',
      confused: 'avatar/male/confused.webp',
    },
    blink: 'avatar/male/blink.webp',
    // まばたきの絵はほほえんだ表情なので、同じ表情のときだけ使う
    blinkMoods: ['idle', 'listening'],
  },
]

export const DEFAULT_AVATAR_ID = 'drawn'

export function findPreset(id: string): AvatarPreset {
  return AVATAR_PRESETS.find((preset) => preset.id === id) ?? AVATAR_PRESETS[0]!
}

/** 表情に対応する画像のコマ。用意がなければ idle で代用する */
export function framesFor(preset: AvatarPreset, mood: AvatarMood): string[] {
  const entry = preset.images?.[mood] ?? preset.images?.idle
  if (!entry) return []
  return (Array.isArray(entry) ? entry : [entry]).filter(Boolean)
}

/** そのプリセットが使うすべての画像パス（先読みに使う） */
export function allImagePaths(preset: AvatarPreset): string[] {
  const paths = Object.values(preset.images ?? {}).flatMap((entry) =>
    Array.isArray(entry) ? entry : [entry],
  )
  if (preset.blink) paths.push(preset.blink)
  return [...new Set(paths.filter((path): path is string => !!path))]
}

/** 公開ディレクトリ基準のパスを、実際に読み込める URL にする */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}
