import { useEffect, useState } from 'react'
import type { AvatarMood } from '../types'
import { DrawnAvatar } from './DrawnAvatar'
import { ImageAvatar } from './ImageAvatar'
import { DEFAULT_AVATAR_ID, findPreset } from '../data/avatarPresets'

interface AvatarProps {
  mood: AvatarMood
  /** 使う見た目。省略すると組み込みの絵 */
  presetId?: string
  /** スクリーンリーダー向けの説明 */
  label?: string
}

/**
 * アバターの表示口。
 *
 * 設定で選ばれた見た目を描く。画像素材が読み込めなかった場合も面談が
 * 止まらないよう、組み込みの絵に戻す。
 */
export function Avatar({ mood, presetId = DEFAULT_AVATAR_ID, label }: AvatarProps) {
  const preset = findPreset(presetId)
  const [brokenPresetId, setBrokenPresetId] = useState<string | null>(null)

  // 別の見た目に切り替えたら、読み込み失敗の記録は捨てる
  useEffect(() => {
    setBrokenPresetId(null)
  }, [preset.id])

  if (preset.kind === 'images' && brokenPresetId !== preset.id) {
    return (
      <ImageAvatar
        preset={preset}
        mood={mood}
        label={label}
        onFailed={() => setBrokenPresetId(preset.id)}
      />
    )
  }
  return <DrawnAvatar mood={mood} label={label} />
}
