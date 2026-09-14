import { describe, expect, it } from 'vitest'
import { RETRY_NOTICE, fixedLines } from '../fixedLines'

describe('fixedLines', () => {
  it('最初のひとこと、聞き返しの案内、つなぎ言葉を並べる', () => {
    const lines = fixedLines({ opening: 'こんにちは。今日はどんな一日だった？' })
    expect(lines[0]?.id).toBe('opening')
    expect(lines[0]?.text).toBe('こんにちは。今日はどんな一日だった？')
    expect(lines[1]?.id).toBe('retry-notice')
    expect(lines[1]?.text).toBe(RETRY_NOTICE)
    // つなぎ言葉 17 本（名前入りの 2 本は名前が無いので作らない）
    expect(lines).toHaveLength(19)
  })

  it('名前を渡すと、名前入りのつなぎ言葉も作る', () => {
    const lines = fixedLines({ opening: 'やあ。', studentName: 'ゆうと' })
    expect(lines).toHaveLength(21)
    expect(lines.filter((l) => l.text.includes('ゆうと'))).toHaveLength(2)
  })

  it('最初のひとことの前後の空白は落とす', () => {
    expect(fixedLines({ opening: '  やあ。  ' })[0]?.text).toBe('やあ。')
  })

  it('最初のひとことが空なら、その分は作らない', () => {
    expect(fixedLines({ opening: '   ' })[0]?.id).toBe('retry-notice')
  })

  it('同じ文言が二重に並ばない（音声を 2 本作らない）', () => {
    const lines = fixedLines({ opening: RETRY_NOTICE })
    expect(lines.filter((l) => l.text === RETRY_NOTICE)).toHaveLength(1)
  })
})
