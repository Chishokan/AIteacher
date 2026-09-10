import { normalize, toHalfWidth } from './normalize'

const KANJI_DIGITS: Record<string, number> = {
  〇: 0, 零: 0,
  一: 1, 壱: 1,
  二: 2, 弐: 2,
  三: 3, 参: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}

const KANJI_UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 }

const KANJI_NUMBER_RE = /[〇零一壱二弐三参四五六七八九十百千]+/g

/**
 * 漢数字を数値にする。「七十八」→ 78、「百」→ 100、「二〇二五」→ 2025。
 * 位取り表記（十・百・千あり）と桁並べ表記（〇一二…）の両方を受け付ける。
 */
export function parseKanjiNumber(input: string): number | null {
  const chars = [...input]
  if (chars.length === 0) return null
  if (!chars.every((c) => c in KANJI_DIGITS || c in KANJI_UNITS)) return null

  // 位取りの単位を含まない場合は、数字を並べたものとして読む（例: 二〇二五 → 2025）
  if (!chars.some((c) => c in KANJI_UNITS)) {
    return Number(chars.map((c) => KANJI_DIGITS[c]).join(''))
  }

  let total = 0
  let current = 0
  for (const char of chars) {
    const digit = KANJI_DIGITS[char]
    if (digit !== undefined) {
      current = current * 10 + digit
      continue
    }
    // 「十」のように単位の前に数字がない場合は 1 とみなす
    total += (current === 0 ? 1 : current) * KANJI_UNITS[char]!
    current = 0
  }
  return total + current
}

/**
 * かな読み → 漢数字の置換表。
 * 前方一致で食い合うものがあるため、長い読みを先に並べておく。
 */
const KANA_NUMERALS: ReadonlyArray<readonly [string, string]> = [
  ['ぜろ', '〇'], ['れい', '〇'], ['まる', '〇'],
  ['じゅう', '十'], ['じゅっ', '十'],
  ['ひゃく', '百'], ['びゃく', '百'], ['ぴゃく', '百'], ['ひゃっ', '百'],
  ['せん', '千'], ['ぜん', '千'],
  ['いち', '一'], ['いっ', '一'],
  ['さん', '三'],
  ['よん', '四'], ['よ', '四'],
  ['ろく', '六'], ['ろっ', '六'],
  ['なな', '七'], ['しち', '七'],
  ['はち', '八'], ['はっ', '八'],
  ['きゅう', '九'], ['く', '九'],
  ['ご', '五'],
  ['に', '二'],
  ['し', '四'],
]

/** 数の前後に付きやすい言い回し。取り除いてから読む */
const FILLER_PREFIXES = ['えーと', 'えっと', 'あのー', 'あの', 'たぶん', 'ぜんぶで', 'てんすうは']
const FILLER_SUFFIXES = [
  'てんです', 'てんでした', 'てん', 'ですね', 'です', 'でした', 'だった', 'だよ', 'だね',
  'かな', 'ぐらいです', 'くらい', 'ぐらい', 'だとおもう', 'とおもう', 'ます', 'でしょう', 'いじょう',
]

/** 前後の言い回しを削る。数の部分だけを残すのが目的 */
function stripFiller(text: string): string {
  let result = text
  let changed = true
  while (changed) {
    changed = false
    for (const prefix of FILLER_PREFIXES) {
      const normalized = normalize(prefix)
      if (normalized && result.startsWith(normalized)) {
        result = result.slice(normalized.length)
        changed = true
      }
    }
    for (const suffix of FILLER_SUFFIXES) {
      const normalized = normalize(suffix)
      if (normalized && result.endsWith(normalized)) {
        result = result.slice(0, -normalized.length)
        changed = true
      }
    }
  }
  return result
}

/**
 * かな読みの数（「ななじゅうはち」など）を数値にする。
 *
 * 「よくわからない」のような言葉が偶然かな読みに見えてしまうのを避けるため、
 * 言い回しを取り除いたあとの文字がすべて数字であることを求める。
 */
export function parseKanaNumber(input: string): number | null {
  let text = stripFiller(normalize(input))
  if (!text) return null
  for (const [kana, kanji] of KANA_NUMERALS) {
    text = text.split(kana).join(kanji)
  }
  return parseKanjiNumber(text)
}

/**
 * 漢数字の並びの中から最初に読めたものを返す。
 *
 * 「一生懸命」のような言葉から「一」を拾ってしまわないよう、
 * 2 文字以上の並びだけを対象にする（1 文字の場合は呼び出し側で全体一致を見る）。
 */
function firstKanjiNumber(text: string): number | null {
  for (const run of text.match(KANJI_NUMBER_RE) ?? []) {
    if ([...run].length < 2) continue
    const value = parseKanjiNumber(run)
    if (value !== null) return value
  }
  return null
}

/**
 * 音声認識のテキストから数値を 1 つ取り出す。
 *
 * 「2学期は80点」のように数が複数出てくることがあるため、
 * 単位（既定では「点」）が直後に付いた数を優先して読む。
 */
export function parseNumber(input: string, unit: string | null = '点|てん'): number | null {
  const text = toHalfWidth(input)

  // 1. 「80点」のように単位が付いた数
  if (unit) {
    const withUnit = new RegExp(`(\\d+)\\s*(?:${unit})`).exec(text)
    if (withUnit) return Number(withUnit[1])

    const kanjiWithUnit = new RegExp(
      `([〇零一壱二弐三参四五六七八九十百千]+)\\s*(?:${unit})`,
    ).exec(text)
    if (kanjiWithUnit) {
      const value = parseKanjiNumber(kanjiWithUnit[1]!)
      if (value !== null) return value
    }
  }

  // 2. 単位なしのアラビア数字。1 つだけなら素直に、複数あれば最後のものを採る
  const digits = text.match(/\d+/g)
  if (digits && digits.length > 0) return Number(digits[digits.length - 1])

  // 3. 「十」「五」のように、答え全体がそのまま数になっている場合
  const stripped = stripFiller(normalize(text))
  const whole = parseKanjiNumber(stripped)
  if (whole !== null) return whole

  // 4. 文中の漢数字 → かな読み
  return firstKanjiNumber(text) ?? parseKanaNumber(text)
}
