import { allFillerLines } from './fillers'

/**
 * 雑談のうち、**毎回まったく同じ文言**になるもの。
 *
 * ここに挙げたものは、あらかじめ音声にして `public/audio/chat/` に置いておける
 * （`npm run gen:chat-audio`）。置いてあればその場で合成せずに鳴らすので、
 * 待ち時間がなくなる。置いていなければ、これまでどおりその場で作る。
 *
 * つなぎ言葉（引き継ぎ仕様 3.2）は**用意できているものしか使わない**決まりなので、
 * ここに載せて先に作っておかないと、いつまでも鳴らない。
 */

export interface FixedLine {
  /** ファイル名に使う短い名前。半角で作る */
  id: string
  text: string
  /** 何に使うか。生成スクリプトの表示に出る */
  note: string
}

/**
 * 聞き取れなかったときの案内。
 *
 * いまは**画面に出すだけで、アバターは話さない**（引き継ぎ仕様 3.1）。
 * 音声は先に作っておくが、鳴らすかどうかは別の判断なのでここでは変えない。
 */
export const RETRY_NOTICE = 'うまく聞き取れませんでした。もう一度押してください。'

export interface FixedLineOptions {
  /** 設定の「雑談の最初のひとこと」。利用者が変えられるので引数で受ける */
  opening: string
  /**
   * 生徒の名前。渡すと「{名前}、よかったねー。」などの音声も作る。
   * 渡さなければ名前入りは作らず、その言葉は使われない
   */
  studentName?: string
}

/** 事前に音声を作っておく文言の一覧 */
export function fixedLines({ opening, studentName }: FixedLineOptions): FixedLine[] {
  const lines: FixedLine[] = []
  const seen = new Set<string>()
  const add = (id: string, text: string, note: string) => {
    const trimmed = text.trim()
    // 同じ文言が二重に並ぶと、同じ音声を 2 回作ることになる
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    lines.push({ id, text: trimmed, note })
  }

  add('opening', opening, '雑談の最初のひとこと')
  add('retry-notice', RETRY_NOTICE, '聞き返しの案内（いまは画面に出すだけ）')
  for (const filler of allFillerLines(studentName)) {
    add(filler.id, filler.text, `つなぎ言葉（${filler.scene}）`)
  }

  return lines
}
