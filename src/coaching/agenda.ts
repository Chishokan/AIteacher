/**
 * コーチングタイムで聞く項目（東進高校生部門）。
 *
 * 雑談と違い、**聞くことが決まっている。** 質問の文言はここで固定しておき、
 * AI には作らせない。理由は 3 つ。
 *
 * 1. 塾の決まった項目なので、毎回同じ言い方で聞きたい
 * 2. 文言が決まっていれば音声を先に作れる（待ち時間ゼロ）
 * 3. AI がするのは「受けとめ」と、その話題の中での短い深掘りだけで足りる
 *
 * **聞く項目を変えるならここを直す。** ほかは触らなくてよい。
 */

export type CoachingAnswerKind =
  /** 割合（今週の計画実行率）。数字として取り出す */
  | 'rate'
  /** 聞き取った言葉をそのまま残す */
  | 'free'

export interface CoachingTopic {
  /** 記録の見出しに使う。半角で作る（音声のファイル名にも使う） */
  id: string
  /** 記録に出す見出し */
  title: string
  /** アバターが読み上げる質問。毎回この文言で聞く */
  prompt: string
  kind: CoachingAnswerKind
  /**
   * この話題で生徒に話してもらう回数。
   * 2 にすると、答えたあとに AI が 1 回だけ深掘りする
   */
  turns: number
}

export interface CoachingAgenda {
  /** いちばん最初のあいさつ */
  greeting: string
  topics: CoachingTopic[]
  /** 最後に言う決まり文句 */
  closing: string
}

/** 東進高校生部門のコーチングタイム */
export const DEFAULT_AGENDA: CoachingAgenda = {
  greeting: 'こんにちは。今日のコーチングタイムを始めるね。',
  topics: [
    {
      id: 'plan-rate',
      title: '今週の計画実行率',
      prompt: '今週の計画は、どれくらい実行できた？ 何割くらいか教えて。',
      kind: 'rate',
      // 割合を聞いたあと、そうなった理由をひとこと聞く
      turns: 2,
    },
    {
      id: 'today-lesson',
      title: '今日の講座の予定',
      prompt: '今日は、どの講座を何コマ進める予定？',
      kind: 'free',
      turns: 1,
    },
    {
      id: 'worry',
      title: '不安なこと、気になっていること',
      prompt: 'いま、不安なことや気になっていることはある？',
      kind: 'free',
      // いちばん大事な項目なので、ひとつ掘り下げる
      turns: 2,
    },
    {
      id: 'good-news',
      title: '良かったこと、嬉しかったこと',
      prompt: '最後に、最近よかったことや、うれしかったことを教えて。',
      kind: 'free',
      turns: 1,
    },
  ],
  closing: '話してくれてありがとう。今日のコーチングタイムはここまでにしよう。',
}

/** 生徒が話す回数の合計 */
export function totalTurns(agenda: CoachingAgenda): number {
  return agenda.topics.reduce((sum, topic) => sum + Math.max(1, topic.turns), 0)
}

/** 事前に音声を作っておく、決まった文言のすべて */
export function agendaLines(agenda: CoachingAgenda): Array<{ id: string; text: string; note: string }> {
  return [
    { id: 'coach-greeting', text: agenda.greeting, note: 'コーチングタイムのあいさつ' },
    ...agenda.topics.map((topic) => ({
      id: `coach-${topic.id}`,
      text: topic.prompt,
      note: `コーチングタイムの質問（${topic.title}）`,
    })),
    { id: 'coach-closing', text: agenda.closing, note: 'コーチングタイムの締め' },
  ]
}
