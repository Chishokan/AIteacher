import { describe, expect, it } from 'vitest'
import { DEFAULT_AGENDA } from '../agenda'
import { buildRecord, csvFileName, recordToCSV } from '../record'

const META = {
  id: 'coaching-1',
  studentName: '山田 太郎',
  startedAt: '2026-09-15T10:00:00.000Z',
  finishedAt: '2026-09-15T10:05:00.000Z',
}

function record(answers: Record<string, string[]>) {
  return buildRecord(DEFAULT_AGENDA, new Map(Object.entries(answers)), META)
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

  it('半角カンマが入っていても、列がずれない', () => {
    // 音声認識が半角カンマを返すことがある。全角の読点は区切りではないので囲まない
    const csv = recordToCSV(record({ worry: ['英語, 数学が心配'] }))
    expect(csv).toContain('"英語, 数学が心配"')
    expect(csv).toContain('不安なこと、気になっていること')
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
