import { describe, expect, it } from 'vitest'
import { RETRY_NOTICE, fixedLines } from '../fixedLines'

describe('fixedLines', () => {
  it('最初のひとことと、聞き返しの案内を並べる', () => {
    const lines = fixedLines('こんにちは。今日はどんな一日だった？')
    expect(lines.map((l) => l.id)).toEqual(['opening', 'retry-notice'])
    expect(lines[0]?.text).toBe('こんにちは。今日はどんな一日だった？')
    expect(lines[1]?.text).toBe(RETRY_NOTICE)
  })

  it('最初のひとことの前後の空白は落とす', () => {
    expect(fixedLines('  やあ。  ')[0]?.text).toBe('やあ。')
  })

  it('最初のひとことが空なら、その分は作らない', () => {
    expect(fixedLines('   ').map((l) => l.id)).toEqual(['retry-notice'])
  })

  it('同じ文言が二重に並ばない', () => {
    const lines = fixedLines(RETRY_NOTICE)
    expect(lines).toHaveLength(1)
  })
})
