import type { Session } from '../types'
import {
  averageScore,
  downloadText,
  formatAnswer,
  gradeTotal,
  groupBySection,
  toCSV,
} from '../logic/interview'

interface ResultScreenProps {
  session: Session
  onRestart: () => void
  onHome: () => void
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fileStamp(iso: string): string {
  return iso.replace(/[:.]/g, '-').slice(0, 16)
}

export function ResultScreen({ session, onRestart, onHome }: ResultScreenProps) {
  const questions = session.questions
  const answers = new Map(session.answers.map((a) => [a.questionId, a]))
  const average = averageScore(questions, answers)
  const grades = gradeTotal(questions, answers)
  const skipped = session.answers.filter((a) => a.skipped).length

  const baseName = `${session.studentName}_${fileStamp(session.startedAt)}`

  return (
    <div className="result">
      <div className="row no-print">
        <h1 className="appbar__title">聞き取りの結果</h1>
        <span className="spacer" />
        <button
          type="button"
          className="btn"
          onClick={() => downloadText(`${baseName}.csv`, toCSV(session, questions), 'text/csv')}
        >
          CSVで保存
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            downloadText(`${baseName}.json`, JSON.stringify(session, null, 2), 'application/json')
          }
        >
          JSONで保存
        </button>
        <button type="button" className="btn" onClick={() => window.print()}>
          印刷
        </button>
      </div>

      <div className="result__scroll">
        <div className="card">
          <div className="row">
            <div>
              <div className="summary__label">生徒名</div>
              <div className="summary__value">{session.studentName}</div>
            </div>
            <span className="spacer" />
            <div className="muted">{formatDateTime(session.startedAt)}</div>
          </div>
        </div>

        <div className="summary">
          <div className="summary__item">
            <div className="summary__label">定期テスト平均</div>
            <div className="summary__value">{average === null ? '—' : `${average}点`}</div>
          </div>
          <div className="summary__item">
            <div className="summary__label">評定合計</div>
            <div className="summary__value">
              {grades === null ? '—' : `${grades.total}`}
              {grades && <span className="muted" style={{ fontSize: 16 }}> / {grades.count * 5}</span>}
            </div>
          </div>
          <div className="summary__item">
            <div className="summary__label">評定平均</div>
            <div className="summary__value">
              {grades === null ? '—' : (Math.round((grades.total / grades.count) * 10) / 10).toFixed(1)}
            </div>
          </div>
          <div className="summary__item">
            <div className="summary__label">未回答</div>
            <div className="summary__value">{skipped}問</div>
          </div>
        </div>

        {groupBySection(questions).map((group) => (
          <div className="card" key={group.section}>
            <h2 className="caption__section">{group.section}</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>項目</th>
                  <th>回答</th>
                  <th>入力</th>
                </tr>
              </thead>
              <tbody>
                {group.questions.map((question) => {
                  const answer = answers.get(question.id)
                  return (
                    <tr key={question.id}>
                      <td>{question.label ?? question.prompt}</td>
                      <td className={`value${answer?.skipped ? ' skipped' : ''}`}>
                        {formatAnswer(question, answer)}
                      </td>
                      <td className="muted">
                        {answer ? (answer.viaTouch ? '画面' : '音声') : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="controls no-print">
        <button type="button" className="btn btn--primary" onClick={onRestart}>
          もう一度おこなう
        </button>
        <button type="button" className="btn" onClick={onHome}>
          最初にもどる
        </button>
      </div>
    </div>
  )
}
