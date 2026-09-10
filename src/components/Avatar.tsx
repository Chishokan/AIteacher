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
  /** 目を細めるとやわらかい表情になる */
  eyeScale: number
  /** にっこり閉じた目にする */
  eyesClosed?: boolean
}

/** 表情の差分 */
const FACE: Record<AvatarMood, Face> = {
  idle: { browLeft: -2, browRight: 2, browY: 0, mouth: 'M 89 138 Q 100 147 111 138', blush: 0.45, eyeScale: 1 },
  speaking: { browLeft: -4, browRight: 4, browY: -2, mouth: 'M 89 137 Q 100 146 111 137', blush: 0.5, eyeScale: 1 },
  listening: { browLeft: -7, browRight: 7, browY: -5, mouth: 'M 91 139 Q 100 144 109 139', blush: 0.6, eyeScale: 1.04 },
  // 片方だけ上げて「考えている」顔にする
  thinking: { browLeft: -11, browRight: 3, browY: -3, mouth: 'M 90 140 Q 95 136 100 140 Q 105 144 110 140', blush: 0.45, eyeScale: 0.94 },
  happy: {
    browLeft: -5, browRight: 5, browY: -7,
    mouth: 'M 86 135 Q 100 152 114 135',
    blush: 0.85, eyeScale: 1, eyesClosed: true,
  },
  confused: { browLeft: -13, browRight: 6, browY: -2, mouth: 'M 91 141 Q 100 137 109 141', blush: 0.35, eyeScale: 1 },
}

/** 片目ぶんのパーツ。左右で同じものを描く */
function Eye({ cx, scale, closed }: { cx: number; scale: number; closed?: boolean }) {
  const cy = 112

  if (closed) {
    return (
      <g>
        <path
          d={`M ${cx - 12} ${cy + 3} Q ${cx} ${cy - 12} ${cx + 12} ${cy + 3}`}
          fill="none"
          stroke="#6b4a72"
          strokeWidth={3.6}
          strokeLinecap="round"
        />
        <path
          d={`M ${cx + 11.4} ${cy - 6} L ${cx + 16.4} ${cy - 10}`}
          stroke="#6b4a72"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      </g>
    )
  }

  return (
    <g transform={`translate(${cx} ${cy}) scale(1 ${scale}) translate(${-cx} ${-cy})`}>
      {/* 白目 */}
      <ellipse cx={cx} cy={cy} rx={12.5} ry={14.5} fill="#ffffff" />
      {/* 虹彩とホログラムのリング */}
      <circle cx={cx} cy={cy + 0.5} r={10.4} fill="url(#avatar-iris)" />
      <circle cx={cx} cy={cy + 0.5} r={7.8} fill="none" stroke="#a8f2ec" strokeWidth={1.3} opacity={0.8} />
      <circle cx={cx} cy={cy + 0.5} r={4.4} fill="#3b2a55" />
      {/* ハイライト */}
      <circle cx={cx - 3.4} cy={cy - 4.4} r={3.7} fill="#ffffff" />
      <circle cx={cx + 4} cy={cy + 4.2} r={1.9} fill="#ffffff" opacity={0.85} />
      {/* まつげ */}
      <path
        d={`M ${cx - 12.8} ${cy - 6} Q ${cx} ${cy - 17} ${cx + 12.8} ${cy - 6}`}
        fill="none"
        stroke="#6b4a72"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <path
        d={`M ${cx + 11.4} ${cy - 10} L ${cx + 16.4} ${cy - 14}`}
        stroke="#6b4a72"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </g>
  )
}

/** 耳のスピーカーユニット。アンドロイドらしさを出す */
function EarUnit({ cx }: { cx: number }) {
  return (
    <g>
      <circle cx={cx} cy={120} r={11} fill="#f4f2fc" stroke="#d6d2ee" strokeWidth={2} />
      <circle cx={cx} cy={120} r={6} fill="url(#avatar-led)" />
      <circle className="avatar__led" cx={cx} cy={120} r={2.6} fill="#ffffff" opacity={0.9} />
    </g>
  )
}

export function Avatar({ mood, label }: AvatarProps) {
  const face = FACE[mood]

  return (
    <svg
      className={`avatar avatar--${mood}`}
      viewBox="0 0 200 236"
      role="img"
      aria-label={label ?? 'AIティーチャーのアバター'}
    >
      <defs>
        <linearGradient id="avatar-hair" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#e9d5ff" />
          <stop offset="45%" stopColor="#c9a9f5" />
          <stop offset="100%" stopColor="#9b7fe0" />
        </linearGradient>
        <linearGradient id="avatar-hair-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="avatar-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff2e9" />
          <stop offset="100%" stopColor="#ffdfcd" />
        </linearGradient>
        <linearGradient id="avatar-outfit" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e8e4fb" />
        </linearGradient>
        <radialGradient id="avatar-iris" cx="0.4" cy="0.35" r="0.75">
          <stop offset="0%" stopColor="#8ef0ea" />
          <stop offset="55%" stopColor="#5ec8e0" />
          <stop offset="100%" stopColor="#6b6ad8" />
        </radialGradient>
        <radialGradient id="avatar-led" cx="0.4" cy="0.35" r="0.8">
          <stop offset="0%" stopColor="#9ff5ef" />
          <stop offset="100%" stopColor="#3fc9d6" />
        </radialGradient>
      </defs>

      {/* 聞き取り中の波紋 */}
      <g>
        <circle className="avatar__wave" cx="100" cy="106" r="82" fill="#f18cc0" opacity="0" />
        <circle className="avatar__wave avatar__wave--2" cx="100" cy="106" r="82" fill="#f18cc0" opacity="0" />
        <circle className="avatar__wave avatar__wave--3" cx="100" cy="106" r="82" fill="#f18cc0" opacity="0" />
      </g>

      {/* 肩と制服 */}
      <path d="M 28 236 Q 36 186 100 178 Q 164 186 172 236 Z" fill="url(#avatar-outfit)" />
      <path d="M 28 236 Q 33 208 48 195 L 58 236 Z" fill="#ece7fb" />
      <path d="M 172 236 Q 167 208 152 195 L 142 236 Z" fill="#ece7fb" />
      {/* 襟もと */}
      <path d="M 82 180 Q 100 202 118 180 L 118 174 L 82 174 Z" fill="#ffffff" />
      <path d="M 82 180 Q 100 202 118 180" fill="none" stroke="#d9d3f2" strokeWidth="2.2" />
      {/* 胸のコアライト */}
      <circle cx="100" cy="207" r="8.5" fill="#fdf3f8" stroke="#eec4dc" strokeWidth="2" />
      <circle className="avatar__led" cx="100" cy="207" r="4.6" fill="url(#avatar-led)" />

      <g className="avatar__head">
        {/* 首と関節のライン */}
        <rect x="90" y="150" width="20" height="28" rx="10" fill="#f7cdb4" />
        <rect x="88" y="161" width="24" height="3.4" rx="1.7" fill="#e6dff8" />

        {/* 顔まわりを縁どる長い髪。顔より先に描いて背面に置く */}
        <path d="M 46 96 Q 34 152 42 194 Q 58 176 56 128 Z" fill="url(#avatar-hair)" />
        <path d="M 154 96 Q 166 152 158 194 Q 142 176 144 128 Z" fill="url(#avatar-hair)" />
        {/* 後ろ髪 */}
        <ellipse cx="100" cy="100" rx="59" ry="63" fill="url(#avatar-hair)" />

        {/* 耳のスピーカーユニット。内側は顔で隠れて、頭に付いて見える */}
        <EarUnit cx={45} />
        <EarUnit cx={155} />

        {/* 顔 */}
        <ellipse cx="100" cy="106" rx="48" ry="52" fill="url(#avatar-skin)" />

        {/* 前髪。ふんわり横に流した形にする */}
        <path
          d="M 52 100 Q 50 46 100 42 Q 150 46 148 100
             Q 145 76 132 66 Q 120 86 92 88 Q 70 88 62 74 Q 54 82 52 100 Z"
          fill="url(#avatar-hair)"
        />
        <path d="M 70 54 Q 100 45 130 56 Q 100 52 72 62 Z" fill="url(#avatar-hair-shine)" />

        {/* 髪かざり。小さなランプ付きのクリップ */}
        <g transform="rotate(-12 128 62)">
          <rect x="118" y="56" width="24" height="10" rx="5" fill="#ffffff" stroke="#e6c6da" strokeWidth="1.8" />
          <circle className="avatar__led" cx="130" cy="61" r="3" fill="url(#avatar-led)" />
        </g>

        {/* アンテナ */}
        <path d="M 72 48 Q 64 32 68 22" fill="none" stroke="#d6d2ee" strokeWidth="3.2" strokeLinecap="round" />
        <circle className="avatar__led" cx="68" cy="19" r="5" fill="url(#avatar-led)" />

        {/* 眉 */}
        <g fill="#b083c6">
          <rect
            x="68" y={92 + face.browY} width="23" height="4.6" rx="2.3"
            transform={`rotate(${face.browLeft} 79.5 ${94 + face.browY})`}
          />
          <rect
            x="109" y={92 + face.browY} width="23" height="4.6" rx="2.3"
            transform={`rotate(${face.browRight} 120.5 ${94 + face.browY})`}
          />
        </g>

        {/* 目 */}
        <g className="avatar__eyes">
          <Eye cx={78} scale={face.eyeScale} closed={face.eyesClosed} />
          <Eye cx={122} scale={face.eyeScale} closed={face.eyesClosed} />
        </g>

        {/* ほお */}
        <ellipse cx="66" cy="130" rx="10" ry="5.6" fill="#ffa3b8" opacity={face.blush} />
        <ellipse cx="134" cy="130" rx="10" ry="5.6" fill="#ffa3b8" opacity={face.blush} />
        {/* ほおの状態ランプ */}
        <circle cx="130" cy="141" r="1.7" fill="#5ed6d8" opacity="0.85" />
        <circle cx="136" cy="139" r="1.3" fill="#5ed6d8" opacity="0.6" />

        {/* 口。話しているあいだは開いた形にして、口パクを見えるようにする */}
        <g className="avatar__mouth">
          {mood === 'speaking' ? (
            <>
              <ellipse cx="100" cy="140" rx="9.5" ry="6.5" fill="#c9455f" />
              <ellipse cx="100" cy="143.5" rx="6" ry="3" fill="#f28ba0" />
            </>
          ) : (
            <path d={face.mouth} fill="none" stroke="#e0637f" strokeWidth="3.9" strokeLinecap="round" />
          )}
        </g>
      </g>
    </svg>
  )
}
