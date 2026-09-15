import type { CoachingAgenda } from './agenda'
import { parseRate } from './parseRate'

/**
 * コーチングタイムの記録。
 *
 * **残すのは、聞いた項目と生徒の答えだけ。** アバターの発言や
 * 雑談のやりとりは残さない（引き継ぎ資料 第 7 章「会話を保存するか」が未決のため、
 * 聞き取りの結果として必要な分にとどめる）。
 * 保存先はこの端末の localStorage だけで、サーバーには送らない。
 */

export interface CoachingItem {
  topicId: string
  /** 記録の見出し */
  title: string
  /** 実際に聞いた質問 */
  prompt: string
  /** 聞き取った言葉。同じ項目で 2 回話したら、つないで残す */
  transcript: string
  /** 実行率（0〜100）。読み取れなかった項目と、割合でない項目は null */
  rate: number | null
}

export interface CoachingRecord {
  id: string
  studentName: string
  startedAt: string
  finishedAt: string
  items: CoachingItem[]
}

/**
 * 話し終わったあとに、記録を組み立てる。
 * @param answers 項目の id ごとの、聞き取った言葉（話した順）
 */
export function buildRecord(
  agenda: CoachingAgenda,
  answers: Map<string, string[]>,
  meta: { id: string; studentName: string; startedAt: string; finishedAt: string },
): CoachingRecord {
  const items = agenda.topics.map((topic) => {
    const said = answers.get(topic.id) ?? []
    const transcript = said.join(' ').trim()
    return {
      topicId: topic.id,
      title: topic.title,
      prompt: topic.prompt,
      transcript,
      // 割合を聞く項目だけ、数字として取り出す。読めなければ null のまま
      rate: topic.kind === 'rate' ? parseRate(said[0] ?? '') : null,
    }
  })
  return { ...meta, items }
}

const CELL = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

/** Excel で開ける CSV にする。BOM を付けて文字化けを防ぐ */
export function recordToCSV(record: CoachingRecord): string {
  const rows = [
    ['項目', '質問', '聞き取った内容', '実行率'],
    ...record.items.map((item) => [
      item.title,
      item.prompt,
      item.transcript,
      item.rate === null ? '' : String(item.rate),
    ]),
  ]
  const header = [
    ['生徒', record.studentName || '（名前なし）'],
    ['実施日時', new Date(record.startedAt).toLocaleString('ja-JP')],
    [],
  ]
  return (
    '﻿' +
    [...header, ...rows].map((row) => row.map(CELL).join(',')).join('\r\n')
  )
}

/** 書き出すファイル名。同じ生徒でも日時で分かれる */
export function csvFileName(record: CoachingRecord): string {
  const at = new Date(record.startedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`
  const name = (record.studentName || 'コーチングタイム').replace(/[\\/:*?"<>|\s]/g, '')
  return `${name}-${stamp}.csv`
}
