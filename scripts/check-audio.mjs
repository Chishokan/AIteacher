/**
 * public/audio/ に置かれた音声が、一覧（manifest.json）とそろっているか確かめる。
 *
 *   node scripts/check-audio.mjs
 *
 * 足りないもの・一覧にないものを並べる。段階的に音声を足していくときに使う。
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const audioDir = path.join(root, 'public/audio')

const manifest = JSON.parse(readFileSync(path.join(audioDir, 'manifest.json'), 'utf8'))
const present = new Set(readdirSync(audioDir).filter((f) => /\.(mp3|m4a|wav|ogg)$/i.test(f)))

const expected = new Map(manifest.clips.map((c) => [c.file, c]))

const missingTest = []
const missingOption = []
for (const [file, clip] of expected) {
  if (present.has(file)) continue
  ;(clip.scope === 'test' ? missingTest : missingOption).push(clip)
}
const extra = [...present].filter((f) => !expected.has(f)).sort()

const readyTest = manifest.clips.filter((c) => c.scope === 'test' && present.has(c.file)).length
const totalTest = manifest.clips.filter((c) => c.scope === 'test').length

console.log(`ふだんの運用（定期テストのみ）: ${readyTest} / ${totalTest} 本そろっています`)
console.log(`全体: ${present.size} / ${expected.size} 本`)

if (missingTest.length) {
  console.log(`\n■ 足りない（ふだんの運用で使う） ${missingTest.length} 本`)
  for (const c of missingTest) console.log(`   ${c.file.padEnd(24)} ${c.text}`)
}
if (missingOption.length) {
  console.log(`\n□ 足りない（追加設定をオンにしたときだけ使う） ${missingOption.length} 本`)
  for (const c of missingOption) console.log(`   ${c.file.padEnd(24)} ${c.text}`)
}
if (extra.length) {
  console.log(`\n? 一覧にないファイル ${extra.length} 本（使われません）`)
  for (const f of extra) console.log(`   ${f}`)
}
if (!missingTest.length && !extra.length) console.log('\nふだんの運用に必要なものは、すべてそろっています。')
