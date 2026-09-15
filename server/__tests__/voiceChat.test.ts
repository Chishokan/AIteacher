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

  it('返し方は回ごとに変わる（毎回おうむ返し＋質問にしない）', () => {
    // 最初の返事は質問
    const first = buildMessages({ turns: [ai('こんにちは。'), student('部活だったよ')] })
    expect(String(first[first.length - 1]?.content)).toContain('短い質問を1つだけ')

    // 3 回目の返事は、質問をせず自分のことを話す回
    const later = buildMessages({
      turns: [
        ai('こんにちは。'),
        student('部活だったよ'),
        ai('どうだった？'),
        student('つかれた'),
        ai('おつかれー。'),
        student('明日も朝から練習なんだ'),
      ],
    })
    expect(String(later[later.length - 1]?.content)).toContain('自分の好きなものや考えを')
  })

  it('生徒に聞かれた回は、まず答えさせる', () => {
    const messages = buildMessages({
      turns: [ai('こんにちは。'), student('ミライは何が好きなの？')],
      scene: '質問',
    })
    expect(String(messages[messages.length - 1]?.content)).toContain('素直に答えて')
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

  it('セットの最後だと伝えられたら、締めの指示にする', () => {
    const messages = buildMessages({
      turns: [ai('こんにちは。'), student('部活だったよ')],
      closing: true,
    })
    expect(String(messages[messages.length - 1]?.content)).toContain('いったん会話を終わります')
  })

  it('コーチングタイムでは、話題と返し方の決め打ちが効く', () => {
    const messages = buildMessages({
      turns: [ai('今週の計画は、どれくらい実行できた？'), student('8割くらい')],
      mode: 'coaching',
      topic: '今週の計画は、どれくらい実行できた？',
      style: 'echo',
    })
    const last = String(messages[messages.length - 1]?.content)
    expect(last).toContain('いま聞いているのは「今週の計画は、どれくらい実行できた？」です')
    // 受けとめるだけにして、次の質問はアプリ側が決まった文言で読み上げる
    expect(last).toContain('質問をしないでください')
  })

  it('生徒とアバターが交互に並ぶ', () => {
    const messages = buildMessages({
      turns: [ai('こんにちは。'), student('部活'), ai('へえ、どうだった？'), student('勝った')],
    })
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user'])
  })
})
