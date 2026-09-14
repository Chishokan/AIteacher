import { describe, expect, it } from 'vitest'
import { buildMessages } from '../voiceChat'
import { CONVERSATION_OPENER } from '../prompts'

const student = (text: string) => ({ who: 'student' as const, text })
const ai = (text: string) => ({ who: 'ai' as const, text })

describe('buildMessages', () => {
  it('アバターの最初のひとことの前に、見えない一言を置く', () => {
    const messages = buildMessages({ turns: [ai('こんにちは。'), student('部活だったよ')] })
    expect(messages[0]).toMatchObject({ role: 'user', content: CONVERSATION_OPENER })
    expect(messages[1]).toMatchObject({ role: 'assistant', content: 'こんにちは。' })
  })

  it('messages は必ず user から始まる', () => {
    const messages = buildMessages({ turns: [ai('こんにちは。')] })
    expect(messages[0]?.role).toBe('user')
  })

  it('生徒から始まる場合は、余計な一言を足さない', () => {
    const messages = buildMessages({ turns: [student('ねえ聞いて')] })
    expect(messages).toHaveLength(1)
    expect(messages[0]?.role).toBe('user')
  })

  it('このターンの注意を、最後の生徒の発言に足す', () => {
    const messages = buildMessages({ turns: [ai('こんにちは。'), student('部活だったよ')] })
    const last = messages[messages.length - 1]
    expect(String(last?.content)).toContain('部活だったよ')
    expect(String(last?.content)).toContain('短い相槌をひとこと入れてから')
  })

  it('つなぎ言葉を言った場合は、続きだけを書かせる指示にする', () => {
    const messages = buildMessages({
      turns: [ai('こんにちは。'), student('試合に勝ったよ')],
      filler: 'おおー、いいねー。',
    })
    const last = String(messages[messages.length - 1]?.content)
    expect(last).toContain('すでに「おおー、いいねー。」と声に出しています')
    expect(last).not.toContain('短い相槌をひとこと入れてから')
  })

  it('生徒とアバターが交互に並ぶ', () => {
    const messages = buildMessages({
      turns: [ai('こんにちは。'), student('部活'), ai('へえ、どうだった？'), student('勝った')],
    })
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user'])
  })
})
