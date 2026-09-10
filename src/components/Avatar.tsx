import { useState } from 'react'
import type { AvatarMood } from '../types'
import { DrawnAvatar } from './DrawnAvatar'
import { ImageAvatar } from './ImageAvatar'
import { avatarAssets } from '../data/avatarAssets'

interface AvatarProps {
  mood: AvatarMood
  /** スクリーンリーダー向けの説明 */
  label?: string
}

/**
 * アバターの表示口。
 *
 * `src/data/avatarAssets.ts` で画像を有効にしていればその絵を、
 * そうでなければ組み込みの絵を描く。画像が読み込めなかった場合も
 * 面談が止まらないよう、組み込みの絵に戻す。
 */
export function Avatar({ mood, label }: AvatarProps) {
  const [imagesBroken, setImagesBroken] = useState(false)

  if (avatarAssets.enabled && !imagesBroken) {
    return (
      <ImageAvatar
        assets={avatarAssets}
        mood={mood}
        label={label}
        onFailed={() => setImagesBroken(true)}
      />
    )
  }
  return <DrawnAvatar mood={mood} label={label} />
}
