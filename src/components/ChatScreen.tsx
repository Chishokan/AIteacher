import { useEffect, useMemo } from 'react'
import { MicButton, TalkMetrics, TalkStage } from './TalkStage'
import { useChatTurn } from '../chat/useChatTurn'
import { createApiReplySource } from '../chat/apiReplySource'
import { createDummyReplySource } from '../chat/reply'
import { useChatVoice } from '../chat/useChatVoice'
import type { Settings } from '../logic/settings'
import type { ChatPhase } from '../chat/types'
import { MIC_MESSAGES, type MicStatus } from '../speech/mic'

interface ChatScreenProps {
  avatarId: string
  micStatus: MicStatus
  settings: Settings
  /** 最初の画面で入れた名前。つなぎ言葉の「{名前}」に使う */
  studentName?: string
  onClose: () => void
}

const STATUS: Record<ChatPhase, string> = {
  idle: 'あなたの番です',
  recording: '聞いています',
  thinking: '考えています',
  speaking: '話しています',
  finished: 'おしまい',
}

export function ChatScreen({
  avatarId,
  micStatus,
  settings,
  studentName,
  onClose,
}: ChatScreenProps) {
  const replySource = useMemo(
    () => (settings.chatUseApi ? createApiReplySource() : createDummyReplySource()),
    [settings.chatUseApi],
  )

  const { voice, browserVoice, isFillerReady } = useChatVoice(settings, studentName)

  const { state, actions } = useChatTurn({
    opening: settings.chatOpening,
    replySource,
    voice,
    fallbackVoice: browserVoice,
    fillerEnabled: settings.chatFillerEnabled,
    isFillerReady,
    studentName,
    turnsPerSet: settings.chatTurnsPerSet,
  })

  useEffect(() => {
    // 開発モードでは効果が二度呼ばれる。すぐに始めず一拍おいて、
    // 片付けで取り消すことで、最初のひとことを 2 回作らせない
    const timer = setTimeout(() => void actions.begin(), 0)
    return () => {
      clearTimeout(timer)
      actions.stop()
    }
    // 画面を開いたときに一度だけ始める
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const micWarning = micStatus !== 'granted' && micStatus !== 'unsupported'
  // アバターが話している間は押せない（自分の声を拾わないため）
  const micDisabled = state.phase === 'speaking' || state.phase === 'thinking' || !!state.fatal
  // 1 セットぶん話し終えたところ。押し直すか、終わるかを選んでもらう
  const finished = state.phase === 'finished'

  return (
    <div className="chat">
      <div className="appbar">
        <h1 className="appbar__title">雑談</h1>
        <span className="appbar__badge">{settings.chatUseApi ? 'おためし' : 'ダミー返事'}</span>
        <span className="appbar__badge appbar__badge--quiet">
          {settings.chatVoiceMode === 'aivis'
            ? `${settings.chatVoiceSpeaker} / ${settings.chatVoiceStyle}`
            : 'ブラウザの読み上げ'}
        </span>
        <span className="spacer" />
        <button type="button" className="btn" onClick={onClose}>
          終わる
        </button>
      </div>

      <TalkStage
        avatarId={avatarId}
        phase={state.phase}
        status={STATUS[state.phase]}
        turns={state.turns}
        interim={state.interim}
      />

      <div className="chat__controls">
        {micWarning && <p className="banner banner--danger">{MIC_MESSAGES[micStatus]}</p>}
        {state.fatal && <p className="banner banner--danger">{state.fatal}</p>}
        {state.notice && !micWarning && <p className="banner banner--warn">{state.notice}</p>}

        {finished ? (
          <div className="chat__finished">
            <p className="chat__finished-note">ここまでで、いったんおしまいです。</p>
            <div className="chat__finished-buttons">
              <button type="button" className="btn btn--primary" onClick={actions.resume}>
                💬 もう少し話す
              </button>
              <button type="button" className="btn" onClick={onClose}>
                終わる
              </button>
            </div>
          </div>
        ) : (
          <MicButton phase={state.phase} disabled={micDisabled} onPress={actions.pressMic} />
        )}

        {state.metrics && <TalkMetrics metrics={state.metrics} />}
      </div>
    </div>
  )
}
