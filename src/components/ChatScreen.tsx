import { useEffect, useMemo } from 'react'
import { Avatar } from './Avatar'
import { useChatTurn } from '../chat/useChatTurn'
import { createApiReplySource } from '../chat/apiReplySource'
import { createDummyReplySource } from '../chat/reply'
import { createAivisVoice, createBrowserVoice } from '../chat/voice'
import type { Settings } from '../logic/settings'
import type { AvatarMood } from '../types'
import type { ChatPhase } from '../chat/types'
import { MIC_MESSAGES, type MicStatus } from '../speech/mic'

interface ChatScreenProps {
  avatarId: string
  micStatus: MicStatus
  settings: Settings
  onClose: () => void
}

const MOOD: Record<ChatPhase, AvatarMood> = {
  idle: 'idle',
  recording: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
}

const STATUS: Record<ChatPhase, string> = {
  idle: 'あなたの番です',
  recording: '聞いています',
  thinking: '考えています',
  speaking: '話しています',
}

const MIC_LABEL: Record<ChatPhase, string> = {
  idle: '🎤 押して話す',
  recording: '⏹ 話し終わったら押す',
  thinking: '考えています…',
  speaking: '話しています…',
}

export function ChatScreen({ avatarId, micStatus, settings, onClose }: ChatScreenProps) {
  const replySource = useMemo(
    () => (settings.chatUseApi ? createApiReplySource() : createDummyReplySource()),
    [settings.chatUseApi],
  )

  const browserVoice = useMemo(
    () => createBrowserVoice(settings.rate, settings.pitch, settings.voiceURI),
    [settings.pitch, settings.rate, settings.voiceURI],
  )

  const voice = useMemo(() => {
    if (settings.chatVoiceMode === 'browser') return browserVoice
    return createAivisVoice({
      speaker: settings.chatVoiceSpeaker,
      style: settings.chatVoiceStyle,
      speedScale: settings.chatSpeedScale,
      pitchScale: settings.chatPitchScale,
      intonationScale: settings.chatIntonationScale,
      tempoDynamicsScale: settings.chatTempoDynamicsScale,
    })
  }, [
    browserVoice,
    settings.chatVoiceMode,
    settings.chatVoiceSpeaker,
    settings.chatVoiceStyle,
    settings.chatSpeedScale,
    settings.chatPitchScale,
    settings.chatIntonationScale,
    settings.chatTempoDynamicsScale,
  ])

  const { state, actions } = useChatTurn({
    opening: settings.chatOpening,
    replySource,
    voice,
    fallbackVoice: browserVoice,
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

      <div className="chat__stage">
        <div className="chat__avatar">
          <Avatar mood={MOOD[state.phase]} presetId={avatarId} />
          <span
            className={`stage__status${state.phase === 'recording' ? ' stage__status--listening' : ''}`}
          >
            {state.phase === 'recording' ? '🎤 ' : ''}
            {STATUS[state.phase]}
          </span>
        </div>

        <div className="chat__log" aria-live="polite">
          {state.turns.map((turn) => (
            <p key={`${turn.at}-${turn.who}`} className={`bubble bubble--${turn.who}`}>
              {turn.text}
            </p>
          ))}
          {state.phase === 'recording' && (
            <p className="bubble bubble--student bubble--listening">
              {state.interim || '聞いています…'}
            </p>
          )}
        </div>
      </div>

      <div className="chat__controls">
        {micWarning && <p className="banner banner--danger">{MIC_MESSAGES[micStatus]}</p>}
        {state.fatal && <p className="banner banner--danger">{state.fatal}</p>}
        {state.notice && !micWarning && <p className="banner banner--warn">{state.notice}</p>}

        <button
          type="button"
          className={`mic-button${state.phase === 'recording' ? ' mic-button--recording' : ''}`}
          disabled={micDisabled}
          onClick={actions.pressMic}
        >
          {MIC_LABEL[state.phase]}
        </button>

        {state.metrics && (
          <dl className="metrics">
            <div>
              <dt>最初の声まで</dt>
              <dd>{state.metrics.firstVoiceMs ?? '—'} ms</dd>
            </div>
            <div>
              <dt>つなぎ</dt>
              <dd>
                {state.metrics.fillerCount} 回
                {state.metrics.fillerSkipReason ? `（${state.metrics.fillerSkipReason}）` : ''}
              </dd>
            </div>
            <div>
              <dt>途中の沈黙</dt>
              <dd>{state.metrics.gapMs ?? '—'} ms</dd>
            </div>
            <div>
              <dt>考える</dt>
              <dd>{state.metrics.thinkMs ?? '—'} ms</dd>
            </div>
            <div>
              <dt>声を作る</dt>
              <dd>{state.metrics.ttsMs ?? '—'} ms</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  )
}
