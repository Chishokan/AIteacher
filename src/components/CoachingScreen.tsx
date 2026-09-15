import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MicButton, TalkMetrics, TalkStage } from './TalkStage'
import { useChatTurn, type AnsweredTurn } from '../chat/useChatTurn'
import { createApiReplySource } from '../chat/apiReplySource'
import { createDummyReplySource } from '../chat/reply'
import { useChatVoice } from '../chat/useChatVoice'
import { DEFAULT_AGENDA, totalTurns } from '../coaching/agenda'
import { planAt, stepAt } from '../coaching/plan'
import { buildRecord, csvFileName, recordToCSV, type CoachingRecord } from '../coaching/record'
import { saveCoachingRecord } from '../coaching/storage'
import { downloadText } from '../logic/interview'
import type { Settings } from '../logic/settings'
import type { ChatPhase } from '../chat/types'
import { MIC_MESSAGES, type MicStatus } from '../speech/mic'

/**
 * コーチングタイムの聞き取り（東進高校生部門）。
 *
 * 雑談と同じしくみ（押して話す・つなぎ言葉・AivisSpeech）で動くが、
 * **聞くことが決まっている**ところが違う。質問は `coaching/agenda.ts` の
 * 文言をそのまま読み上げ、AI には受けとめと短い深掘りだけをさせる。
 *
 * 終わると、項目ごとの聞き取り結果を出して、この端末に保存する。
 */

interface CoachingScreenProps {
  avatarId: string
  micStatus: MicStatus
  settings: Settings
  studentName?: string
  onClose: () => void
}

const STATUS: Record<ChatPhase, string> = {
  idle: 'あなたの番です',
  recording: '聞いています',
  thinking: '考えています',
  speaking: '話しています',
  finished: 'おつかれさま',
}

export function CoachingScreen({
  avatarId,
  micStatus,
  settings,
  studentName,
  onClose,
}: CoachingScreenProps) {
  const agenda = DEFAULT_AGENDA
  const { voice, browserVoice, isFillerReady } = useChatVoice(settings, studentName)

  const replySource = useMemo(
    () => (settings.chatUseApi ? createApiReplySource('coaching') : createDummyReplySource()),
    [settings.chatUseApi],
  )

  /** 項目ごとに、聞き取った言葉を話した順にためる */
  const answersRef = useRef(new Map<string, string[]>())
  const startedAtRef = useRef(new Date().toISOString())
  const [answered, setAnswered] = useState(0)
  const [record, setRecord] = useState<CoachingRecord | null>(null)

  const planTurn = useCallback((index: number) => planAt(agenda, index), [agenda])

  const onAnswer = useCallback(({ topicId, transcript }: AnsweredTurn) => {
    if (!topicId) return
    const said = answersRef.current.get(topicId) ?? []
    answersRef.current.set(topicId, [...said, transcript])
    setAnswered((count) => count + 1)
  }, [])

  const openingLines = useMemo(
    () => [agenda.greeting, agenda.topics[0]?.prompt ?? ''],
    [agenda],
  )

  const { state, actions } = useChatTurn({
    opening: agenda.greeting,
    openingLines,
    replySource,
    voice,
    fallbackVoice: browserVoice,
    fillerEnabled: settings.chatFillerEnabled,
    isFillerReady,
    studentName,
    planTurn,
    onAnswer,
  })

  useEffect(() => {
    // 開発モードでは効果が二度呼ばれる。すぐに始めず一拍おいて、
    // 片付けで取り消すことで、あいさつを 2 回作らせない
    const timer = setTimeout(() => void actions.begin(), 0)
    return () => {
      clearTimeout(timer)
      actions.stop()
    }
    // 画面を開いたときに一度だけ始める
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 話し終わったら、記録を組み立てて 1 度だけ保存する
  useEffect(() => {
    if (state.phase !== 'finished' || record) return
    const built = buildRecord(agenda, answersRef.current, {
      id: `coaching-${Date.now()}`,
      studentName: studentName ?? '',
      startedAt: startedAtRef.current,
      finishedAt: new Date().toISOString(),
    })
    setRecord(built)
    saveCoachingRecord(built)
  }, [agenda, record, state.phase, studentName])

  const micWarning = micStatus !== 'granted' && micStatus !== 'unsupported'
  const micDisabled = state.phase === 'speaking' || state.phase === 'thinking' || !!state.fatal

  // いま何番目の項目を聞いているか。生徒が次に話す番のものを出す
  const step = stepAt(agenda, answered)
  const asking = step.topic ?? agenda.topics[agenda.topics.length - 1]

  return (
    <div className="chat">
      <div className="appbar">
        <h1 className="appbar__title">コーチングタイム</h1>
        <span className="appbar__badge">{settings.chatUseApi ? 'おためし' : 'ダミー返事'}</span>
        <span className="appbar__badge appbar__badge--quiet">
          {studentName || '名前なし'}
        </span>
        <span className="spacer" />
        <button type="button" className="btn" onClick={onClose}>
          終わる
        </button>
      </div>

      {record ? (
        <CoachingResult record={record} onClose={onClose} />
      ) : (
        <>
          <div className="coach__progress">
            <span className="coach__progress-step">
              {Math.min(step.topicIndex + 1, agenda.topics.length)} / {agenda.topics.length}
            </span>
            <span className="coach__progress-title">{asking?.title}</span>
            <span className="coach__progress-bar" aria-hidden="true">
              <span style={{ width: `${(answered / totalTurns(agenda)) * 100}%` }} />
            </span>
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

            <MicButton phase={state.phase} disabled={micDisabled} onPress={actions.pressMic} />

            {state.metrics && <TalkMetrics metrics={state.metrics} />}
          </div>
        </>
      )}
    </div>
  )
}

/** 聞き取った内容のまとめ。コーチが見る画面 */
function CoachingResult({ record, onClose }: { record: CoachingRecord; onClose: () => void }) {
  const rate = record.items.find((item) => item.rate !== null)?.rate ?? null

  return (
    <div className="coach__result">
      <p className="coach__result-note">
        聞き取った内容です。この端末の中だけに保存しました。
      </p>

      {rate !== null && (
        <div className="coach__rate">
          <span className="coach__rate-label">今週の計画実行率</span>
          <span className="coach__rate-value">{rate}%</span>
        </div>
      )}

      <dl className="coach__items">
        {record.items.map((item) => (
          <div key={item.topicId} className="coach__item">
            <dt>{item.title}</dt>
            <dd>
              {item.transcript || <span className="coach__item-empty">聞き取れませんでした</span>}
            </dd>
          </div>
        ))}
      </dl>

      <div className="chat__finished-buttons">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => downloadText(csvFileName(record), recordToCSV(record), 'text/csv')}
        >
          CSV で書き出す
        </button>
        <button type="button" className="btn" onClick={onClose}>
          終わる
        </button>
      </div>
    </div>
  )
}
