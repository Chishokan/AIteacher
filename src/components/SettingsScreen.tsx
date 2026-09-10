import { AvatarPicker } from './AvatarPicker'
import { SubjectEditor } from './SubjectEditor'
import { useJapaneseVoices } from '../hooks/useVoices'
import { defaultSettings, type Settings } from '../logic/settings'
import { speak } from '../speech/tts'

interface SettingsScreenProps {
  settings: Settings
  onChange: (settings: Settings) => void
  onClose: () => void
}

export function SettingsScreen({ settings, onChange, onClose }: SettingsScreenProps) {
  const voices = useJapaneseVoices()
  const patch = (next: Partial<Settings>) => onChange({ ...settings, ...next })

  const preview = () => {
    void speak('こんにちは。国語のテストは何点でしたか。', {
      rate: settings.rate,
      pitch: settings.pitch,
      voiceURI: settings.voiceURI,
    })
  }

  return (
    <div className="settings">
      <div className="appbar">
        <h1 className="appbar__title">設定</h1>
        <span className="spacer" />
        <button type="button" className="btn" onClick={onClose}>
          閉じる
        </button>
      </div>

      <div className="card">
        <label className="field">
          <span>面談の名前</span>
          <input
            className="input"
            value={settings.title}
            onChange={(event) => patch({ title: event.target.value })}
          />
        </label>
      </div>

      <div className="card">
        <div className="field">
          <span>アバター</span>
          <AvatarPicker value={settings.avatarId} onChange={(avatarId) => patch({ avatarId })} />
        </div>
      </div>

      <div className="card">
        <SubjectEditor
          label="定期テストで点数を聞く教科"
          subjects={settings.testSubjects}
          onChange={(testSubjects) => patch({ testSubjects })}
        />
      </div>

      <div className="card">
        <SubjectEditor
          label="通知表で評定を聞く教科"
          subjects={settings.reportSubjects}
          onChange={(reportSubjects) => patch({ reportSubjects })}
        />
      </div>

      <div className="card">
        <label className="field">
          <span>定期テストの満点：{settings.maxScore}点</span>
          <input
            className="input"
            type="number"
            min={10}
            max={1000}
            step={5}
            value={settings.maxScore}
            onChange={(event) => patch({ maxScore: Number(event.target.value) || 100 })}
          />
        </label>
      </div>

      <div className="card">
        <div className="field">
          <span>声</span>
          <select
            className="select"
            value={settings.voiceURI ?? ''}
            onChange={(event) => patch({ voiceURI: event.target.value || undefined })}
          >
            <option value="">自動で選ぶ</option>
            {voices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name}
              </option>
            ))}
          </select>
          {voices.length === 0 && (
            <span className="muted">日本語の音声が見つかりませんでした（端末の設定を確認してください）</span>
          )}
        </div>

        <label className="field" style={{ marginTop: 16 }}>
          <span>話す速さ：{settings.rate.toFixed(1)}</span>
          <input
            type="range"
            min={0.6}
            max={1.6}
            step={0.1}
            value={settings.rate}
            onChange={(event) => patch({ rate: Number(event.target.value) })}
          />
        </label>

        <label className="field">
          <span>声の高さ：{settings.pitch.toFixed(1)}</span>
          <input
            type="range"
            min={0.6}
            max={1.8}
            step={0.1}
            value={settings.pitch}
            onChange={(event) => patch({ pitch: Number(event.target.value) })}
          />
        </label>

        <button type="button" className="btn" onClick={preview}>
          声を試す
        </button>
      </div>

      <div className="card">
        <label className="field">
          <span>話し始めるまでの待ち時間：{settings.listenTimeoutSec}秒</span>
          <input
            type="range"
            min={3}
            max={20}
            step={1}
            value={settings.listenTimeoutSec}
            onChange={(event) => patch({ listenTimeoutSec: Number(event.target.value) })}
          />
        </label>

        <label className="row" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            style={{ width: 28, height: 28 }}
            checked={settings.confirmAnswers}
            onChange={(event) => patch({ confirmAnswers: event.target.checked })}
          />
          <span>答えを復唱して確認する</span>
        </label>
      </div>

      <div className="row">
        <button type="button" className="btn btn--danger" onClick={() => onChange(defaultSettings)}>
          初期設定にもどす
        </button>
      </div>
    </div>
  )
}
