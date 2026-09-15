import type { CoachingAgenda, CoachingTopic } from './agenda'

/**
 * 「いま何番目の話題か」「この返事のあと何をするか」を決める。
 *
 * 生徒が何回話したかだけで決まる**副作用のない関数**にしてある。
 * 進行のいちばん大事なところなので、単体テストで確かめられるようにするため
 * （`__tests__/plan.test.ts`）。
 */

export interface CoachingStep {
  /** いま聞いている話題。範囲を外れたら null */
  topic: CoachingTopic | null
  /** 何番目の話題か（0 から） */
  topicIndex: number
  /** その話題の中で何回目の発言か（0 から） */
  turnInTopic: number
  /** この発言で、その話題が終わるか */
  lastOfTopic: boolean
}

/** 生徒の n 回目（0 から）の発言が、どの話題のものか */
export function stepAt(agenda: CoachingAgenda, studentTurnIndex: number): CoachingStep {
  let remaining = studentTurnIndex
  for (let index = 0; index < agenda.topics.length; index += 1) {
    const topic = agenda.topics[index]!
    const turns = Math.max(1, topic.turns)
    if (remaining < turns) {
      return {
        topic,
        topicIndex: index,
        turnInTopic: remaining,
        lastOfTopic: remaining === turns - 1,
      }
    }
    remaining -= turns
  }
  // 全部の話題が終わったあと（ふつうはここに来る前に締めている）
  return { topic: null, topicIndex: agenda.topics.length, turnInTopic: 0, lastOfTopic: true }
}

/** この返事のあと、アバターがどうふるまうか */
export interface CoachingPlan {
  /** サーバーに渡す、いま聞いている話題 */
  topic: string | null
  /**
   * 返し方を決め打ちにする。
   * 話題の最後は相槌だけにして、そのあと決まった文言の質問につなげる
   */
  style: 'echo' | null
  /** 返事のあとに続けて言う決まり文句（次の話題の質問、または締め） */
  nextPrompt: string | null
  /** この返事で会話を終えるか */
  closing: boolean
  /** 記録に残すときの話題の id。範囲外なら null */
  topicId: string | null
}

/**
 * 生徒の n 回目（0 から）の発言に対する進め方。
 *
 * 話題の最後の発言では、AI には受けとめだけをさせ、
 * **次の質問はこちらが決めた文言で続けて言う。** 毎回同じ言い方で聞けて、
 * 音声も先に作っておけるため。
 */
export function planAt(agenda: CoachingAgenda, studentTurnIndex: number): CoachingPlan {
  const step = stepAt(agenda, studentTurnIndex)
  if (!step.topic) {
    return { topic: null, style: 'echo', nextPrompt: agenda.closing, closing: true, topicId: null }
  }

  const base = { topic: step.topic.prompt, topicId: step.topic.id }
  // 話題の途中。AI にその話題の中で深掘りさせる
  if (!step.lastOfTopic) {
    return { ...base, style: null, nextPrompt: null, closing: false }
  }

  const next = agenda.topics[step.topicIndex + 1]
  if (next) {
    return { ...base, style: 'echo', nextPrompt: next.prompt, closing: false }
  }
  // 最後の話題の、最後の発言
  return { ...base, style: 'echo', nextPrompt: agenda.closing, closing: true }
}
