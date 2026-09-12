import { useCallback, useEffect, useMemo, useState } from 'react'
import { StartScreen } from './components/StartScreen'
import { InterviewScreen } from './components/InterviewScreen'
import { ResultScreen } from './components/ResultScreen'
import { SettingsScreen } from './components/SettingsScreen'
import { HistoryScreen } from './components/HistoryScreen'
import { buildScenario } from './data/scenario'
import { useInterview } from './hooks/useInterview'
import { loadSessions, loadSettings, saveSession, saveSettings, deleteSession } from './logic/storage'
import type { Settings } from './logic/settings'
import type { Session } from './types'
import { unlockSpeechSynthesis } from './speech/tts'
import { unlockAudio } from './speech/clips'
import { requestMicrophone, type MicStatus } from './speech/mic'

type Screen = 'start' | 'interview' | 'result' | 'settings' | 'history'

export function App() {
  const [screen, setScreen] = useState<Screen>('start')
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions())
  const [viewing, setViewing] = useState<Session | null>(null)
  const [studentName, setStudentName] = useState('')
  /** マイクの使用許可。はじめるボタンを押したときに確かめる */
  const [micStatus, setMicStatus] = useState<MicStatus>('unsupported')
  /** 許可のダイアログを出している最中 */
  const [preparingMic, setPreparingMic] = useState(false)

  const scenario = useMemo(
    () =>
      buildScenario({
        title: settings.title,
        testSubjects: settings.testSubjects,
        reportSubjects: settings.reportSubjects,
        maxScore: settings.maxScore,
        includeReport: settings.includeReport,
        includeReview: settings.includeReview,
        includeGoal: settings.includeGoal,
      }),
    [
      settings.title,
      settings.testSubjects,
      settings.reportSubjects,
      settings.maxScore,
      settings.includeReport,
      settings.includeReview,
      settings.includeGoal,
    ],
  )

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  const handleFinish = useCallback((session: Session) => {
    saveSession(session)
    setSessions(loadSessions())
    setViewing(session)
    setScreen('result')
  }, [])

  const { state, actions } = useInterview({ scenario, settings, onFinish: handleFinish })

  const begin = useCallback(
    async (name: string) => {
      // iOS は最初の再生をユーザー操作の中で行う必要がある
      unlockSpeechSynthesis()
      unlockAudio()

      // 読み上げが終わってから音声認識が始まるころには、ブラウザが
      // 「ユーザー操作の直後」とみなす時間を過ぎていて許可を聞けない。
      // ボタンを押したこの場で許可を取っておく
      setPreparingMic(true)
      const status = await requestMicrophone()
      setPreparingMic(false)
      setMicStatus(status)

      setStudentName(name)
      setScreen('interview')
      void actions.start(name)
    },
    [actions],
  )

  const stopInterview = useCallback(() => {
    actions.stop()
    setScreen('start')
  }, [actions])

  // 面談中に画面を閉じたり、別のタブに移ったら読み上げを止める
  useEffect(() => {
    const onHidden = () => {
      if (document.hidden && screen === 'interview') actions.stop()
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [actions, screen])

  return (
    <div className="app">
      {screen === 'start' && (
        <StartScreen
          scenario={scenario}
          avatarId={settings.avatarId}
          preparingMic={preparingMic}
          onStart={(name) => void begin(name)}
          onOpenSettings={() => setScreen('settings')}
          onOpenHistory={() => setScreen('history')}
        />
      )}

      {screen === 'interview' && (
        <InterviewScreen
          scenario={scenario}
          avatarId={settings.avatarId}
          micStatus={micStatus}
          state={state}
          onRepeat={actions.repeat}
          onListenNow={actions.listenNow}
          onSkip={actions.skip}
          onStop={stopInterview}
          onAnswer={actions.answerByTouch}
        />
      )}

      {screen === 'result' && viewing && (
        <ResultScreen
          session={viewing}
          onRestart={() => void begin(studentName || viewing.studentName)}
          onHome={() => setScreen('start')}
        />
      )}

      {screen === 'settings' && (
        <SettingsScreen settings={settings} onChange={setSettings} onClose={() => setScreen('start')} />
      )}

      {screen === 'history' && (
        <HistoryScreen
          sessions={sessions}
          onOpen={(session) => {
            setViewing(session)
            setScreen('result')
          }}
          onDelete={(id) => {
            deleteSession(id)
            setSessions(loadSessions())
          }}
          onClose={() => setScreen('start')}
        />
      )}
    </div>
  )
}
