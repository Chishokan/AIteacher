import { useEffect, useMemo, useState } from 'react'
import type { AvatarMood } from '../types'
import { allImagePaths, assetUrl, framesFor, type AvatarImageSet } from '../data/avatarAssets'
import './Avatar.css'

interface ImageAvatarProps {
  assets: AvatarImageSet
  mood: AvatarMood
  label?: string
  /** 画像が読み込めなかったとき（組み込みの絵に戻すために使う） */
  onFailed: () => void
}

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
function usePreload(assets: AvatarImageSet): void {
  useEffect(() => {
    for (const path of allImagePaths(assets)) {
      const image = new Image()
      image.src = assetUrl(path)
    }
  }, [assets])
}

/** 差し替えた画像でアバターを描く */
export function ImageAvatar({ assets, mood, label, onFailed }: ImageAvatarProps) {
  const reducedMotion = usePrefersReducedMotion()
  usePreload(assets)

  const frames = useMemo(() => framesFor(assets, mood), [assets, mood])
  const [frameIndex, setFrameIndex] = useState(0)
  const [blinking, setBlinking] = useState(false)

  // 口パク。コマが 2 枚以上ある表情のあいだだけ回す
  useEffect(() => {
    setFrameIndex(0)
    if (reducedMotion || frames.length < 2) return
    const timer = setInterval(
      () => setFrameIndex((index) => (index + 1) % frames.length),
      assets.mouthFrameMs,
    )
    return () => clearInterval(timer)
  }, [assets.mouthFrameMs, frames, reducedMotion])

  // まばたき。話している最中は口の形が崩れるので止めておく
  useEffect(() => {
    setBlinking(false)
    if (reducedMotion || !assets.blink || mood === 'speaking' || mood === 'happy') return

    let hold: ReturnType<typeof setTimeout> | undefined
    const timer = setInterval(() => {
      setBlinking(true)
      hold = setTimeout(() => setBlinking(false), assets.blinkHoldMs)
    }, assets.blinkIntervalMs)

    return () => {
      clearInterval(timer)
      clearTimeout(hold)
    }
  }, [assets.blink, assets.blinkHoldMs, assets.blinkIntervalMs, mood, reducedMotion])

  const source = blinking && assets.blink ? assets.blink : frames[frameIndex] ?? frames[0]
  if (!source) {
    onFailed()
    return null
  }

  return (
    <div className={`avatar avatar-photo avatar--${mood}`}>
      {/* 聞き取り中に広がる波紋 */}
      <span className="avatar-photo__ring" aria-hidden="true" />
      <span className="avatar-photo__ring avatar-photo__ring--2" aria-hidden="true" />
      <img
        className="avatar-photo__img"
        src={assetUrl(source)}
        alt={label ?? 'AIティーチャーのアバター'}
        draggable={false}
        onError={onFailed}
      />
    </div>
  )
}
