import { Avatar } from './Avatar'
import { AnswerPad } from './AnswerPad'
import { ConfirmPad } from './ConfirmPad'
import type { AvatarMood, Scenario } from '../types'
import { MIC_MESSAGES, type MicStatus } from '../speech/mic'
import type { InterviewState } from '../hooks/useInterview'

interface InterviewScreenProps {
  scenario: Scenario
  /** アバターの見た目 */
  avatarId: string
  /** マイクの使用許可 */
  micStatus: MicStatus
  state: InterviewState
  onRepeat: () => void
  onListenNow: () => void
  onSkip: () => void
  onStop: () => void
  onAnswer: (text: string, value?: number) => void
}

const MOOD: Record<InterviewState['phase'], AvatarMood> = {
  idle: 'idle',
  greeting: 'speaking',
  asking: 'speaking',
  listening: 'listening',
  thinking: 'thinking',
  confirming: 'speaking',
  closing: 'speaking',
  done: 'happy',
}

const STATUS: Record<InterviewState['phase'], string> = {
  idle: '待機中',
  greeting: '話しています',
  asking: '話しています',
  listening: '聞いています',
  thinking: '確認しています',
  confirming: '話しています',
  closing: '話しています',
  done: '終わりました',
}

export function InterviewScreen({
  scenario,
  avatarId,
  micStatus,
  state,
  onRepeat,
  onListenNow,
  onSkip,
  onStop,
  onAnswer,
}: InterviewScreenProps) {
  const total = scenario.questions.length
  const current = Math.max(state.index, 0)
  const done = state.phase === 'done' ? total : current
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  const mood: AvatarMood = state.notice ? 'confused' : MOOD[state.phase]
  // マイクの警告と同じことを二重に出さない
  const micWarning = micStatus !== 'granted' && micStatus !== 'unsupported'
  const notice = micWarning ? '' : state.notice

  return (
    <div className="interview">
      <div className="progress">
        <span className="progress__label">
          {state.question ? `${current + 1} / ${total} 問目` : `${done} / ${total}`}
        </span>
        <div
          className="progress__bar"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="progress__fill" style={{ width: `${percent}%` }} />
        </div>
        <span className="progress__label">{percent}%</span>
      </div>

      <div className="stage">
        <div className="stage__avatar">
          <Avatar mood={mood} presetId={avatarId} />
          <span
            className={`stage__status${state.phase === 'listening' ? ' stage__status--listening' : ''}`}
          >
            {state.phase === 'listening' ? '🎤 ' : ''}
            {STATUS[state.phase]}
          </span>
        </div>

        <div className="stage__main">
          <div className="card">
            {state.question && <div className="caption__section">{state.question.section}</div>}
            <p className="caption" aria-live="polite">
              {state.caption}
            </p>
          </div>

          <div className="transcript" aria-live="polite">
            {state.interim ? (
              <>
                聞き取り中：<strong>{state.interim}</strong>
              </>
            ) : notice ? (
              <span className="banner banner--warn">{notice}</span>
            ) : state.phase === 'listening' ? (
              'どうぞ話してください'
            ) : (
              ''
            )}
          </div>

          {micWarning && (
            <p className="banner banner--danger">
              {MIC_MESSAGES[micStatus]} 声で答えられないので、画面のボタンから入力してください。
            </p>
          )}

          {state.error && <p className="banner banner--warn">{state.error}</p>}

          {state.micBlocked && (
            <button type="button" className="tap-to-talk" onClick={onListenNow}>
              <span className="tap-to-talk__icon" aria-hidden="true">🎤</span>
              <span>
                <strong>タップして話す</strong>
                <span className="tap-to-talk__note">
                  押したあとに声で答えてください。画面から入力しても構いません
                </span>
              </span>
            </button>
          )}

          {state.pendingAnswer ? (
            <div className="card">
              <ConfirmPad
                label={state.pendingAnswer.label}
                display={state.pendingAnswer.display}
                onAnswer={onAnswer}
              />
            </div>
          ) : (
            state.question && (
              <div className="card">
                <AnswerPad question={state.question} onSubmit={onAnswer} onSkip={onSkip} />
              </div>
            )
          )}
        </div>
      </div>

      <div className="controls no-print">
        <button type="button" className="btn" onClick={onRepeat}>
          もう一度言って
        </button>
        <button type="button" className="btn" onClick={onListenNow}>
          🎤 いま話す
        </button>
        <button type="button" className="btn" onClick={onSkip}>
          とばす
        </button>
        <button type="button" className="btn btn--danger" onClick={onStop}>
          中止する
        </button>
      </div>
    </div>
  )
}
