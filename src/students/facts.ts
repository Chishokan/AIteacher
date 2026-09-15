import { formatDate } from './match'
import { formatProgress, type Student } from './types'

/**
 * 名簿から分かっていることを、アバターに渡す短い文にする。
 *
 * **渡すのは必要な分だけ。** ここに書いたことしか言わないよう指示してあるので、
 * 多く渡すほど会話に混ざりやすくなる。志望校や成績で急かす言い方をさせないため、
 * 触れてよい範囲もサーバー側の指示文で絞ってある（`server/prompts.ts`）。
 *
 * 副作用のない関数（`__tests__/facts.test.ts`）。
 */
export function studentFacts(student: Student | null): string[] {
  if (!student) return []
  const facts: string[] = []

  if (student.courses.length > 0) facts.push(`取得している講座は ${student.courses.join('、')}`)
  for (const progress of student.progress.slice(0, 4)) {
    facts.push(`${progress.course} の進み具合は ${formatProgress(progress)}`)
  }
  if (student.nextVisit) facts.push(`次の来校予定は ${formatDate(student.nextVisit)}`)
  if (student.attendance) facts.push(`来校状況は「${student.attendance}」`)
  if (student.school) facts.push(`志望校は ${student.school}`)

  return facts
}
