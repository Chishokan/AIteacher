import { useEffect, useMemo, useState } from 'react'
import { Avatar } from './Avatar'
import type { Scenario } from '../types'
import { isSpeechRecognitionSupported } from '../speech/stt'
import { isSpeechSynthesisSupported } from '../speech/tts'
import { checkMicrophone, MIC_MESSAGES, type MicStatus } from '../speech/mic'
import { loadLocalRoster } from '../students/source'
import { findById } from '../students/match'

interface StartScreenProps {
  scenario: Scenario
  /** アバターの見た目 */
  avatarId: string
  /** マイクの許可を確認している最中 */
  preparingMic: boolean
  onStart: (studentName: string) => void
  onOpenSettings: () => void
  onOpenHistory: () => void
  /** 雑談メニュー。設定で切っているときは渡されない。名前はつなぎ言葉に使う */
  onOpenChat?: (who: StudentInput) => void
  /** コーチングタイムの聞き取り。設定で切っているときは渡されない */
  onOpenCoaching?: (who: StudentInput) => void
  /** 生徒名簿の取り込み */
  onOpenRoster: () => void
}

/** 誰の聞き取りか。東進ID があれば、名簿とはこちらで突き合わせる */
export interface StudentInput {
  name: string
  toshinId: string
}

export function StartScreen({
  scenario,
  avatarId,
  preparingMic,
  onStart,
  onOpenSettings,
  onOpenHistory,
  onOpenChat,
  onOpenCoaching,
  onOpenRoster,
}: StartScreenProps) {
  const [name, setName] = useState('')
  const [toshinId, setToshinId] = useState('')
  const [micStatus, setMicStatus] = useState<MicStatus>('unsupported')
  /** 名簿を取り込んであるときだけ、東進ID で引き当てられる */
  const [roster] = useState(() => loadLocalRoster())

  // 東進ID を入れたら、名簿から名前を出す。入力の手間を減らし、取り違えも防ぐ
  const matched = useMemo(() => (toshinId ? findById(roster, toshinId) : null), [roster, toshinId])
  useEffect(() => {
    if (matched) setName(matched.name)
  }, [matched])

  const who: StudentInput = { name, toshinId }

  // すでに拒否されている場合は、はじめる前に気づけるようにしておく
  useEffect(() => {
    let active = true
    void checkMicrophone().then((status) => active && setMicStatus(status))
    return () => {
      active = false
    }
  }, [])

  const canSpeak = isSpeechSynthesisSupported()
  const canListen = isSpeechRecognitionSupported()
  const secure = typeof window !== 'undefined' && window.isSecureContext

  // 設定で章を出し分けるので、いま入っているものだけを数えて出す
  const sections: Array<{ section: string; count: number }> = []
  for (const question of scenario.questions) {
    if (question.section === 'はじめに') continue
    const last = sections[sections.length - 1]
    if (last && last.section === question.section) last.count += 1
    else sections.push({ section: question.section, count: 1 })
  }

  return (
    <div className="start">
      <div className="start__avatar">
        <Avatar mood="happy" presetId={avatarId} />
      </div>

      <div className="start__panel">
        <div>
          <h1 className="start__title">{scenario.title}</h1>
          <p className="start__lead">
            アバターが質問します。マイクのマークが光ったら、声で答えてください。
            うまく聞き取れないときは、画面のボタンからも入力できます。
          </p>
        </div>

        <ul className="checklist">
          {sections.map(({ section, count }) => (
            <li key={section}>
              {section}を{count}問
            </li>
          ))}
          <li>答えた内容は、この端末の中だけに保存されます</li>
        </ul>

        {!canSpeak && (
          <p className="banner banner--danger">
            このブラウザは音声の読み上げに対応していません。字幕だけで進みます。
          </p>
        )}
        {!canListen && (
          <p className="banner banner--danger">
            このブラウザは音声認識に対応していません。Chrome か Safari をお使いください。
            画面入力だけでも回答できます。
          </p>
        )}
        {canListen && !secure && <p className="banner banner--danger">{MIC_MESSAGES.insecure}</p>}
        {canListen && secure && micStatus === 'denied' && (
          <p className="banner banner--danger">{MIC_MESSAGES.denied}</p>
        )}

        {roster.length > 0 && (
          <label className="field">
            <span>東進ID</span>
            <input
              className="input"
              value={toshinId}
              onChange={(event) => setToshinId(event.target.value)}
              placeholder="例）1001"
              inputMode="numeric"
              autoComplete="off"
            />
            <span className="field__note">
              {matched ? (
                <strong>{matched.name} さん（名簿と照らし合わせます）</strong>
              ) : toshinId ? (
                `名簿に見つかりません（${roster.length} 人ぶん取り込み済み）`
              ) : (
                `入れると名簿と照らし合わせます。${roster.length} 人ぶん取り込み済み`
              )}
            </span>
          </label>
        )}

        <label className="field">
          <span>生徒の名前</span>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例）山田 太郎"
            autoComplete="off"
            enterKeyHint="go"
            onKeyDown={(event) => {
              if (event.key === 'Enter') onStart(name)
            }}
          />
        </label>

        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          disabled={preparingMic}
          onClick={() => onStart(name)}
        >
          {preparingMic ? 'マイクの使用を許可してください…' : 'はじめる'}
        </button>
        {preparingMic && (
          <p className="muted" style={{ fontSize: 15 }}>
            画面に出た確認で「許可」を選んでください。許可すると面談が始まります。
          </p>
        )}

        {onOpenCoaching && (
          <button
            type="button"
            className="btn btn--block"
            disabled={preparingMic}
            onClick={() => onOpenCoaching(who)}
          >
            📋 コーチングタイムの聞き取り
          </button>
        )}

        {onOpenChat && (
          <button
            type="button"
            className="btn btn--block"
            disabled={preparingMic}
            onClick={() => onOpenChat(who)}
          >
            💬 雑談してみる（おためし）
          </button>
        )}

        <div className="row">
          <button type="button" className="btn" onClick={onOpenSettings}>
            設定
          </button>
          <button type="button" className="btn" onClick={onOpenHistory}>
            これまでの記録
          </button>
          <button type="button" className="btn" onClick={onOpenRoster}>
            生徒名簿
          </button>
        </div>
      </div>
    </div>
  )
}
