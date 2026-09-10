import type { Answer, Question, Session } from '../types'

/** 回答を人に見せる形にする */
export function formatAnswer(question: Question, answer: Answer | undefined): string {
  if (!answer) return '—'
  if (answer.skipped) return '（答えなし）'
  switch (question.kind) {
    case 'score':
      return answer.value === undefined ? '—' : `${answer.value}点`
    case 'grade':
      return answer.value === undefined ? '—' : `評定 ${answer.value}`
    default:
      return answer.text?.trim() || '—'
  }
}

/** アバターが復唱して確認する文章 */
export function confirmSentence(question: Question, answer: Answer): string {
  const subject = question.label ?? ''
  switch (question.kind) {
    case 'score':
      return `${subject}は、${answer.value}点ですね。あっていますか。`
    case 'grade':
      return `${subject}は、${answer.value}ですね。あっていますか。`
    default:
      return `「${answer.text}」ですね。あっていますか。`
  }
}

/** 質問を章ごとにまとめる */
export function groupBySection(questions: Question[]): Array<{ section: string; questions: Question[] }> {
  const groups: Array<{ section: string; questions: Question[] }> = []
  for (const question of questions) {
    const last = groups[groups.length - 1]
    if (last && last.section === question.section) last.questions.push(question)
    else groups.push({ section: question.section, questions: [question] })
  }
  return groups
}

/** 定期テストの平均点。回答がなければ null */
export function averageScore(questions: Question[], answers: Map<string, Answer>): number | null {
  const values = questions
    .filter((q) => q.kind === 'score' && q.section === '定期テストの得点')
    .map((q) => answers.get(q.id))
    .filter((a): a is Answer => !!a && !a.skipped && a.value !== undefined)
    .map((a) => a.value!)
  if (values.length === 0) return null
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10
}

/** 通知表の評定合計。回答がなければ null */
export function gradeTotal(
  questions: Question[],
  answers: Map<string, Answer>,
): { total: number; count: number } | null {
  const values = questions
    .filter((q) => q.kind === 'grade')
    .map((q) => answers.get(q.id))
    .filter((a): a is Answer => !!a && !a.skipped && a.value !== undefined)
    .map((a) => a.value!)
  if (values.length === 0) return null
  return { total: values.reduce((sum, v) => sum + v, 0), count: values.length }
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** 結果を CSV にする（Excel で開けるよう BOM 付き） */
export function toCSV(session: Session, questions: Question[]): string {
  const answers = new Map(session.answers.map((a) => [a.questionId, a]))
  const rows: string[][] = [
    ['生徒名', '実施日時', '区分', '項目', '回答', '入力方法', '聞き取り原文'],
  ]
  for (const question of questions) {
    const answer = answers.get(question.id)
    rows.push([
      session.studentName,
      session.startedAt,
      question.section,
      question.label ?? question.prompt,
      formatAnswer(question, answer),
      answer ? (answer.viaTouch ? '画面入力' : '音声') : '',
      answer?.transcript ?? '',
    ])
  }
  return '﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

/** 文字列をファイルとしてダウンロードさせる */
export function downloadText(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
