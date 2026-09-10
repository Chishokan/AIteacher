import { describe, expect, it } from 'vitest'
import { parseKanaNumber, parseKanjiNumber, parseNumber } from '../japaneseNumber'

describe('parseKanjiNumber', () => {
  it('位取りのある漢数字を読む', () => {
    expect(parseKanjiNumber('七十八')).toBe(78)
    expect(parseKanjiNumber('十')).toBe(10)
    expect(parseKanjiNumber('百')).toBe(100)
    expect(parseKanjiNumber('二十')).toBe(20)
    expect(parseKanjiNumber('九十九')).toBe(99)
  })

  it('桁を並べた漢数字を読む', () => {
    expect(parseKanjiNumber('二〇二五')).toBe(2025)
    expect(parseKanjiNumber('五')).toBe(5)
  })

  it('数字以外が混ざれば null', () => {
    expect(parseKanjiNumber('七十点')).toBeNull()
    expect(parseKanjiNumber('')).toBeNull()
  })
})

describe('parseKanaNumber', () => {
  it('かな読みの数を読む', () => {
    expect(parseKanaNumber('ななじゅうはち')).toBe(78)
    expect(parseKanaNumber('きゅうじゅうご')).toBe(95)
    expect(parseKanaNumber('にじゅう')).toBe(20)
    expect(parseKanaNumber('ひゃく')).toBe(100)
    expect(parseKanaNumber('よん')).toBe(4)
    expect(parseKanaNumber('シチジュウ')).toBe(70)
  })

  it('数でない言葉は null', () => {
    expect(parseKanaNumber('わからない')).toBeNull()
    expect(parseKanaNumber('')).toBeNull()
  })
})

describe('parseNumber', () => {
  it('アラビア数字を読む', () => {
    expect(parseNumber('78点')).toBe(78)
    expect(parseNumber('えーっと、100点でした')).toBe(100)
    expect(parseNumber('０点')).toBe(0)
  })

  it('単位が付いた数を優先する', () => {
    expect(parseNumber('2学期は80点でした')).toBe(80)
    expect(parseNumber('3組で、九十点')).toBe(90)
  })

  it('漢数字・かな読みにも対応する', () => {
    expect(parseNumber('七十八点')).toBe(78)
    expect(parseNumber('ろくじゅうごてん')).toBe(65)
  })

  it('単位のヒントを外せる（評定など）', () => {
    expect(parseNumber('4です', null)).toBe(4)
    expect(parseNumber('ごです', null)).toBe(5)
  })

  it('答え全体が数のときも読む', () => {
    expect(parseNumber('十')).toBe(10)
    expect(parseNumber('五です')).toBe(5)
  })

  it('数がなければ null', () => {
    expect(parseNumber('おぼえていません')).toBeNull()
    // 言葉に含まれる漢数字を点数として拾わない
    expect(parseNumber('一生懸命がんばりました')).toBeNull()
  })
})
