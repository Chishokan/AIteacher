import { AvatarPicker } from './AvatarPicker'
import { useAivisVoices } from '../chat/useAivisVoices'
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
  const aivis = useAivisVoices()
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
        <div className="field">
          <span>話して聞き取る機能（おためし）</span>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            コーチングタイムの聞き取りと雑談です。定期テストの聞き取りとは別の機能で、
            切っても聞き取りには影響しません。声の設定はどちらにも使われます。
          </p>
        </div>

        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.coachingEnabled}
            onChange={(event) => patch({ coachingEnabled: event.target.checked })}
          />
          <span>
            <strong>コーチングタイムの聞き取りを使う</strong>
            <span className="toggle__note">
              最初の画面に「コーチングタイムの聞き取り」が出ます。計画実行率・今日の講座・
              不安なこと・良かったことの4つを順に聞いて、記録に残します
            </span>
          </span>
        </label>

        {settings.coachingEnabled && (
          <label className="field" style={{ marginTop: 14 }}>
            <span>生徒名簿の出どころ</span>
            <select
              className="select"
              value={settings.studentSource}
              onChange={(event) =>
                patch({ studentSource: event.target.value === 'server' ? 'server' : 'local' })
              }
            >
              <option value="local">この端末に取り込んだ名簿</option>
              <option value="server">Supabase（サーバー経由）</option>
            </select>
            <span className="field__note">
              最初の画面の「生徒名簿」から取り込みます。Supabase を使うときは
              .env.local に SUPABASE_URL と SUPABASE_KEY を書いてください
            </span>
          </label>
        )}

        <label className="toggle" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={settings.chatEnabled}
            onChange={(event) => patch({ chatEnabled: event.target.checked })}
          />
          <span>
            <strong>雑談メニューを使う</strong>
            <span className="toggle__note">最初の画面に「雑談してみる」が出ます</span>
          </span>
        </label>

        {(settings.chatEnabled || settings.coachingEnabled) && (
          <>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.chatUseApi}
                onChange={(event) => patch({ chatUseApi: event.target.checked })}
              />
              <span>
                <strong>返事をAIに作ってもらう</strong>
                <span className="toggle__note">
                  切ると決まった文だけを返します。開発サーバーとAPIキーがなくても動きを試せます
                </span>
              </span>
            </label>

            <label className="toggle" style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={settings.chatFillerEnabled}
                onChange={(event) => patch({ chatFillerEnabled: event.target.checked })}
              />
              <span>
                <strong>つなぎ言葉で沈黙を埋める</strong>
                <span className="toggle__note">
                  「うんうん、なるほどねー。」などを先に言い、その裏で返事を作ります。
                  先に音声を作っておく必要があります（npm run gen:chat-audio）
                </span>
              </span>
            </label>

            {settings.chatEnabled && (
              <label className="field" style={{ marginTop: 14 }}>
                <span>雑談の 1 セットのやりとり（回）</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={20}
                  value={settings.chatTurnsPerSet}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (Number.isFinite(value)) {
                      patch({ chatTurnsPerSet: Math.min(20, Math.max(1, Math.round(value))) })
                    }
                  }}
                />
                <span className="field__note">
                  この回数を話すと、アバターが話をまとめて「またね」で締めます。
                  そのあとは「もう少し話す」を押すと続けられます
                </span>
              </label>
            )}

            {settings.chatEnabled && (
              <label className="field" style={{ marginTop: 14 }}>
                <span>雑談の最初のひとこと</span>
                <input
                  className="input"
                  value={settings.chatOpening}
                  onChange={(event) => patch({ chatOpening: event.target.value })}
                />
              </label>
            )}

            <div className="field" style={{ marginTop: 18 }}>
              <span>返事の声</span>
              <select
                className="select"
                value={settings.chatVoiceMode}
                onChange={(event) =>
                  patch({ chatVoiceMode: event.target.value === 'browser' ? 'browser' : 'aivis' })
                }
              >
                <option value="aivis">AivisSpeech（このPCで動かす）</option>
                <option value="browser">ブラウザの読み上げ</option>
              </select>
            </div>

            {settings.chatVoiceMode === 'aivis' && (
              <>
                {aivis.problem && <p className="banner banner--warn">{aivis.problem}</p>}

                <label className="field" style={{ marginTop: 12 }}>
                  <span>声とスタイル</span>
                  <select
                    className="select"
                    value={`${settings.chatVoiceSpeaker} / ${settings.chatVoiceStyle}`}
                    disabled={aivis.voices.length === 0}
                    onChange={(event) => {
                      const picked = aivis.voices.find((v) => v.label === event.target.value)
                      if (picked) patch({ chatVoiceSpeaker: picked.speaker, chatVoiceStyle: picked.style })
                    }}
                  >
                    {aivis.voices.length === 0 ? (
                      <option>{`${settings.chatVoiceSpeaker} / ${settings.chatVoiceStyle}`}</option>
                    ) : (
                      aivis.voices.map((choice) => (
                        <option key={choice.label} value={choice.label}>
                          {choice.label}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <label className="field">
                  <span>話す速さ：{settings.chatSpeedScale.toFixed(2)}</span>
                  <input
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.05}
                    value={settings.chatSpeedScale}
                    onChange={(event) => patch({ chatSpeedScale: Number(event.target.value) })}
                  />
                </label>

                <label className="field">
                  <span>声の高さ：{settings.chatPitchScale.toFixed(2)}</span>
                  <input
                    type="range"
                    min={-0.15}
                    max={0.15}
                    step={0.01}
                    value={settings.chatPitchScale}
                    onChange={(event) => patch({ chatPitchScale: Number(event.target.value) })}
                  />
                  <span className="muted" style={{ fontSize: 13 }}>
                    0 から動かすと音が荒れることがあります
                  </span>
                </label>

                <label className="field">
                  <span>抑揚の強さ：{settings.chatIntonationScale.toFixed(2)}</span>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={settings.chatIntonationScale}
                    onChange={(event) => patch({ chatIntonationScale: Number(event.target.value) })}
                  />
                </label>

                <label className="field">
                  <span>抑揚の動き：{settings.chatTempoDynamicsScale.toFixed(2)}</span>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={settings.chatTempoDynamicsScale}
                    onChange={(event) => patch({ chatTempoDynamicsScale: Number(event.target.value) })}
                  />
                  <span className="muted" style={{ fontSize: 13 }}>
                    上げると早口で生っぽい抑揚になります
                  </span>
                </label>
              </>
            )}
          </>
        )}
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
        <div className="field">
          <span>追加で聞く内容</span>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            ふだんは定期テストの得点だけを聞きます。必要なときにここで足してください。
          </p>
        </div>

        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.includeReport}
            onChange={(event) => patch({ includeReport: event.target.checked })}
          />
          <span>
            <strong>通知表の評定</strong>
            <span className="toggle__note">{settings.reportSubjects.length}教科ぶん質問が増えます</span>
          </span>
        </label>

        {settings.includeReport && (
          <div style={{ marginTop: 14 }}>
            <SubjectEditor
              label="通知表で評定を聞く教科"
              subjects={settings.reportSubjects}
              onChange={(reportSubjects) => patch({ reportSubjects })}
            />
          </div>
        )}

        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.includeReview}
            onChange={(event) => patch({ includeReview: event.target.checked })}
          />
          <span>
            <strong>ふりかえり</strong>
            <span className="toggle__note">今回の手ごたえと、そう感じた理由（2問）</span>
          </span>
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.includeGoal}
            onChange={(event) => patch({ includeGoal: event.target.checked })}
          />
          <span>
            <strong>次の目標</strong>
            <span className="toggle__note">伸ばしたい教科・目標点・今日から始めること（3問）</span>
          </span>
        </label>
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

        <label className="toggle" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={settings.confirmAnswers}
            onChange={(event) => patch({ confirmAnswers: event.target.checked })}
          />
          <span>
            <strong>答えを確認する</strong>
            <span className="toggle__note">聞き取った得点・評定を画面に出して、生徒に確かめてもらいます</span>
          </span>
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
