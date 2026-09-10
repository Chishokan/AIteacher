import type { AvatarMood } from '../types'
import './Avatar.css'

interface AvatarProps {
  mood: AvatarMood
  /** スクリーンリーダー向けの説明 */
  label?: string
}

interface Face {
  /** 左右の眉の傾き。内側が下がると怒って見えるため、左右で別々に持つ */
  browLeft: number
  browRight: number
  browY: number
  mouth: string
  blush: number
}

/** 表情の差分 */
const FACE: Record<AvatarMood, Face> = {
  idle: { browLeft: 0, browRight: 0, browY: 0, mouth: 'M 78 128 Q 100 142 122 128', blush: 0.35 },
  speaking: { browLeft: -3, browRight: 3, browY: -2, mouth: 'M 78 126 Q 100 140 122 126', blush: 0.4 },
  listening: { browLeft: -6, browRight: 6, browY: -5, mouth: 'M 84 130 Q 100 137 116 130', blush: 0.5 },
  // 片方だけ上げて「考えている」顔にする
  thinking: { browLeft: -10, browRight: 2, browY: -3, mouth: 'M 84 132 Q 100 128 116 133', blush: 0.3 },
  happy: { browLeft: -5, browRight: 5, browY: -6, mouth: 'M 74 124 Q 100 150 126 124', blush: 0.75 },
  confused: { browLeft: -12, browRight: 5, browY: -2, mouth: 'M 84 134 Q 100 126 116 134', blush: 0.3 },
}

export function Avatar({ mood, label }: AvatarProps) {
  const face = FACE[mood]

  return (
    <svg
      className={`avatar avatar--${mood}`}
      viewBox="0 0 200 232"
      role="img"
      aria-label={label ?? 'AIティーチャーのアバター'}
    >
      <defs>
        <linearGradient id="avatar-hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4c5b8f" />
          <stop offset="100%" stopColor="#2c3560" />
        </linearGradient>
        <linearGradient id="avatar-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe6d2" />
          <stop offset="100%" stopColor="#ffd2b4" />
        </linearGradient>
        <linearGradient id="avatar-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4fd1c5" />
          <stop offset="100%" stopColor="#3aa6c9" />
        </linearGradient>
      </defs>

      {/* 聞き取り中の波紋 */}
      <g>
        <circle className="avatar__wave" cx="100" cy="104" r="82" fill="#4fd1c5" opacity="0" />
        <circle className="avatar__wave avatar__wave--2" cx="100" cy="104" r="82" fill="#4fd1c5" opacity="0" />
        <circle className="avatar__wave avatar__wave--3" cx="100" cy="104" r="82" fill="#4fd1c5" opacity="0" />
      </g>

      {/* 肩・体 */}
      <path
        d="M 34 232 Q 40 178 100 172 Q 160 178 166 232 Z"
        fill="url(#avatar-body)"
      />
      <path d="M 86 172 Q 100 190 114 172 Z" fill="#ffffff" opacity="0.85" />

      <g className="avatar__head">
        {/* 首 */}
        <rect x="88" y="150" width="24" height="26" rx="12" fill="#f3c0a0" />

        {/* 後ろ髪 */}
        <ellipse cx="100" cy="98" rx="66" ry="70" fill="url(#avatar-hair)" />

        {/* 顔 */}
        <ellipse cx="100" cy="104" rx="56" ry="60" fill="url(#avatar-skin)" />

        {/* 前髪 */}
        <path
          d="M 44 92 Q 48 34 100 32 Q 152 34 156 92 Q 140 62 100 60 Q 60 62 44 92 Z"
          fill="url(#avatar-hair)"
        />

        {/* 耳 */}
        <ellipse cx="44" cy="106" rx="8" ry="12" fill="#f3c0a0" />
        <ellipse cx="156" cy="106" rx="8" ry="12" fill="#f3c0a0" />

        {/* 眉 */}
        <g fill="#3b4372">
          <rect
            x="66" y={84 + face.browY} width="26" height="6" rx="3"
            transform={`rotate(${face.browLeft} 79 ${87 + face.browY})`}
          />
          <rect
            x="108" y={84 + face.browY} width="26" height="6" rx="3"
            transform={`rotate(${face.browRight} 121 ${87 + face.browY})`}
          />
        </g>

        {/* 目 */}
        <g className="avatar__eyes">
          <ellipse cx="79" cy="106" rx="11" ry="13" fill="#ffffff" />
          <ellipse cx="121" cy="106" rx="11" ry="13" fill="#ffffff" />
          <circle cx="80" cy="107" r="7" fill="#2b3358" />
          <circle cx="122" cy="107" r="7" fill="#2b3358" />
          <circle cx="82.5" cy="104" r="2.6" fill="#ffffff" />
          <circle cx="124.5" cy="104" r="2.6" fill="#ffffff" />
        </g>

        {/* ほお */}
        <ellipse cx="64" cy="124" rx="10" ry="6" fill="#ff9d94" opacity={face.blush} />
        <ellipse cx="136" cy="124" rx="10" ry="6" fill="#ff9d94" opacity={face.blush} />

        {/* 口 */}
        <g className="avatar__mouth">
          <path d={face.mouth} fill="#8c3b48" stroke="#8c3b48" strokeWidth="5" strokeLinecap="round" />
        </g>

        {/* ヘッドセット（AI ティーチャーらしさ） */}
        <path
          d="M 40 100 Q 40 36 100 36 Q 160 36 160 100"
          fill="none"
          stroke="#e6ecff"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <rect x="30" y="96" width="20" height="30" rx="9" fill="#e6ecff" />
        <rect x="150" y="96" width="20" height="30" rx="9" fill="#e6ecff" />
        <path d="M 44 124 Q 46 148 74 150" fill="none" stroke="#e6ecff" strokeWidth="5" strokeLinecap="round" />
        <circle cx="76" cy="150" r="6" fill="#ff7a7a" />
      </g>
    </svg>
  )
}
