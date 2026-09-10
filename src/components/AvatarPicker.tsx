import { useEffect, useState } from 'react'
import { Avatar } from './Avatar'
import { allImagePaths, assetUrl, AVATAR_PRESETS } from '../data/avatarPresets'

interface AvatarPickerProps {
  value: string
  onChange: (avatarId: string) => void
}

type Availability = Record<string, boolean>

/** 画像素材が実際に置かれているかを、1 枚読み込んで確かめる */
function useAvailability(): Availability {
  const [available, setAvailable] = useState<Availability>({})

  useEffect(() => {
    let active = true
    for (const preset of AVATAR_PRESETS) {
      if (preset.kind !== 'images') continue
      const first = allImagePaths(preset)[0]
      if (!first) {
        setAvailable((prev) => ({ ...prev, [preset.id]: false }))
        continue
      }
      const image = new Image()
      image.onload = () => active && setAvailable((prev) => ({ ...prev, [preset.id]: true }))
      image.onerror = () => active && setAvailable((prev) => ({ ...prev, [preset.id]: false }))
      image.src = assetUrl(first)
    }
    return () => {
      active = false
    }
  }, [])

  return available
}

/** アバターの見た目を選ぶ */
export function AvatarPicker({ value, onChange }: AvatarPickerProps) {
  const available = useAvailability()

  return (
    <div className="avatar-picker">
      {AVATAR_PRESETS.map((preset) => {
        const missing = preset.kind === 'images' && available[preset.id] === false
        const selected = preset.id === value
        return (
          <button
            key={preset.id}
            type="button"
            className={`avatar-picker__item${selected ? ' avatar-picker__item--selected' : ''}`}
            aria-pressed={selected}
            onClick={() => onChange(preset.id)}
          >
            <span className="avatar-picker__preview">
              <Avatar mood="happy" presetId={preset.id} label={`${preset.name}のプレビュー`} />
            </span>
            <span className="avatar-picker__name">{preset.name}</span>
            <span className="avatar-picker__note">
              {missing ? '画像が見つかりません（組み込みの絵で表示します）' : preset.description}
            </span>
          </button>
        )
      })}
    </div>
  )
}
