import type { Session } from '../types'
import { averageScore, downloadText, gradeTotal, toCSV } from '../logic/interview'

interface HistoryScreenProps {
  sessions: Session[]
  onOpen: (session: Session) => void
  onDelete: (id: string) => void
  onClose: () => void
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function HistoryScreen({ sessions, onOpen, onDelete, onClose }: HistoryScreenProps) {
  return (
    <div className="settings">
      <div className="appbar">
        <h1 className="appbar__title">これまでの記録</h1>
        <span className="appbar__badge">{sessions.length}件</span>
        <span className="spacer" />
        <button type="button" className="btn" onClick={onClose}>
          閉じる
        </button>
      </div>

      {sessions.length === 0 && (
        <div className="card">
          <p className="muted">まだ記録がありません。</p>
        </div>
      )}

      {sessions.map((session) => {
        const answers = new Map(session.answers.map((a) => [a.questionId, a]))
        const average = averageScore(session.questions, answers)
        const grades = gradeTotal(session.questions, answers)
        return (
          <div className="card" key={session.id}>
            <div className="row">
              <div>
                <div className="summary__label">{formatDate(session.startedAt)}</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{session.studentName}</div>
                <div className="muted" style={{ fontSize: 15, marginTop: 4 }}>
                  平均 {average === null ? '—' : `${average}点`} ／ 評定合計{' '}
                  {grades === null ? '—' : grades.total}
                </div>
              </div>
              <span className="spacer" />
              <button type="button" className="btn" onClick={() => onOpen(session)}>
                開く
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  downloadText(
                    `${session.studentName}_${session.startedAt.slice(0, 10)}.csv`,
                    toCSV(session, session.questions),
                    'text/csv',
                  )
                }
              >
                CSV
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  if (window.confirm(`${session.studentName} の記録を削除しますか？`)) onDelete(session.id)
                }}
              >
                削除
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
