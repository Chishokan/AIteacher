import { Avatar } from './Avatar'
import type { ChatPhase, TurnMetrics, ChatTurn } from '../chat/types'
import type { AvatarMood } from '../types'

/**
 * 話している画面の共通部分。
 *
 * 雑談（`ChatScreen`）とコーチングタイム（`CoachingScreen`）で同じものを使う。
 * 進行は別ものだが、見た目と操作はそろえたい。
 */

const MOOD: Record<ChatPhase, AvatarMood> = {
  idle: 'idle',
  recording: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
  finished: 'happy',
}

const MIC_LABEL: Record<ChatPhase, string> = {
  idle: '🎤 押して話す',
  recording: '⏹ 話し終わったら押す',
  thinking: '考えています…',
  speaking: '話しています…',
  finished: 'おしまい',
}

interface TalkStageProps {
  avatarId: string
  phase: ChatPhase
  /** アバターの下に出す一言（「あなたの番です」など） */
  status: string
  turns: ChatTurn[]
  /** 聞き取り中の文字 */
  interim: string
}

export function TalkStage({ avatarId, phase, status, turns, interim }: TalkStageProps) {
  return (
    <div className="chat__stage">
      <div className="chat__avatar">
        <Avatar mood={MOOD[phase]} presetId={avatarId} />
        <span className={`stage__status${phase === 'recording' ? ' stage__status--listening' : ''}`}>
          {phase === 'recording' ? '🎤 ' : ''}
          {status}
        </span>
      </div>

      <div className="chat__log" aria-live="polite">
        {turns.map((turn) => (
          <p key={`${turn.at}-${turn.who}`} className={`bubble bubble--${turn.who}`}>
            {turn.text}
          </p>
        ))}
        {phase === 'recording' && (
          <p className="bubble bubble--student bubble--listening">{interim || '聞いています…'}</p>
        )}
      </div>
    </div>
  )
}

interface MicButtonProps {
  phase: ChatPhase
  disabled: boolean
  onPress: () => void
}

/** 押して話すボタン。自動ではマイクを開かないので、ここが唯一の入口 */
export function MicButton({ phase, disabled, onPress }: MicButtonProps) {
  return (
    <button
      type="button"
      className={`mic-button${phase === 'recording' ? ' mic-button--recording' : ''}`}
      disabled={disabled}
      onClick={onPress}
    >
      {MIC_LABEL[phase]}
    </button>
  )
}

/** 「遅い」を感想ではなく数字で見るための欄（引き継ぎ仕様 3.7） */
export function TalkMetrics({ metrics }: { metrics: TurnMetrics }) {
  return (
    <dl className="metrics">
      <div>
        <dt>最初の声まで</dt>
        <dd>{metrics.firstVoiceMs ?? '—'} ms</dd>
      </div>
      <div>
        <dt>つなぎ</dt>
        <dd>
          {metrics.fillerCount} 回
          {metrics.fillerSkipReason
            ? `（${metrics.fillerSkipReason}）`
            : metrics.fillerScene
              ? `（${metrics.fillerScene}）`
              : ''}
        </dd>
      </div>
      <div>
        <dt>途中の沈黙</dt>
        <dd>{metrics.gapMs ?? '—'} ms</dd>
      </div>
      <div>
        <dt>考える</dt>
        <dd>{metrics.thinkMs ?? '—'} ms</dd>
      </div>
      <div>
        <dt>声を作る</dt>
        <dd>
          {metrics.ttsMs ?? '—'} ms{metrics.ttsPrebuilt ? '（用意ずみ）' : ''}
        </dd>
      </div>
    </dl>
  )
}
