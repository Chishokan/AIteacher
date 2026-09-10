/** 音声認識結果の表記ゆれを吸収するための正規化ユーティリティ */

/** 全角英数字・記号を半角にする */
export function toHalfWidth(input: string): string {
  return input
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
}

/** カタカナをひらがなにする（長音符はそのまま残す） */
export function toHiragana(input: string): string {
  return input.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

/**
 * 比較用の正規化。
 * 半角化・ひらがな化・小文字化を行い、空白と句読点を取り除く。
 */
export function normalize(input: string): string {
  return toHiragana(toHalfWidth(input))
    .toLowerCase()
    .replace(/[\s、。，．,.!！?？「」『』・…ー〜~]/g, '')
}
