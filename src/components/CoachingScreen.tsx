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
import { createStudentSource } from '../students/source'
import { lookupStudent, formatDate } from '../students/match'
import { studentFacts } from '../students/facts'
import type { Student } from '../students/types'
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
  /** 東進ID。名簿とはこれで突き合わせる（名前は同姓があると当てられない） */
  toshinId?: string
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
  toshinId,
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

  /**
   * 名簿から引き当てた生徒。
   * 見つからなければ null のまま。**名簿が無くても聞き取りは進む。**
   */
  const [student, setStudent] = useState<Student | null>(null)
  const [rosterNotice, setRosterNotice] = useState('')
  const studentRef = useRef<Student | null>(null)

  useEffect(() => {
    if (!toshinId?.trim() && !studentName?.trim()) {
      setRosterNotice('東進ID も名前も入っていないので、名簿とは照らし合わせません。')
      return
    }
    let active = true
    void createStudentSource(settings.studentSource).load().then((result) => {
      if (!active) return
      if (!result.ok) {
        // 名簿が読めなくても聞き取りは続ける。理由だけ出す
        setRosterNotice(result.kind === 'unconfigured' ? '' : result.message)
        return
      }
      // 東進ID があればそれで引く。無ければ名前で探す（同姓がいると当てられない）
      const found = lookupStudent(result.students, { id: toshinId, name: studentName })
      studentRef.current = found
      setStudent(found)
      setRosterNotice(
        found
          ? ''
          : toshinId?.trim()
            ? `名簿に東進ID「${toshinId}」が見つかりませんでした。`
            : `名簿に「${studentName}」が見つかりませんでした。東進ID を入れると確実に引き当てられます。`,
      )
    })
    return () => {
      active = false
    }
  }, [settings.studentSource, studentName, toshinId])

  const facts = useMemo(() => studentFacts(student), [student])

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
    facts,
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
    const built = buildRecord(
      agenda,
      answersRef.current,
      {
        id: `coaching-${Date.now()}`,
        studentName: studentRef.current?.name || (studentName ?? ''),
        // 記録を名簿に突き合わせ直せるよう、東進ID も残す
        toshinId: studentRef.current?.id || (toshinId ?? ''),
        startedAt: startedAtRef.current,
        finishedAt: new Date().toISOString(),
      },
      studentRef.current,
    )
    setRecord(built)
    saveCoachingRecord(built)
  }, [agenda, record, state.phase, studentName, toshinId])

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
          {student?.name || studentName || '名前なし'}
          {student ? `（${student.id}）` : ''}
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
          {student && (
            <div className="coach__student">
              {student.attendance && (
                <span className="coach__student-tag">来校 {student.attendance}</span>
              )}
              {student.nextVisit && (
                <span className="coach__student-tag">次回 {formatDate(student.nextVisit)}</span>
              )}
              {student.school && <span className="coach__student-tag">{student.school}</span>}
              {student.progress.map((p) => (
                <span key={p.course} className="coach__student-tag">
                  {p.course} {p.done ?? '?'}/{p.total ?? '?'}
                </span>
              ))}
            </div>
          )}

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
            {rosterNotice && !micWarning && <p className="banner banner--warn">{rosterNotice}</p>}
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

      {record.roster && (
        <div className="coach__student">
          {record.roster.attendance && (
            <span className="coach__student-tag">来校 {record.roster.attendance}</span>
          )}
          {record.roster.nextVisit && (
            <span className="coach__student-tag">
              名簿の次回来校 {formatDate(record.roster.nextVisit)}
            </span>
          )}
          {record.roster.school && (
            <span className="coach__student-tag">{record.roster.school}</span>
          )}
          {record.roster.slowest && (
            <span className="coach__student-tag">遅れ気味 {record.roster.slowest}</span>
          )}
          {record.roster.matchedCourses.length > 0 && (
            <span className="coach__student-tag">
              今日の講座 {record.roster.matchedCourses.join('、')}（取得講座と一致）
            </span>
          )}
          {record.roster.courseUnmatched && (
            <span className="coach__student-tag coach__student-tag--warn">
              今日の講座が取得講座に当たりません
            </span>
          )}
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
