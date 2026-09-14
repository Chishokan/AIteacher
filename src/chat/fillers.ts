/**
 * つなぎ言葉（沈黙を埋める前置き）。
 *
 * 生徒が話し終えた瞬間に、場面に合う前置きを言い、その裏で返事を作る。
 * 引き継ぎ仕様 3.2（`docs/voice-chat-spec.md`）のとおりに作ってある。
 *
 * **場面の判定に AI は使わない。** 規則で一瞬で決める。
 * ここは副作用のない関数だけにしてあるので、単体テストで確かめられる
 * （`__tests__/fillers.test.ts`）。鳴らす段取りは `useChatTurn.ts`。
 */

export type FillerScene = 'ふつう' | '考え中' | 'みじかい' | '楽しい' | '大変' | '質問' | 'びっくり'

/** 名前を差し込む目印 */
export const NAME_SLOT = '{名前}'

/** 場面ごとの言葉（引き継ぎ仕様 3.2 の初期値） */
export const FILLER_WORDS: Record<FillerScene, string[]> = {
  ふつう: ['うんうん、なるほどねー。', 'へえー、そうなんだー。', 'うーん、そっかそっかー。'],
  考え中: ['えーっとねー、', 'うーんとねー、'],
  みじかい: ['うんうん。', 'そっかー。'],
  楽しい: [
    'おおー、いいねー。',
    'へえー、それは楽しそうだねー。',
    'わあ、いいなあー。',
    `${NAME_SLOT}、よかったねー。`,
  ],
  大変: ['そっかー、それは大変だったねー。', 'うーん、そうだったんだー。', 'あらら、おつかれさまー。'],
  質問: ['うーん、そうだなあー。', 'おっ、いい質問だねー。'],
  びっくり: ['えっ、ほんとに？', 'おおー、すごいじゃん。', `さすがは${NAME_SLOT}だねー。`],
}

/** 音声のファイル名に使う、場面の半角の名前 */
export const FILLER_SCENE_KEYS: Record<FillerScene, string> = {
  ふつう: 'futsu',
  考え中: 'kangaechu',
  みじかい: 'mijikai',
  楽しい: 'tanoshii',
  大変: 'taihen',
  質問: 'shitsumon',
  びっくり: 'bikkuri',
}

/** 場面の言葉が 1 つも用意できていないときに落ちる先 */
const FALLBACK_SCENE: FillerScene = 'ふつう'

/** 「みじかい」とみなす長さ */
const SHORT_LENGTH = 6

/** 名前入りを使ってよい間隔（何回に 1 回まで） */
const NAME_INTERVAL = 4

/** 名前入りを選んでも見送る確率 */
const NAME_SKIP_CHANCE = 0.5

/** 直近いくつまでを「使ったばかり」とみなすか */
const RECENT_SIZE = 3

/** 候補を絞りすぎて順番が読まれないように、最低これだけは残す */
const MIN_CANDIDATES = 2

// ---------------------------------------------------------------------------
// 場面の判定
// ---------------------------------------------------------------------------

/** 楽しい言葉の打ち消し。「楽しくなかった」を「楽しい」と取り違えないため */
const NEGATED = /(楽し|嬉し|面白|美味し)くな/

const NEGATED_WORDS = [
  'よくなかった',
  'できなかった',
  '勝てなかった',
  '好きじゃな',
  'つまらな',
  'つまんな',
  '微妙',
]

const HARD_WORDS = [
  '疲れ', '大変', '最悪', '嫌だ', '嫌い', 'だるい', '怒られ', '負けた', '落ち込', '落ちた',
  '失敗', '悲し', 'つらい', '痛い', '赤点', 'ミスし', '喧嘩', '風邪', '熱が', '忘れ物',
  'しんどい', 'むかつ', '残念', 'ダメだった', '泣い',
]

const QUESTION_WORDS = [
  '教えて', '知ってる', 'どう思う', 'どうして', 'なんで', 'なぜ', 'ってなに', 'わかる？',
]

const SURPRISE_WORDS = [
  '初めて', 'びっくり', '優勝', '一位', '合格', '満点', '100点', '選ばれ', 'キャプテン',
  '新記録', '自己ベスト',
]

const FUN_WORDS = [
  '楽し', '嬉し', '勝った', 'よかった', '最高', '面白', '美味し', '遊んだ', '行ってきた',
  'できた', '褒め', '好き', 'ハマって',
]

const has = (text: string, words: string[]) => words.some((word) => text.includes(word))

/**
 * 発言から場面を判定する。
 * **上から順に、最初に当たったもの。** 暗い話をいちばん先に拾う（引き継ぎ仕様 3.2）。
 */
export function detectScene(raw: string): FillerScene {
  const text = raw.trim()

  // 打ち消しは「楽しい」より先に見る。「楽しくなかった」は大変な話
  if (NEGATED.test(text) || has(text, NEGATED_WORDS)) return '大変'
  if (has(text, HARD_WORDS)) return '大変'
  // 音声認識が半角の ? を返す端末があるので、どちらも疑問とみなす
  if (/[？?]$/.test(text) || has(text, QUESTION_WORDS)) return '質問'
  if (has(text, SURPRISE_WORDS)) return 'びっくり'
  if (has(text, FUN_WORDS)) return '楽しい'
  if ([...text].length <= SHORT_LENGTH) return 'みじかい'
  return 'ふつう'
}

// ---------------------------------------------------------------------------
// 言葉を選ぶ
// ---------------------------------------------------------------------------

export interface FillerContext {
  /** その文言の音声が用意できているか。その場で作ると逆に遅れるため、用意できたものだけ使う */
  isReady: (text: string) => boolean
  /** 生徒の名前。無ければ名前入りは使わない */
  studentName?: string
  /** 直近に使った言葉。新しい順 */
  recent: string[]
  /** 前に名前入りを使ってから何ターンたったか。使ったことがなければ Infinity */
  turnsSinceName: number
  /** 0 以上 1 未満の乱数。テストでは固定した値を渡す */
  random: () => number
}

export interface FillerPick {
  /** 鳴らす言葉。使わないときは null */
  text: string | null
  /** 判定した場面。画面の計測欄に出す */
  scene: FillerScene
  /** 使わなかった理由。使ったときは null */
  skipReason: string | null
  /** 名前入りを使ったか */
  usedName: boolean
}

/** 名前を差し込む。名前が無ければ null（その言葉は使えない） */
function fillName(word: string, studentName: string | undefined): string | null {
  if (!word.includes(NAME_SLOT)) return word
  const name = studentName?.trim()
  if (!name) return null
  return word.replaceAll(NAME_SLOT, name)
}

/**
 * 使ったばかりの言葉を避ける。
 * ただし**候補は常に 2 つ以上残す。** 残り 1 つに固定されると順番が読まれてしまう。
 */
export function withoutRecent(all: string[], recent: string[]): string[] {
  // できるだけ多く避けたいので、新しいものから順に多く外してみる
  for (let avoidCount = recent.length; avoidCount > 0; avoidCount -= 1) {
    const avoid = new Set(recent.slice(0, avoidCount))
    const left = all.filter((word) => !avoid.has(word))
    if (left.length >= MIN_CANDIDATES) return left
  }
  return all
}

/** その場面で、いま鳴らせる言葉（名前を差し込み、音声が用意できているものだけ） */
function readyWords(scene: FillerScene, ctx: FillerContext, allowName: boolean): string[] {
  const words: string[] = []
  for (const word of FILLER_WORDS[scene]) {
    if (!allowName && word.includes(NAME_SLOT)) continue
    const text = fillName(word, ctx.studentName)
    if (text && ctx.isReady(text)) words.push(text)
  }
  return words
}

function pickOne(words: string[], random: () => number): string {
  const index = Math.min(words.length - 1, Math.floor(random() * words.length))
  return words[index]!
}

/**
 * 生徒の発言に合わせて、つなぎ言葉を 1 つ選ぶ。
 * 使えるものが無ければ `text` は null になり、`skipReason` に理由が入る。
 */
export function chooseFiller(studentText: string, ctx: FillerContext): FillerPick {
  const scene = detectScene(studentText)
  // 名前入りは 4 回に 1 回まで（引き継ぎ仕様 3.2 の 3）
  const allowName = ctx.turnsSinceName >= NAME_INTERVAL

  let used: FillerScene = scene
  let words = readyWords(scene, ctx, allowName)
  if (words.length === 0 && scene !== FALLBACK_SCENE) {
    // その場面の声が無ければ「ふつう」で代用する
    used = FALLBACK_SCENE
    words = readyWords(FALLBACK_SCENE, ctx, allowName)
  }
  if (words.length === 0) {
    const total = FILLER_WORDS[used].length
    return {
      text: null,
      scene,
      skipReason: `準備が間に合わず（${used}・準備済み 0/${total}）`,
      usedName: false,
    }
  }

  let choice = pickOne(withoutRecent(words, ctx.recent), ctx.random)

  // 名前入りを選んでも、半分の確率で見送る（毎回呼ぶと芝居がかる）
  if (isNameWord(used, ctx, choice) && ctx.random() < NAME_SKIP_CHANCE) {
    const others = readyWords(used, ctx, false)
    if (others.length > 0) choice = pickOne(withoutRecent(others, ctx.recent), ctx.random)
  }

  return {
    text: choice,
    scene,
    skipReason: null,
    usedName: isNameWord(used, ctx, choice),
  }
}

/**
 * 2 段目の「考え中」の言葉。
 *
 * つなぎ言葉を言い終えても返事ができていないときに使う（引き継ぎ仕様 3.2 の 5）。
 * 場面は見ない。用意できているものが無ければ null。
 */
export function chooseThinkingFiller(
  isReady: (text: string) => boolean,
  recent: string[],
  random: () => number,
): string | null {
  const words = FILLER_WORDS['考え中'].filter(isReady)
  if (words.length === 0) return null
  return pickOne(withoutRecent(words, recent), random)
}

/** 選ばれた文言が、もとは名前入りだったか */
function isNameWord(scene: FillerScene, ctx: FillerContext, choice: string): boolean {
  return FILLER_WORDS[scene].some(
    (word) => word.includes(NAME_SLOT) && fillName(word, ctx.studentName) === choice,
  )
}

/** 直近に使った言葉を覚えておく。新しいものが先頭 */
export function rememberFiller(recent: string[], text: string): string[] {
  return [text, ...recent.filter((word) => word !== text)].slice(0, RECENT_SIZE)
}

/**
 * 事前に音声を作っておく、つなぎ言葉のすべて。
 * @param studentName 名前入りの言葉も作るなら渡す。無ければ名前入りは作らない
 */
export function allFillerLines(studentName?: string): Array<{ id: string; text: string; scene: FillerScene }> {
  const lines: Array<{ id: string; text: string; scene: FillerScene }> = []
  for (const scene of Object.keys(FILLER_WORDS) as FillerScene[]) {
    FILLER_WORDS[scene].forEach((word, index) => {
      const text = fillName(word, studentName)
      if (!text) return
      lines.push({ id: `filler-${FILLER_SCENE_KEYS[scene]}-${index + 1}`, text, scene })
    })
  }
  return lines
}
