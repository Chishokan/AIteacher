import { describe, expect, it } from 'vitest'
import { DEFAULT_AGENDA, agendaLines, totalTurns } from '../agenda'
import { planAt, stepAt } from '../plan'

describe('DEFAULT_AGENDA', () => {
  it('東進のコーチングタイムの 4 項目が入っている', () => {
    expect(DEFAULT_AGENDA.topics.map((t) => t.title)).toEqual([
      '今週の計画実行率',
      '今日の講座の予定',
      '不安なこと、気になっていること',
      '良かったこと、嬉しかったこと',
    ])
  })

  it('実行率だけは数字として取り出す', () => {
    expect(DEFAULT_AGENDA.topics.filter((t) => t.kind === 'rate').map((t) => t.id)).toEqual([
      'plan-rate',
    ])
  })

  it('生徒が話す回数は 6 回', () => {
    expect(totalTurns(DEFAULT_AGENDA)).toBe(6)
  })

  it('事前に音声を作る文言は、あいさつ・質問 4 つ・締め', () => {
    const lines = agendaLines(DEFAULT_AGENDA)
    expect(lines.map((l) => l.id)).toEqual([
      'coach-greeting',
      'coach-plan-rate',
      'coach-today-lesson',
      'coach-worry',
      'coach-good-news',
      'coach-closing',
    ])
    for (const line of lines) expect(line.id).toMatch(/^[a-z0-9-]+$/)
  })
})

describe('stepAt', () => {
  it('話す回数のぶんだけ、その話題にとどまる', () => {
    // 実行率は 2 回、講座は 1 回、不安は 2 回、良かったことは 1 回
    const titles = [0, 1, 2, 3, 4, 5].map((i) => stepAt(DEFAULT_AGENDA, i).topic?.title)
    expect(titles).toEqual([
      '今週の計画実行率',
      '今週の計画実行率',
      '今日の講座の予定',
      '不安なこと、気になっていること',
      '不安なこと、気になっていること',
      '良かったこと、嬉しかったこと',
    ])
  })

  it('話題の最後の発言が分かる', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => stepAt(DEFAULT_AGENDA, i).lastOfTopic)).toEqual([
      false,
      true,
      true,
      false,
      true,
      true,
    ])
  })

  it('全部終わったあとは話題が無くなる', () => {
    expect(stepAt(DEFAULT_AGENDA, 6).topic).toBeNull()
  })
})

describe('planAt', () => {
  it('話題の途中は、AI にその話題の中で深掘りさせる', () => {
    const plan = planAt(DEFAULT_AGENDA, 0)
    expect(plan.topic).toBe(DEFAULT_AGENDA.topics[0]!.prompt)
    expect(plan.style).toBeNull()
    expect(plan.nextPrompt).toBeNull()
    expect(plan.closing).toBe(false)
  })

  it('話題の最後は、受けとめだけさせて、次の質問を決まった文言で続ける', () => {
    const plan = planAt(DEFAULT_AGENDA, 1)
    expect(plan.style).toBe('echo')
    expect(plan.nextPrompt).toBe(DEFAULT_AGENDA.topics[1]!.prompt)
    expect(plan.closing).toBe(false)
  })

  it('話題は順に進む', () => {
    expect(planAt(DEFAULT_AGENDA, 2).nextPrompt).toBe(DEFAULT_AGENDA.topics[2]!.prompt)
    expect(planAt(DEFAULT_AGENDA, 4).nextPrompt).toBe(DEFAULT_AGENDA.topics[3]!.prompt)
  })

  it('最後の話題まで終わったら、締めの文言で終わる', () => {
    const plan = planAt(DEFAULT_AGENDA, 5)
    expect(plan.style).toBe('echo')
    expect(plan.nextPrompt).toBe(DEFAULT_AGENDA.closing)
    expect(plan.closing).toBe(true)
    expect(plan.topicId).toBe('good-news')
  })

  it('範囲を超えても落ちず、締めに寄せる', () => {
    const plan = planAt(DEFAULT_AGENDA, 99)
    expect(plan.closing).toBe(true)
    expect(plan.topicId).toBeNull()
  })

  it('どの発言がどの項目の記録になるか', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => planAt(DEFAULT_AGENDA, i).topicId)).toEqual([
      'plan-rate',
      'plan-rate',
      'today-lesson',
      'worry',
      'worry',
      'good-news',
    ])
  })
})
