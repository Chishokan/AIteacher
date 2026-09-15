import { parseNumber } from '../logic/japaneseNumber'
import { normalize } from '../logic/normalize'

/**
 * 「今週の計画実行率」を、話し言葉から割合（0〜100）にする。
 *
 * 生徒は数字で答えるとはかぎらない。「8割」「はちじゅっパーセント」
 * 「半分くらい」「ぜんぜんできなかった」など、言い方はさまざま。
 *
 * **読み取れなければ null を返す。** 無理に数字にすると、記録に嘘が残る。
 * 聞き取った言葉そのものは別に残してあるので、あとから人が読める。
 *
 * 数字の読み取り（漢数字・かな読み）は、定期テストの聞き取りで使っている
 * `logic/japaneseNumber.ts` をそのまま使う。こちらからは読むだけで、変えていない。
 */

/** 言い回しをそのまま割合にできるもの */
const PHRASES: ReadonlyArray<readonly [RegExp, number]> = [
  [/(ぜんぜん|まったく|ほとんど|なにも)(できな|やれてな|すすんでな|だめ|てをつけ)/, 0],
  [/(はんぶん|半分)/, 50],
  [/(ぜんぶ|すべて|かんぺき|ぜんかんりょう)/, 100],
]

const MAX = 100
/** 単位の前をどこまでさかのぼって数として読むか */
const LOOK_BACK = 8

function clamp(value: number): number {
  return Math.min(MAX, Math.max(0, Math.round(value)))
}

/**
 * 単位の直前にある数を読む。
 *
 * 「はち割」のようなかな読みは、単位が付いたままだと読めない。
 * 単位の手前だけを切り出して、長いほうから順に数として読ませる
 * （「じゅうはち」を「はち」と読み違えないよう、長いほうを先に試す）。
 */
function numberBefore(text: string, unit: RegExp): { value: number; rest: string } | null {
  const match = unit.exec(text)
  if (!match) return null
  const chars = [...text.slice(0, match.index)]
  const rest = text.slice(match.index + match[0].length)
  for (let take = Math.min(chars.length, LOOK_BACK); take >= 1; take -= 1) {
    const value = parseNumber(chars.slice(chars.length - take).join(''), null)
    if (value !== null) return { value, rest }
  }
  return null
}

export function parseRate(input: string): number | null {
  const raw = input.trim()
  if (!raw) return null

  // 1. 「8割」「7割5分」。割は 10 パーセント、分は 1 パーセント
  const wari = numberBefore(raw, /割|わり/)
  if (wari && wari.value >= 0 && wari.value <= 10) {
    const bu = numberBefore(wari.rest, /分|ぶ/)
    const extra = bu && bu.value >= 0 && bu.value <= 9 ? bu.value : 0
    return clamp(wari.value * 10 + extra)
  }

  // 2. 「80パーセント」「80%」
  const percent = numberBefore(raw, /ぱーせんと|パーセント|ﾊﾟｰｾﾝﾄ|%|ぱー|パー/)
  if (percent && percent.value >= 0 && percent.value <= MAX) return clamp(percent.value)

  // 3. 「半分くらい」「ぜんぜんできなかった」のような言い回し
  const text = normalize(raw)
  for (const [pattern, value] of PHRASES) {
    if (pattern.test(text)) return value
  }

  // 4. 単位なしの数。0〜100 のときだけ割合とみなす
  const plain = parseNumber(raw, null)
  if (plain !== null && plain >= 0 && plain <= MAX) return clamp(plain)

  return null
}
