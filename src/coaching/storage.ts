import type { CoachingRecord } from './record'

/**
 * コーチングタイムの記録の置き場。
 *
 * 定期テストの聞き取り（`logic/storage.ts`）とは**別の鍵**にしてある。
 * 片方を消しても、もう片方に影響しない。どちらもこの端末の中だけ。
 */

const KEY = 'aitecher.coaching.v1'
/** 端末に残す件数の上限 */
const MAX = 200

export function loadCoachingRecords(): CoachingRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CoachingRecord[]) : []
  } catch {
    return []
  }
}

function write(records: CoachingRecord[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(records.slice(0, MAX)))
  } catch {
    // プライベートブラウズなどで保存できない場合は黙って諦める
  }
}

export function saveCoachingRecord(record: CoachingRecord): void {
  write([record, ...loadCoachingRecords().filter((r) => r.id !== record.id)])
}

export function deleteCoachingRecord(id: string): void {
  write(loadCoachingRecords().filter((r) => r.id !== id))
}
