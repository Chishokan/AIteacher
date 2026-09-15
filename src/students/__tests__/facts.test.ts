import { describe, expect, it } from 'vitest'
import { studentFacts } from '../facts'
import type { Student } from '../types'

const student: Student = {
  id: '1',
  name: '山田 太郎',
  attendance: '順調',
  nextVisit: '2026-09-18',
  courses: ['英語長文', '数学I'],
  progress: [
    { course: '英語長文', done: 12, total: 20, raw: '英語長文 12/20' },
    { course: '数学I', done: 5, total: 15, raw: '数学I 5/15' },
  ],
  school: '東京大学',
  extra: {},
}

describe('studentFacts', () => {
  it('名簿の内容を、短い文にして渡す', () => {
    const facts = studentFacts(student)
    expect(facts).toContain('取得している講座は 英語長文、数学I')
    expect(facts).toContain('英語長文 の進み具合は 12/20（60%）')
    expect(facts).toContain('次の来校予定は 9月18日（金）')
    expect(facts).toContain('志望校は 東京大学')
  })

  it('名簿に無ければ、何も渡さない（推測で補わせない）', () => {
    expect(studentFacts(null)).toEqual([])
    expect(
      studentFacts({ ...student, courses: [], progress: [], nextVisit: '', attendance: '', school: '' }),
    ).toEqual([])
  })

  it('講座が多すぎるときは絞る（会話に混ざりすぎないように）', () => {
    const many = {
      ...student,
      progress: Array.from({ length: 10 }, (_, i) => ({
        course: `講座${i}`,
        done: i,
        total: 10,
        raw: '',
      })),
    }
    expect(studentFacts(many).filter((f) => f.includes('進み具合'))).toHaveLength(4)
  })
})
