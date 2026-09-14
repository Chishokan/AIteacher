import { describe, expect, it } from 'vitest'
import { chooseReplyStyle } from '../replyStyle'

describe('chooseReplyStyle', () => {
  it('最初の返事は、話を引き出す質問にする', () => {
    // 最初のひとことを言ったところ（aiTurns = 1）で、生徒が答えた直後
    expect(chooseReplyStyle({ aiTurns: 1 })).toBe('question')
  })

  it('毎回は質問しない。自分の話と、受けとめるだけの回をはさむ', () => {
    const styles = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((aiTurns) => chooseReplyStyle({ aiTurns }))
    expect(styles).toEqual([
      'question',
      'question',
      'self',
      'question',
      'echo',
      'question',
      'self',
      'question',
      'echo',
    ])
  })

  it('質問が半分くらいで、自分の話も受けとめるだけも出てくる', () => {
    const styles = Array.from({ length: 40 }, (_, i) => chooseReplyStyle({ aiTurns: i + 1 }))
    const count = (style: string) => styles.filter((s) => s === style).length
    expect(count('question')).toBeGreaterThan(styles.length * 0.4)
    expect(count('question')).toBeLessThan(styles.length * 0.7)
    expect(count('self')).toBeGreaterThan(0)
    expect(count('echo')).toBeGreaterThan(0)
  })

  it('同じ型が続かない', () => {
    const styles = Array.from({ length: 20 }, (_, i) => chooseReplyStyle({ aiTurns: i + 2 }))
    for (let i = 1; i < styles.length; i += 1) {
      if (styles[i] === 'question') continue // 質問は続いてよい（はじめの 2 回）
      expect(styles[i]).not.toBe(styles[i - 1])
    }
  })

  it('生徒から聞かれたときは、何回目でも「まず答える」にする', () => {
    for (const aiTurns of [1, 2, 3, 4, 5]) {
      expect(chooseReplyStyle({ aiTurns, scene: '質問' })).toBe('answer')
    }
  })

  it('質問以外の場面は、型のくり返しどおり', () => {
    expect(chooseReplyStyle({ aiTurns: 3, scene: '大変' })).toBe('self')
    expect(chooseReplyStyle({ aiTurns: 3, scene: null })).toBe('self')
  })

  it('会話が始まる前でも落ちない', () => {
    expect(chooseReplyStyle({ aiTurns: 0 })).toBe('question')
  })
})
