import type { Question, Scenario } from '../types'

/**
 * 聞き取れなかったときの言い直し。
 * 教科ごとに文言を変えると音声もその数だけ必要になるため、共通の一言にしている。
 */
export const ASK_AGAIN = 'ごめんなさい。もう一度お願いします。'
/** 共通の言い直しに使う音声 */
export const ASK_AGAIN_AUDIO = 'again'

/** 定期テストで得点を聞く教科（既定値） */
export const DEFAULT_TEST_SUBJECTS = ['国語', '数学', '英語', '理科', '社会'] as const

/** 通知表で評定を聞く教科（既定値） */
export const DEFAULT_REPORT_SUBJECTS = [
  '国語',
  '社会',
  '数学',
  '理科',
  '英語',
  '音楽',
  '美術',
  '保健体育',
  '技術・家庭',
] as const

interface BuildOptions {
  /** 面談の名前（例: 2学期期末テスト） */
  title?: string
  testSubjects?: readonly string[]
  reportSubjects?: readonly string[]
  /** 定期テストの満点 */
  maxScore?: number
  /** 通知表の評定も聞く */
  includeReport?: boolean
  /** ふりかえり（手ごたえ・理由）も聞く */
  includeReview?: boolean
  /** 次の目標も聞く */
  includeGoal?: boolean
}

function scoreQuestion(subject: string, maxScore: number, index: number): Question {
  return {
    id: `test:${subject}`,
    audio: `q-test-${String(index + 1).padStart(2, '0')}`,
    audioAgain: ASK_AGAIN_AUDIO,
    section: '定期テストの得点',
    label: `${subject}の得点`,
    prompt: `${subject}のテストは何点でしたか。点数を教えてください。`,
    rePrompt: ASK_AGAIN,
    kind: 'score',
    maxScore,
    confirm: true,
    skippable: true,
  }
}

function gradeQuestion(subject: string, index: number): Question {
  return {
    id: `report:${subject}`,
    audio: `q-report-${String(index + 1).padStart(2, '0')}`,
    audioAgain: ASK_AGAIN_AUDIO,
    section: '通知表の評定',
    label: `${subject}の評定`,
    prompt: `通知表の${subject}の評定はいくつでしたか。`,
    rePrompt: ASK_AGAIN,
    kind: 'grade',
    confirm: true,
    skippable: true,
  }
}

/** 既定のシナリオを組み立てる */
export function buildScenario(options: BuildOptions = {}): Scenario {
  const {
    title = '成績ヒアリング',
    testSubjects = DEFAULT_TEST_SUBJECTS,
    reportSubjects = DEFAULT_REPORT_SUBJECTS,
    maxScore = 100,
    includeReport = false,
    includeReview = false,
    includeGoal = false,
  } = options

  const questions: Question[] = [
    {
      id: 'intro:ready',
      audio: 'q-intro-ready',
      section: 'はじめに',
      label: '準備はいいですか',
      prompt: 'これから、テストの点数について聞かせてください。準備はいいですか。',
      kind: 'yesno',
      confirm: false,
    },
    ...testSubjects.map((s, i) => scoreQuestion(s, maxScore, i)),
  ]

  if (includeReport) questions.push(...reportSubjects.map((s, i) => gradeQuestion(s, i)))

  const reviewQuestions: Question[] = [
    {
      id: 'review:mood',
      audio: 'q-review-mood',
      // 言い直しの文章は、選択肢が聞き取れなかったときの案内と同じなので使いまわす
      audioAgain: 'err-choice',
      section: 'ふりかえり',
      label: '今回の手ごたえ',
      prompt: '今回の成績について、自分ではどう感じていますか。',
      kind: 'choice',
      choices: ['とてもよくできた', 'まあまあできた', 'ふつう', 'あまりできなかった', '悔しかった'],
      rePrompt: '選択肢の中から、いちばん近いものを選んで言ってください。',
      confirm: false,
    },
    {
      id: 'review:reason',
      audio: 'q-review-reason',
      audioAgain: 'q-review-reason-again',
      section: 'ふりかえり',
      label: 'うまくいった / いかなかった理由',
      prompt: 'そう感じたのはどうしてですか。理由を聞かせてください。',
      kind: 'free',
      rePrompt: 'もう一度、ゆっくりで大丈夫なので、理由を聞かせてください。',
      confirm: false,
      skippable: true,
    },
  ]

  const goalQuestions: Question[] = [
    {
      id: 'goal:subject',
      audio: 'q-goal-subject',
      audioAgain: 'q-goal-subject-again',
      section: '次の目標',
      label: '次に伸ばしたい教科',
      prompt: '次のテストで、いちばん伸ばしたい教科はどれですか。',
      kind: 'free',
      rePrompt: 'もう一度、伸ばしたい教科の名前を言ってください。',
      confirm: false,
    },
    {
      id: 'goal:score',
      audio: 'q-goal-score',
      audioAgain: ASK_AGAIN_AUDIO,
      section: '次の目標',
      label: '次の目標点',
      prompt: 'その教科で、次は何点を目指しますか。目標の点数を教えてください。',
      kind: 'score',
      maxScore,
      rePrompt: ASK_AGAIN,
      confirm: true,
      skippable: true,
    },
    {
      id: 'goal:action',
      audio: 'q-goal-action',
      audioAgain: 'q-goal-action-again',
      section: '次の目標',
      label: '今日から始めること',
      prompt: 'その目標のために、今日から始められることを1つ教えてください。',
      kind: 'free',
      rePrompt: 'もう一度お願いします。今日から始められることを1つ教えてください。',
      confirm: false,
      skippable: true,
    },
  ]

  if (includeReview) questions.push(...reviewQuestions)
  if (includeGoal) questions.push(...goalQuestions)

  return {
    id: 'default',
    title,
    greeting:
      'こんにちは。わたしは、AIティーチャーです。これから成績について、いくつか質問します。マイクのマークが光ったら、はっきりと答えてくださいね。',
    closing:
      'ありがとうございました。話してくれた内容をまとめました。画面をいっしょに確認しましょう。',
    questions,
  }
}

export const defaultScenario = buildScenario()
