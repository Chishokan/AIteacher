/**
 * 録音（音声生成）が必要なメッセージの一覧を作る。
 *
 *   node --experimental-strip-types scripts/gen-audio-manifest.mjs
 *
 * シナリオ（src/data/scenario.ts）から組み立てるので、教科を変えたら
 * 作り直せば一覧も追従する。出力は audio/manifest.csv と audio/manifest.json。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { buildScenario } = await import(path.join(root, 'src/data/scenario.ts'))

/** 定期テストの満点。変える場合はここも合わせる */
const MAX_SCORE = 100
/** 通知表の評定の範囲 */
const GRADES = [1, 2, 3, 4, 5]

const scenario = buildScenario({ maxScore: MAX_SCORE })
const rows = []

/**
 * @param {string} id 音声ファイルの名前（拡張子なし）。ファイル名にするので半角で作る
 * @param {string} text 読み上げる文章
 * @param {string} group まとめ（CSV の並べ替え用）
 * @param {string} target どの教科・項目のものか
 * @param {string} note 収録時の注意
 */
function add(id, text, group, target = '', note = '') {
  rows.push({ id, file: `${id}.mp3`, text, group, target, note })
}

/** 質問の並び順から、半角の連番 ID を作る（ファイル名に日本語を使わないため） */
const questionIds = new Map()
{
  const counters = new Map()
  const prefixOf = (question) => {
    if (question.id.startsWith('test:')) return 'test'
    if (question.id.startsWith('report:')) return 'report'
    return question.id.split(':')[0]
  }
  for (const question of scenario.questions) {
    const prefix = prefixOf(question)
    const next = (counters.get(prefix) ?? 0) + 1
    counters.set(prefix, next)
    questionIds.set(
      question.id,
      prefix === 'test' || prefix === 'report'
        ? `${prefix}-${String(next).padStart(2, '0')}`
        : question.id.replace(':', '-'),
    )
  }
}

// ---------------------------------------------------------------------------
// 1. あいさつ
// ---------------------------------------------------------------------------
add('greeting', scenario.greeting, 'あいさつ', '', '面談のいちばん最初。ゆっくりめに')
add('closing', scenario.closing, 'あいさつ', '', '全問終わったあと')

// ---------------------------------------------------------------------------
// 2. 質問文と、聞き直しの言い方
// ---------------------------------------------------------------------------
for (const question of scenario.questions) {
  const id = questionIds.get(question.id)
  const target = question.label ?? ''
  add(`q-${id}`, question.prompt, `質問｜${question.section}`, target)
  if (question.rePrompt) {
    add(`q-${id}-again`, question.rePrompt, `質問｜${question.section}`, target, '聞き取れなかったときの言い直し')
  }
}

// ---------------------------------------------------------------------------
// 3. 復唱して確認する言い方
//
//    「国語の得点は、」＋「78点ですね。あっていますか。」のように
//    2 つをつないで鳴らす。教科ぶんと数字ぶんを掛け算せずに済む。
// ---------------------------------------------------------------------------
for (const question of scenario.questions) {
  if (question.kind !== 'score' && question.kind !== 'grade') continue
  add(
    `confirm-lead-${questionIds.get(question.id)}`,
    `${question.label}は、`,
    '確認｜前半（教科名）',
    question.label ?? '',
    '後ろに数字の音声を続けて鳴らすので、言い切らず、続く調子で',
  )
}

for (let value = 0; value <= MAX_SCORE; value += 1) {
  add(
    `confirm-score-${value}`,
    `${value}点ですね。あっていますか。`,
    '確認｜後半（得点）',
    `${value}点`,
    '前に教科名の音声が来る。文の途中から始まる調子で',
  )
}

for (const value of GRADES) {
  add(
    `confirm-grade-${value}`,
    `${value}ですね。あっていますか。`,
    '確認｜後半（評定）',
    `評定${value}`,
    '前に教科名の音声が来る。文の途中から始まる調子で',
  )
}

// 選択肢の質問は、選べる言葉が決まっているのでそのまま録れる
for (const question of scenario.questions) {
  if (question.kind !== 'choice') continue
  const id = questionIds.get(question.id)
  for (const [index, choice] of (question.choices ?? []).entries()) {
    add(
      `confirm-choice-${id}-${index + 1}`,
      `「${choice}」ですね。あっていますか。`,
      '確認｜選択肢',
      question.label ?? '',
      choice,
    )
  }
}

// 自由記述は生徒が何を言うか決まらないため、内容を読み上げずに確認する
add(
  'confirm-free',
  '画面に出ている内容で、あっていますか。',
  '確認｜自由記述',
  '次に伸ばしたい教科',
  '生徒の言葉は読み上げられないため、画面を見てもらう言い方に変える',
)

add(
  'confirm-retry',
  'あっていたら「はい」、ちがったら「いいえ」と言ってください。',
  '確認｜言い直しの案内',
  '',
  '「はい」「いいえ」が聞き取れなかったとき',
)

// ---------------------------------------------------------------------------
// 4. 聞き取れなかったときの言い方
// ---------------------------------------------------------------------------
const RETRY_MESSAGES = [
  ['err-unheard', 'ごめんなさい、聞き取れませんでした。', ''],
  ['err-score-format', `点数を、0から${MAX_SCORE}までの数字で言ってください。`, `満点を${MAX_SCORE}点から変える場合は録り直し`],
  ['err-score-over', `満点をこえています。0から${MAX_SCORE}までの数字で言ってください。`, '聞き取った点数が満点を上回ったとき。数字は読み上げない'],
  ['err-grade-format', '評定を、1から5の数字で言ってください。', ''],
  ['err-grade-range', '評定は1から5です。もう一度言ってください。', ''],
  ['err-yesno', '「はい」か「いいえ」で答えてください。', ''],
  ['err-choice', '選択肢の中から、いちばん近いものを選んで言ってください。', ''],
  ['err-free', 'もう少しくわしく聞かせてください。', ''],
]
for (const [id, text, note] of RETRY_MESSAGES) add(id, text, '聞き直し', '', note)

// ---------------------------------------------------------------------------
// 5. 進行のあいづち
// ---------------------------------------------------------------------------
const FLOW_MESSAGES = [
  ['skip', 'わかりました。この質問はとばしますね。', '「わからない」と言われたときと、「とばす」を押したとき'],
  ['touch-accepted', 'ありがとう。', '画面のボタンから入力されたとき'],
  ['touch-fallback', 'うまく聞き取れないみたいです。画面から入力してください。', 'マイクが使えないとき'],
  ['touch-hint', '画面のボタンからも入力できます。', '3回続けて聞き取れなかったとき。前後に別の音声が続く'],
]
for (const [id, text, note] of FLOW_MESSAGES) add(id, text, '進行', '', note)

// ---------------------------------------------------------------------------
// 書き出し
// ---------------------------------------------------------------------------
const outDir = path.join(root, 'audio')
mkdirSync(outDir, { recursive: true })

const cell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const header = ['ID', 'ファイル名', '読み上げる文章', 'まとめ', '対象', '収録メモ']
const csv =
  '﻿' +
  [header, ...rows.map((r) => [r.id, r.file, r.text, r.group, r.target, r.note])]
    .map((r) => r.map(cell).join(','))
    .join('\r\n')

writeFileSync(path.join(outDir, 'manifest.csv'), csv)
writeFileSync(
  path.join(outDir, 'manifest.json'),
  JSON.stringify({ maxScore: MAX_SCORE, generatedFrom: 'src/data/scenario.ts', clips: rows }, null, 2),
)

const byGroup = new Map()
for (const r of rows) byGroup.set(r.group, (byGroup.get(r.group) ?? 0) + 1)
for (const [group, count] of byGroup) console.log(`${String(count).padStart(4)}  ${group}`)
console.log(`${String(rows.length).padStart(4)}  合計`)
