import { useState } from 'react'
import { Avatar } from './Avatar'
import type { Scenario } from '../types'
import { isSpeechRecognitionSupported } from '../speech/stt'
import { isSpeechSynthesisSupported } from '../speech/tts'

interface StartScreenProps {
  scenario: Scenario
  /** アバターの見た目 */
  avatarId: string
  onStart: (studentName: string) => void
  onOpenSettings: () => void
  onOpenHistory: () => void
}

export function StartScreen({
  scenario,
  avatarId,
  onStart,
  onOpenSettings,
  onOpenHistory,
}: StartScreenProps) {
  const [name, setName] = useState('')

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
        {canListen && !secure && (
          <p className="banner banner--warn">
            https（または localhost）で開かないとマイクが使えません。
          </p>
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

        <button type="button" className="btn btn--primary btn--lg btn--block" onClick={() => onStart(name)}>
          はじめる
        </button>

        <div className="row">
          <button type="button" className="btn" onClick={onOpenSettings}>
            設定
          </button>
          <button type="button" className="btn" onClick={onOpenHistory}>
            これまでの記録
          </button>
        </div>
      </div>
    </div>
  )
}
