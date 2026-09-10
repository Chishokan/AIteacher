import { describe, expect, it } from 'vitest'
import { matchChoice, parseAnswer, parseYesNo } from '../parseAnswer'
import { parseKanaNumber } from '../japaneseNumber'
import type { Question } from '../../types'

const scoreQuestion: Question = {
  id: 'test:国語',
  section: '定期テストの得点',
  label: '国語の得点',
  prompt: '国語のテストは何点でしたか。',
  kind: 'score',
  maxScore: 100,
}

const gradeQuestion: Question = {
  id: 'report:数学',
  section: '通知表の評定',
  label: '数学の評定',
  prompt: '数学の評定はいくつでしたか。',
  kind: 'grade',
}

const choiceQuestion: Question = {
  id: 'review:mood',
  section: 'ふりかえり',
  prompt: 'どう感じましたか。',
  kind: 'choice',
  choices: ['とてもよくできた', 'まあまあできた', 'ふつう', 'あまりできなかった'],
}

describe('parseYesNo', () => {
  it('肯定を拾う', () => {
    expect(parseYesNo('はい')).toBe(true)
    expect(parseYesNo('うん、そうです')).toBe(true)
    expect(parseYesNo('あってます')).toBe(true)
  })

  it('否定を拾う', () => {
    expect(parseYesNo('いいえ')).toBe(false)
    expect(parseYesNo('ちがいます')).toBe(false)
    // 肯定と否定が混ざったら、訂正の意図とみなす
    expect(parseYesNo('はい、ちがいます')).toBe(false)
  })

  it('判断できなければ null', () => {
    expect(parseYesNo('えーっと')).toBeNull()
    expect(parseYesNo('')).toBeNull()
  })
})

describe('matchChoice', () => {
  it('言い方が違っても近い選択肢を選ぶ', () => {
    expect(matchChoice('まあまあできた', choiceQuestion.choices!)).toBe('まあまあできた')
    expect(matchChoice('ふつうかな', choiceQuestion.choices!)).toBe('ふつう')
  })

  it('番号でも選べる', () => {
    expect(matchChoice('3番', choiceQuestion.choices!)).toBe('ふつう')
  })

  it('当てはまらなければ null', () => {
    expect(matchChoice('バナナ', choiceQuestion.choices!)).toBeNull()
  })
})

describe('parseAnswer', () => {
  it('得点を読み取る', () => {
    expect(parseAnswer(scoreQuestion, '78点でした')).toEqual({ status: 'ok', value: 78, text: '78点' })
    expect(parseAnswer(scoreQuestion, 'ななじゅうはちてん')).toEqual({
      status: 'ok',
      value: 78,
      text: '78点',
    })
  })

  it('満点をこえた得点は聞き直す', () => {
    const result = parseAnswer(scoreQuestion, '150点')
    expect(result.status).toBe('unclear')
  })

  it('評定は1〜5だけ受け付ける', () => {
    expect(parseAnswer(gradeQuestion, '4')).toEqual({ status: 'ok', value: 4, text: '4' })
    expect(parseAnswer(gradeQuestion, 'ごです')).toEqual({ status: 'ok', value: 5, text: '5' })
    expect(parseAnswer(gradeQuestion, '7').status).toBe('unclear')
  })

  it('「わからない」はスキップとして扱う', () => {
    expect(parseAnswer(scoreQuestion, 'わからない')).toEqual({ status: 'skip' })
    expect(parseAnswer(gradeQuestion, 'おぼえてないです')).toEqual({ status: 'skip' })
  })

  it('「もう一度言って」は読み上げのやり直し', () => {
    expect(parseAnswer(scoreQuestion, 'もう一度言って')).toEqual({ status: 'repeat' })
  })

  it('自由記述はそのまま残す', () => {
    const freeQuestion: Question = {
      id: 'goal:action',
      section: '次の目標',
      prompt: '今日から始めることは。',
      kind: 'free',
    }
    expect(parseAnswer(freeQuestion, '毎日30分、単語をおぼえます')).toEqual({
      status: 'ok',
      text: '毎日30分、単語をおぼえます',
    })
  })

  it('長い自由記述の中の「わからない」でスキップにしない', () => {
    const freeQuestion: Question = {
      id: 'review:reason',
      section: 'ふりかえり',
      prompt: 'どうしてそう思いましたか。',
      kind: 'free',
      skippable: true,
    }
    const result = parseAnswer(freeQuestion, '勉強のやり方がわからないまま、テストになってしまったからです')
    expect(result.status).toBe('ok')
  })

  it('数に見えるだけの言葉を得点にしない', () => {
    expect(parseKanaNumber('よくわからない')).toBeNull()
  })
})
