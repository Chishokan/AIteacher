import { describe, expect, it } from 'vitest'
import { checkVisit, findStudent, formatDate, matchCourses, slowestCourse, spokenDate } from '../match'
import type { Student } from '../types'

const TODAY = new Date(2026, 8, 15) // 2026-09-15（火）

const student = (over: Partial<Student>): Student => ({
  id: '1',
  name: '山田 太郎',
  attendance: '順調',
  nextVisit: '2026-09-18',
  courses: ['英語長文', '数学I'],
  progress: [],
  school: '東京大学',
  extra: {},
  ...over,
})

describe('findStudent', () => {
  const roster = [student({}), student({ id: '2', name: '鈴木 花子' })]

  it('名前で引き当てる', () => {
    expect(findStudent(roster, '山田 太郎')?.id).toBe('1')
  })

  it('空白や全角半角のゆれを吸収する', () => {
    expect(findStudent(roster, '山田太郎')?.id).toBe('1')
    expect(findStudent(roster, ' 山田　太郎 ')?.id).toBe('1')
  })

  it('名字だけでも、1 人に絞れるなら当てる', () => {
    expect(findStudent(roster, '山田')?.id).toBe('1')
  })

  it('2 人以上に当たるときは、当てずに null（取り違えないため）', () => {
    const twoYamada = [student({}), student({ id: '2', name: '山田 次郎' })]
    expect(findStudent(twoYamada, '山田')).toBeNull()
  })

  it('名簿にいなければ null', () => {
    expect(findStudent(roster, '田中')).toBeNull()
    expect(findStudent(roster, '')).toBeNull()
  })
})

describe('matchCourses', () => {
  const courses = ['英語長文', '数学I', '古文']

  it('話に出てきた講座を拾う', () => {
    expect(matchCourses('今日は英語長文を2コマ進める予定', courses)).toEqual(['英語長文'])
  })

  it('複数出てきたら、全部拾う', () => {
    expect(matchCourses('英語長文と古文をやる', courses)).toEqual(['英語長文', '古文'])
  })

  it('取っていない講座の名前は拾わない', () => {
    expect(matchCourses('物理をやる予定', courses)).toEqual([])
  })

  it('カタカナ・ひらがなのゆれを吸収する', () => {
    expect(matchCourses('こぶんをやる', ['古文', 'コブン'])).toContain('コブン')
  })
})

describe('spokenDate', () => {
  it('きょう・あした・あさって', () => {
    expect(spokenDate('きょう行くよ', TODAY)).toBe('2026-09-15')
    expect(spokenDate('あした来ます', TODAY)).toBe('2026-09-16')
    expect(spokenDate('あさってかな', TODAY)).toBe('2026-09-17')
  })

  it('月日で言う', () => {
    expect(spokenDate('9月18日に行く', TODAY)).toBe('2026-09-18')
    expect(spokenDate('9/18', TODAY)).toBe('2026-09-18')
  })

  it('曜日で言うと、次のその曜日になる', () => {
    // 2026-09-15 は火曜。次の木曜は 17 日
    expect(spokenDate('木曜に行くよ', TODAY)).toBe('2026-09-17')
    // 同じ曜日を言われたら、来週のその日
    expect(spokenDate('火曜かな', TODAY)).toBe('2026-09-22')
    expect(spokenDate('来週の木曜', TODAY)).toBe('2026-09-24')
  })

  it('日付が読み取れなければ null', () => {
    expect(spokenDate('まだ決めてない', TODAY)).toBeNull()
    expect(spokenDate('', TODAY)).toBeNull()
  })
})

describe('checkVisit', () => {
  it('名簿の予定と合っていれば match', () => {
    expect(checkVisit('2026-09-18', '9月18日に行くよ', TODAY)).toMatchObject({ status: 'match' })
  })

  it('食い違っていたら、両方を残す（どちらが正しいかは決めない）', () => {
    expect(checkVisit('2026-09-18', 'あした行くよ', TODAY)).toEqual({
      status: 'differ',
      planned: '2026-09-18',
      said: '2026-09-16',
    })
  })

  it('日付が聞き取れないときや、名簿に予定が無いときは unknown', () => {
    expect(checkVisit('2026-09-18', 'まだ決めてない', TODAY).status).toBe('unknown')
    expect(checkVisit('', 'あした行くよ', TODAY).status).toBe('unknown')
  })
})

describe('formatDate', () => {
  it('読みやすい形にする', () => {
    expect(formatDate('2026-09-18')).toBe('9月18日（金）')
  })

  it('日付でないものは、そのまま返す', () => {
    expect(formatDate('未定')).toBe('未定')
  })
})

describe('slowestCourse', () => {
  it('いちばん遅れている講座を返す', () => {
    const progress = [
      { course: '英語長文', done: 12, total: 20, raw: '' },
      { course: '数学I', done: 3, total: 15, raw: '' },
    ]
    expect(slowestCourse(progress)?.course).toBe('数学I')
  })

  it('コマ数が分からないものしか無ければ null', () => {
    expect(slowestCourse([{ course: '古文', done: null, total: null, raw: '' }])).toBeNull()
    expect(slowestCourse([])).toBeNull()
  })
})
