import { describe, expect, it } from 'vitest'
import { DEFAULT_AGENDA } from '../agenda'
import { buildRecord, csvFileName, recordToCSV } from '../record'
import type { Student } from '../../students/types'

const META = {
  id: 'coaching-1',
  studentName: '山田 太郎',
  toshinId: '1001',
  startedAt: '2026-09-15T10:00:00.000Z',
  finishedAt: '2026-09-15T10:05:00.000Z',
}

const STUDENT: Student = {
  id: '1001',
  name: '山田 太郎',
  attendance: '順調',
  nextVisit: '2026-09-18',
  courses: ['英語長文', '数学I'],
  progress: [
    { course: '英語長文', done: 12, total: 20, raw: '' },
    { course: '数学I', done: 3, total: 15, raw: '' },
  ],
  school: '東京大学',
  extra: {},
}

function record(answers: Record<string, string[]>, student?: Student | null) {
  return buildRecord(DEFAULT_AGENDA, new Map(Object.entries(answers)), META, student)
}

describe('buildRecord', () => {
  it('項目ごとに、聞き取った言葉を残す', () => {
    const built = record({
      'plan-rate': ['8割くらいかな'],
      'today-lesson': ['英語のリスニングを2コマやる'],
      worry: ['数学の進みが遅いのが心配'],
      'good-news': ['模試の判定が上がった'],
    })
    expect(built.items.map((i) => i.transcript)).toEqual([
      '8割くらいかな',
      '英語のリスニングを2コマやる',
      '数学の進みが遅いのが心配',
      '模試の判定が上がった',
    ])
  })

  it('実行率だけを数字にする', () => {
    const built = record({ 'plan-rate': ['8割くらいかな'] })
    expect(built.items[0]!.rate).toBe(80)
    // 割合でない項目は、数字にしない
    expect(built.items.slice(1).every((i) => i.rate === null)).toBe(true)
  })

  it('同じ項目で 2 回話したら、つないで残す', () => {
    const built = record({ 'plan-rate': ['8割くらい', '部活が忙しくて手が回らなかった'] })
    expect(built.items[0]!.transcript).toBe('8割くらい 部活が忙しくて手が回らなかった')
    // 割合は、1 回目の答えから読む（あとの話は理由なので混ぜない）
    expect(built.items[0]!.rate).toBe(80)
  })

  it('実行率が読み取れなければ null。無理に数字にしない', () => {
    const built = record({ 'plan-rate': ['うーん、どうだろう'] })
    expect(built.items[0]!.rate).toBeNull()
    expect(built.items[0]!.transcript).toBe('うーん、どうだろう')
  })

  it('答えが無い項目も、空のまま並べる（抜けが分かるように）', () => {
    const built = record({})
    expect(built.items).toHaveLength(4)
    expect(built.items.every((i) => i.transcript === '')).toBe(true)
  })
})

describe('名簿との照らし合わせ', () => {
  it('名簿が無ければ、照らし合わせをしない', () => {
    expect(record({}).roster).toBeNull()
  })

  it('名簿の来校状況・来校予定日・志望校・講座進捗を控える', () => {
    const roster = record({}, STUDENT).roster!
    expect(roster).toMatchObject({
      studentId: '1001',
      attendance: '順調',
      nextVisit: '2026-09-18',
      school: '東京大学',
    })
    expect(roster.progress).toEqual(['英語長文 12/20（60%）', '数学I 3/15（20%）'])
    expect(roster.slowest).toBe('数学I 3/15（20%）')
  })

  it('今日の講座の予定を、取得講座と突き合わせる', () => {
    const roster = record({ 'today-lesson': ['英語長文を2コマ進める'] }, STUDENT).roster!
    expect(roster.matchedCourses).toEqual(['英語長文'])
    expect(roster.courseUnmatched).toBe(false)
  })

  it('取得講座に無い講座を言ったら、印を付ける（間違いとは決めない）', () => {
    const roster = record({ 'today-lesson': ['物理をやる予定'] }, STUDENT).roster!
    expect(roster.matchedCourses).toEqual([])
    expect(roster.courseUnmatched).toBe(true)
  })

  it('何も話していなければ、食い違いとはしない', () => {
    expect(record({}, STUDENT).roster!.courseUnmatched).toBe(false)
  })
})

describe('recordToCSV', () => {
  it('見出しと 4 項目が並ぶ', () => {
    const csv = recordToCSV(record({ 'plan-rate': ['8割'], worry: ['とくにない'] }))
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('山田 太郎')
    expect(csv).toContain('項目,質問,聞き取った内容,実行率')
    expect(csv).toContain('今週の計画実行率')
    expect(csv).toContain('80')
    expect(csv).toContain('とくにない')
  })

  it('名簿との照らし合わせも書き出す', () => {
    const csv = recordToCSV(record({ 'today-lesson': ['英語長文を2コマ'] }, STUDENT))
    expect(csv).toContain('名簿との照らし合わせ')
    expect(csv).toContain('来校状況,順調')
    expect(csv).toContain('志望校,東京大学')
    expect(csv).toContain('取得講座と合っています')
  })

  it('名簿に見つからなければ、その旨を残す', () => {
    expect(recordToCSV(record({}))).toContain('名簿に見つかりませんでした')
  })

  it('半角カンマが入っていても、列がずれない', () => {
    // 音声認識が半角カンマを返すことがある。全角の読点は区切りではないので囲まない
    const csv = recordToCSV(record({ worry: ['英語, 数学が心配'] }))
    expect(csv).toContain('"英語, 数学が心配"')
    expect(csv).toContain('不安なこと、気になっていること')
  })
})

describe('東進ID', () => {
  it('記録に残す（あとから名簿に突き合わせ直せるように）', () => {
    expect(record({}).toshinId).toBe('1001')
  })

  it('CSV の見出しにも出す', () => {
    expect(recordToCSV(record({}))).toContain('東進ID,1001')
  })

  it('入れずに聞き取ったときは、その旨を残す', () => {
    const noId = buildRecord(DEFAULT_AGENDA, new Map(), { ...META, toshinId: '' })
    expect(recordToCSV(noId)).toContain('東進ID,（未入力）')
  })
})

describe('csvFileName', () => {
  it('名前と日時でファイル名を作る', () => {
    expect(csvFileName(record({}))).toMatch(/^山田太郎-\d{8}-\d{4}\.csv$/)
  })

  it('名前が無くても作れる', () => {
    const built = buildRecord(DEFAULT_AGENDA, new Map(), { ...META, studentName: '' })
    expect(csvFileName(built)).toMatch(/^コーチングタイム-\d{8}-\d{4}\.csv$/)
  })
})
