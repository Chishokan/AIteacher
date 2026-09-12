/**
 * 収録（音声生成）が必要なメッセージの一覧を作る。
 *
 *   node --experimental-strip-types scripts/gen-audio-manifest.mjs
 *
 * シナリオ（src/data/scenario.ts）から組み立てるので、質問や教科を変えたら
 * 作り直せば一覧も追従する。出力は public/audio/manifest.csv と public/audio/manifest.json。
 *
 * 同じ文章になるものは 1 本にまとめる。たとえば「今回の手ごたえ」の言い直しと、
 * 選択肢が聞き取れなかったときの案内は同じ文章なので、音声も 1 本で足りる。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { buildScenario } = await import(path.join(root, 'src/data/scenario.ts'))
const { confirmSentence } = await import(path.join(root, 'src/logic/interview.ts'))

/** 定期テストの満点。変える場合はここも合わせる */
const MAX_SCORE = 100
/** 既定で確認する種類（useInterview と合わせる） */
const CONFIRMED_KINDS = ['score', 'grade']

/** ふだんの運用（定期テストの聞き取りだけ） */
const testRun = buildScenario({ maxScore: MAX_SCORE })
/** 設定で足せるものを全部入れたもの。収録はこちらを基準にする */
const full = buildScenario({
  maxScore: MAX_SCORE,
  includeReport: true,
  includeReview: true,
  includeGoal: true,
})

const testRunIds = new Set(testRun.questions.map((q) => q.id))

/** @type {{id:string,file:string,text:string,group:string,target:string,scope:string,note:string,usedFor:string[]}[]} */
const rows = []
/** 同じ文章のものをまとめるための索引 */
const byText = new Map()

/**
 * @param {string} id ファイル名（拡張子なし）。半角で作る
 * @param {string} text 読み上げる文章
 * @param {string} group CSV のまとめ
 * @param {object} [opts]
 * @param {string} [opts.target] どの教科・項目のものか
 * @param {'test'|'option'} [opts.scope] ふだんの運用で要るか、追加設定のときだけか
 * @param {string} [opts.note] 収録メモ
 * @param {string} [opts.usedFor] 同じ音声を使う場面の説明
 */
function add(id, text, group, opts = {}) {
  const { target = '', scope = 'test', note, usedFor = '' } = opts
  const existing = byText.get(text)
  if (existing) {
    // すでに同じ文章がある。ファイルは増やさず、使う場面だけ足す
    if (usedFor) existing.usedFor.push(usedFor)
    if (scope === 'test') existing.scope = 'test'
    return existing
  }
  const row = { id, file: `${id}.mp3`, text, group, target, scope, note: note ?? '', usedFor: usedFor ? [usedFor] : [] }
  rows.push(row)
  byText.set(text, row)
  return row
}

// ---------------------------------------------------------------------------
// 先に、場面をまたいで使いまわす音声を登録する。
// あとから同じ文章の質問が来ても、こちらの ID にまとめられる。
// ---------------------------------------------------------------------------

add('greeting', full.greeting, 'あいさつ', { note: '面談のいちばん最初。ゆっくりめに' })
add('closing', full.closing, 'あいさつ', { note: '全問終わったあと' })

add('again', 'ごめんなさい。もう一度お願いします。', '聞き直し', {
  note: '聞き取れなかったときの共通の言い直し。教科名は入れない',
  usedFor: '得点・評定が聞き取れなかったとき',
})

// 確認（聞き取った値は画面に出すので、音声では読み上げない）
{
  const seen = new Map()
  for (const question of full.questions) {
    const willConfirm = question.confirm ?? CONFIRMED_KINDS.includes(question.kind)
    if (!willConfirm) continue
    const text = confirmSentence(question)
    if (!seen.has(text)) seen.set(text, { kind: question.kind, targets: [] })
    seen.get(text).targets.push(question.label ?? question.section)
  }
  const ids = { score: 'confirm-score', grade: 'confirm-grade' }
  for (const [text, { kind, targets }] of seen) {
    add(ids[kind] ?? 'confirm-other', text, '確認', {
      target: targets.join('、'),
      scope: kind === 'score' ? 'test' : 'option',
      note: '答えの値は画面に大きく出るので、音声では読み上げない',
    })
  }
}
add('confirm-retry', 'あっていたら「はい」、ちがったら「いいえ」と言ってください。', '確認', {
  note: '「はい」「いいえ」が聞き取れなかったとき',
})

// 聞き取れたが、答えとして受け取れなかったとき
const RETRY_MESSAGES = [
  ['err-unheard', 'ごめんなさい、聞き取れませんでした。', 'test', ''],
  ['err-score-format', `点数を、0から${MAX_SCORE}までの数字で言ってください。`, 'test', `満点を${MAX_SCORE}点から変える場合は録り直し`],
  ['err-score-over', `満点をこえています。0から${MAX_SCORE}までの数字で言ってください。`, 'test', '数字は読み上げない'],
  ['err-yesno', '「はい」か「いいえ」で答えてください。', 'test', ''],
  ['err-grade-format', '評定を、1から5の数字で言ってください。', 'option', '通知表を聞くときだけ'],
  ['err-grade-range', '評定は1から5です。もう一度言ってください。', 'option', '通知表を聞くときだけ'],
  ['err-choice', '選択肢の中から、いちばん近いものを選んで言ってください。', 'option', ''],
  ['err-free', 'もう少しくわしく聞かせてください。', 'option', ''],
]
for (const [id, text, scope, note] of RETRY_MESSAGES) {
  add(id, text, '聞き直し', { scope, note, usedFor: '答えとして受け取れなかったとき' })
}

// 進行のあいづち
const FLOW_MESSAGES = [
  ['skip', 'わかりました。この質問はとばしますね。', '「わからない」と言われたときと、「とばす」を押したとき'],
  ['touch-accepted', 'ありがとう。', '画面のボタンから入力されたとき。入力内容は読み上げない'],
  ['touch-fallback', 'うまく聞き取れないみたいです。画面から入力してください。', 'マイクが使えないとき'],
  ['touch-hint', '画面のボタンからも入力できます。', '3回続けて聞き取れなかったとき。前後に別の音声が続く'],
]
for (const [id, text, note] of FLOW_MESSAGES) add(id, text, '進行', { note })

// ---------------------------------------------------------------------------
// 質問と、その言い直し
// ---------------------------------------------------------------------------
/**
 * ふだんの運用と、追加設定を全部入れたものの両方をたどる。
 * 通知表のオン・オフで言い方が変わる質問があるため、片方だけでは足りない。
 * 同じ文章のものは add() の側でまとめられる。
 */
for (const [scenario, scope] of [
  [testRun, 'test'],
  [full, 'option'],
]) {
  for (const question of scenario.questions) {
    const target = question.label ?? ''
    // 音声のファイル名はシナリオが持っている。無ければ ID から作る
    const id = question.audio ?? `q-${question.id.replace(':', '-')}`
    add(id, question.prompt, `質問｜${question.section}`, {
      target,
      scope,
      note: scenario === full && !testRunIds.has(question.id) ? '' : undefined,
    })
    if (question.rePrompt) {
      add(question.audioAgain ?? `${id}-again`, question.rePrompt, `質問｜${question.section}`, {
        target,
        scope,
        note: '聞き取れなかったときの言い直し',
        usedFor: `${target}の言い直し`,
      })
    }
  }
}

// ---------------------------------------------------------------------------
// 書き出し
// ---------------------------------------------------------------------------
const outDir = path.join(root, 'public/audio')
mkdirSync(outDir, { recursive: true })

const cell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const header = ['ID', 'ファイル名', '読み上げる文章', 'まとめ', '対象', 'テスト運用', '同じ音声を使う場面', '収録メモ']
const csv =
  '﻿' +
  [
    header,
    ...rows.map((r) => [
      r.id,
      r.file,
      r.text,
      r.group,
      r.target,
      r.scope === 'test' ? '必要' : '追加設定のとき',
      r.usedFor.join(' / '),
      r.note,
    ]),
  ]
    .map((r) => r.map(cell).join(','))
    .join('\r\n')

writeFileSync(path.join(outDir, 'manifest.csv'), csv)
writeFileSync(
  path.join(outDir, 'manifest.json'),
  JSON.stringify(
    { maxScore: MAX_SCORE, generatedFrom: 'src/data/scenario.ts', clips: rows },
    null,
    2,
  ),
)

const need = rows.filter((r) => r.scope === 'test').length
const byGroup = new Map()
for (const r of rows) byGroup.set(r.group, (byGroup.get(r.group) ?? 0) + 1)
for (const [group, count] of byGroup) console.log(`${String(count).padStart(3)}  ${group}`)
console.log(`${String(rows.length).padStart(3)}  合計（うちテスト運用で必要 ${need} 本）`)
