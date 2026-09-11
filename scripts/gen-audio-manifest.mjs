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
const { confirmSentence } = await import(path.join(root, 'src/logic/interview.ts'))

/** 定期テストの満点。変える場合はここも合わせる */
const MAX_SCORE = 100
/** 既定で復唱して確認する種類（useInterview と合わせる） */
const CONFIRMED_KINDS = ['score', 'grade']

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
// 3. 聞き取った答えの確認
//
//    答えの値は画面に大きく出すので、音声では読み上げない。
//    そのため、点数や教科ごとに音声を用意する必要はない。
// ---------------------------------------------------------------------------
const confirmTexts = new Map()
for (const question of scenario.questions) {
  const willConfirm = question.confirm ?? CONFIRMED_KINDS.includes(question.kind)
  if (!willConfirm) continue
  const text = confirmSentence(question)
  if (!confirmTexts.has(text)) confirmTexts.set(text, [])
  confirmTexts.get(text).push(question.label ?? question.section)
}

const CONFIRM_IDS = { score: 'confirm-score', grade: 'confirm-grade' }
for (const [text, targets] of confirmTexts) {
  const kind = text.includes('点数') ? 'score' : text.includes('評定') ? 'grade' : 'other'
  add(
    CONFIRM_IDS[kind] ?? 'confirm-other',
    text,
    '確認',
    targets.join('、'),
    '答えの値は画面に大きく出るので、音声では読み上げない',
  )
}

add(
  'confirm-retry',
  'あっていたら「はい」、ちがったら「いいえ」と言ってください。',
  '確認',
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
  ['touch-accepted', 'ありがとう。', '画面のボタンから入力されたとき。入力内容は読み上げない'],
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
