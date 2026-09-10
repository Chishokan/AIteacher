import type { AvatarMood } from '../types'

/**
 * 自分で用意したアバター画像に差し替えるための設定。
 *
 * 使い方
 *  1. 画像を `public/avatar/` に置く（README の「アバターを差し替える」を参照）
 *  2. 下の `enabled` を true にする
 *  3. 使わない表情は行ごと消してよい。足りない表情は idle の絵で代用される
 *
 * パスは `public/` から見た位置で書く（先頭のスラッシュは不要）。
 */
export interface AvatarImageSet {
  /** true にすると、組み込みの絵ではなく下の画像を使う */
  enabled: boolean
  /**
   * 表情ごとの画像。
   * 配列で複数枚わたすと、その表情のあいだコマ送りされる（口パクに使う）。
   */
  images: Partial<Record<AvatarMood, string | string[]>>
  /** まばたき用の絵（任意）。目を閉じた一枚を指定する */
  blink?: string
  /** 口パクの 1 コマの長さ（ミリ秒） */
  mouthFrameMs: number
  /** まばたきの間隔（ミリ秒） */
  blinkIntervalMs: number
  /** まばたきで目を閉じている時間（ミリ秒） */
  blinkHoldMs: number
}

export const avatarAssets: AvatarImageSet = {
  enabled: false,

  images: {
    idle: 'avatar/idle.png',
    // 2 枚以上わたすと交互に切り替わって口パクになる
    speaking: ['avatar/speaking-1.png', 'avatar/speaking-2.png'],
    listening: 'avatar/listening.png',
    thinking: 'avatar/thinking.png',
    happy: 'avatar/happy.png',
    confused: 'avatar/confused.png',
  },

  blink: 'avatar/blink.png',
  mouthFrameMs: 170,
  blinkIntervalMs: 5200,
  blinkHoldMs: 130,
}

/** 表情に対応する画像のコマ。用意がなければ idle で代用する */
export function framesFor(assets: AvatarImageSet, mood: AvatarMood): string[] {
  const entry = assets.images[mood] ?? assets.images.idle
  if (!entry) return []
  return Array.isArray(entry) ? entry.filter(Boolean) : [entry]
}

/** 設定に書かれたすべての画像パス（読み込みの先読みに使う） */
export function allImagePaths(assets: AvatarImageSet): string[] {
  const paths = Object.values(assets.images).flatMap((entry) =>
    Array.isArray(entry) ? entry : [entry],
  )
  if (assets.blink) paths.push(assets.blink)
  return [...new Set(paths.filter((p): p is string => !!p))]
}

/** 公開ディレクトリ基準のパスを、実際に読み込める URL にする */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}
