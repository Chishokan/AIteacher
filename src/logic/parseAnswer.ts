import type { Question } from '../types'
import { parseNumber } from './japaneseNumber'
import { normalize } from './normalize'

export type ParseResult =
  /** 回答として受け取れた */
  | { status: 'ok'; value?: number; text: string }
  /** 「わからない」など、この質問を飛ばしたい */
  | { status: 'skip' }
  /** 「もう一回言って」など、質問の読み上げをやり直したい */
  | { status: 'repeat' }
  /** 聞き取れたが回答として解釈できなかった */
  | { status: 'unclear'; reason: string }

const AFFIRMATIVE = [
  'はい', 'うん', 'ええ', 'そうです', 'そう', 'そのとおり', 'あってます', 'あってる',
  'あっています', 'ただしい', 'せいかい', 'ok', 'okです', 'おっけー', 'おけ',
  'だいじょうぶ', 'いいです', 'いいよ', 'おねがいします', 'yes',
]

const NEGATIVE = [
  'いいえ', 'いえ', 'ちがいます', 'ちがう', 'ちがった', 'まちがい', 'まちがえた',
  'だめ', 'のー', 'no', 'やりなおし', 'もういちど', 'もういっかい', 'ないです', 'いや',
]

const SKIP = [
  'わからない', 'わかりません', 'わかんない', 'おぼえてない', 'おぼえていません',
  'きおくにない', 'みてない', 'まだです', 'すきっぷ', 'とばして', 'ぱす', 'ひみつ',
  'いいたくない', 'なし',
  // 音声認識は漢字まじりで返ってくることが多い
  '分からない', '分かりません', '覚えてない', '覚えていません', '記憶にない',
  '見てない', '飛ばして', '秘密', '言いたくない',
]

const REPEAT = [
  'もういちどいって', 'もういちどおねがい', 'もっかいいって', 'ききのがしました',
  'きこえなかった', 'なんですか', 'なんていいました', 'りぴーと',
  // 音声認識は漢字まじりで返ってくることが多い
  'もう一度言って', 'もう一度お願い', 'もう一回言って', '聞き逃しました',
  '聞こえなかった', '何ですか', '何て言いました',
]

/** 短い相づちの言い回しを拾うための上限。長文の中の偶然の一致を避ける */
const PHRASE_MAX_LENGTH = 12

/** 正規化済みテキストが候補のいずれかを含むか */
function includesAny(text: string, candidates: readonly string[]): boolean {
  return candidates.some((c) => text.includes(normalize(c)))
}

/**
 * 「わからない」「もう一度」のような短い定型句かどうか。
 * 自由記述の長い答えの中にたまたま含まれた場合を拾わないよう、長さで足切りする。
 */
function isPhrase(text: string, candidates: readonly string[]): boolean {
  if (text.length > PHRASE_MAX_LENGTH) return candidates.some((c) => normalize(c) === text)
  return includesAny(text, candidates)
}

/** はい / いいえ を判定する。判定できなければ null */
export function parseYesNo(input: string): boolean | null {
  const text = normalize(input)
  if (!text) return null
  // 「はい、ちがいます」のように両方出た場合は否定を優先する（訂正の意図とみなす）
  if (includesAny(text, NEGATIVE)) return false
  if (includesAny(text, AFFIRMATIVE)) return true
  return null
}

/** 選択肢の中から最も近いものを選ぶ。選べなければ null */
export function matchChoice(input: string, choices: readonly string[]): string | null {
  const text = normalize(input)
  if (!text) return null

  // 完全一致 → 部分一致（長い選択肢を優先）
  const exact = choices.find((c) => normalize(c) === text)
  if (exact) return exact

  const contained = [...choices]
    .sort((a, b) => normalize(b).length - normalize(a).length)
    .find((c) => text.includes(normalize(c)) || normalize(c).includes(text))
  if (contained) return contained

  // 「3番」「3つ目」のような番号指定
  const ordinal = /(\d+)\s*(?:ばん|つめ|ばんめ|番|つ目|番目)/.exec(normalize(input))
  if (ordinal) {
    const index = Number(ordinal[1]) - 1
    if (index >= 0 && index < choices.length) return choices[index]!
  }
  return null
}

/** 音声認識テキストを、質問の形式に合わせて解釈する */
export function parseAnswer(question: Question, transcript: string): ParseResult {
  const text = normalize(transcript)
  if (!text) return { status: 'unclear', reason: 'ごめんなさい、聞き取れませんでした。' }

  if (isPhrase(text, REPEAT)) return { status: 'repeat' }
  if (question.skippable !== false && isPhrase(text, SKIP)) {
    return { status: 'skip' }
  }

  switch (question.kind) {
    case 'score': {
      const max = question.maxScore ?? 100
      const value = parseNumber(transcript)
      if (value === null) {
        return { status: 'unclear', reason: `点数を、0から${max}までの数字で言ってください。` }
      }
      if (value < 0 || value > max) {
        return { status: 'unclear', reason: `${value}点は満点をこえています。0から${max}までで言ってください。` }
      }
      return { status: 'ok', value, text: `${value}点` }
    }

    case 'grade': {
      const value = parseNumber(transcript, '')
      if (value === null) {
        return { status: 'unclear', reason: '評定を、1から5の数字で言ってください。' }
      }
      if (!Number.isInteger(value) || value < 1 || value > 5) {
        return { status: 'unclear', reason: '評定は1から5です。もう一度言ってください。' }
      }
      return { status: 'ok', value, text: `${value}` }
    }

    case 'yesno': {
      const yes = parseYesNo(transcript)
      if (yes === null) {
        return { status: 'unclear', reason: '「はい」か「いいえ」で答えてください。' }
      }
      return { status: 'ok', text: yes ? 'はい' : 'いいえ' }
    }

    case 'choice': {
      const choice = matchChoice(transcript, question.choices ?? [])
      if (!choice) {
        return { status: 'unclear', reason: '選択肢の中から、いちばん近いものを選んで言ってください。' }
      }
      return { status: 'ok', text: choice }
    }

    case 'free': {
      if (text.length < 2) {
        return { status: 'unclear', reason: 'もう少しくわしく聞かせてください。' }
      }
      return { status: 'ok', text: transcript.trim() }
    }
  }
}
