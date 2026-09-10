import { useEffect, useMemo, useState } from 'react'
import type { AvatarMood } from '../types'
import { allImagePaths, assetUrl, framesFor, type AvatarPreset } from '../data/avatarPresets'
import './Avatar.css'

interface ImageAvatarProps {
  preset: AvatarPreset
  mood: AvatarMood
  label?: string
  /** 画像が読み込めなかったとき（組み込みの絵に戻すために使う） */
  onFailed: () => void
}

const DEFAULT_MOUTH_FRAME_MS = 170
const DEFAULT_BLINK_INTERVAL_MS = 5200
const DEFAULT_BLINK_HOLD_MS = 130

/** 動きを減らす設定がされているか */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

/** 用意された画像を先に読み込んでおく。切り替わるときのちらつきを防ぐ */
function usePreload(preset: AvatarPreset): void {
  useEffect(() => {
    for (const path of allImagePaths(preset)) {
      const image = new Image()
      image.src = assetUrl(path)
    }
  }, [preset])
}

/** 用意した画像でアバターを描く */
export function ImageAvatar({ preset, mood, label, onFailed }: ImageAvatarProps) {
  const reducedMotion = usePrefersReducedMotion()
  usePreload(preset)

  const frames = useMemo(() => framesFor(preset, mood), [preset, mood])
  const [frameIndex, setFrameIndex] = useState(0)
  const [blinking, setBlinking] = useState(false)

  const mouthFrameMs = preset.mouthFrameMs ?? DEFAULT_MOUTH_FRAME_MS
  const blinkIntervalMs = preset.blinkIntervalMs ?? DEFAULT_BLINK_INTERVAL_MS
  const blinkHoldMs = preset.blinkHoldMs ?? DEFAULT_BLINK_HOLD_MS

  // 口パク。コマが 2 枚以上ある表情のあいだだけ回す
  useEffect(() => {
    setFrameIndex(0)
    if (reducedMotion || frames.length < 2) return
    const timer = setInterval(
      () => setFrameIndex((index) => (index + 1) % frames.length),
      mouthFrameMs,
    )
    return () => clearInterval(timer)
  }, [frames, mouthFrameMs, reducedMotion])

  // まばたき。話している最中は口の形が崩れるので止めておく
  useEffect(() => {
    setBlinking(false)
    if (reducedMotion || !preset.blink || mood === 'speaking' || mood === 'happy') return

    let hold: ReturnType<typeof setTimeout> | undefined
    const timer = setInterval(() => {
      setBlinking(true)
      hold = setTimeout(() => setBlinking(false), blinkHoldMs)
    }, blinkIntervalMs)

    return () => {
      clearInterval(timer)
      clearTimeout(hold)
    }
  }, [blinkHoldMs, blinkIntervalMs, mood, preset.blink, reducedMotion])

  const source = blinking && preset.blink ? preset.blink : (frames[frameIndex] ?? frames[0])
  if (!source) {
    onFailed()
    return null
  }

  const framed = preset.framed ?? false

  return (
    <div
      className={`avatar avatar-photo avatar--${mood}${framed ? ' avatar-photo--framed' : ''}`}
    >
      {/* 透過素材のときは、まわりに波紋を広げて聞き取り中を示す */}
      {!framed && (
        <>
          <span className="avatar-photo__ring" aria-hidden="true" />
          <span className="avatar-photo__ring avatar-photo__ring--2" aria-hidden="true" />
        </>
      )}
      <div className="avatar-photo__frame">
        <img
          className="avatar-photo__img"
          src={assetUrl(source)}
          alt={label ?? 'AIティーチャーのアバター'}
          draggable={false}
          onError={onFailed}
        />
      </div>
    </div>
  )
}
