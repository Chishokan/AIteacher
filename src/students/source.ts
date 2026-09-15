import { jsonRowsToStudents } from './parseRoster'
import type { Student } from './types'

/**
 * 名簿の出どころ。
 *
 * いまは 2 つ。**どちらでも同じ形で返す**ので、画面は出どころを気にしない
 * （返事の作り手 `ReplySource`、声 `Voice` と同じ切り方）。
 *
 * - 端末：スプレッドシートから貼り付けて取り込んだもの。設定が要らない
 * - サーバー：`/api/students` 経由の Supabase。鍵はサーバー側だけが持つ
 */

const KEY = 'aitecher.roster.v1'
/** 端末に置く上限。校舎ひとつぶんには足りる */
const MAX = 2000

export type LoadResult =
  | { ok: true; students: Student[]; from: '端末' | 'Supabase' }
  /** Supabase を設定していないだけ。エラーではない */
  | { ok: false; kind: 'unconfigured'; message: string }
  | { ok: false; kind: 'error'; message: string }

export interface StudentSource {
  load(): Promise<LoadResult>
}

// ---------------------------------------------------------------------------
// 端末に取り込んだ名簿
// ---------------------------------------------------------------------------

export function loadLocalRoster(): Student[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Student[]) : []
  } catch {
    return []
  }
}

export function saveLocalRoster(students: Student[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(students.slice(0, MAX)))
  } catch {
    // プライベートブラウズなどで保存できない場合は黙って諦める
  }
}

export function clearLocalRoster(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // 同上
  }
}

export function createLocalStudentSource(): StudentSource {
  return {
    async load() {
      return { ok: true, students: loadLocalRoster(), from: '端末' }
    },
  }
}

// ---------------------------------------------------------------------------
// Supabase（サーバー経由）
// ---------------------------------------------------------------------------

interface ServerResponse {
  ok: boolean
  rows?: Array<Record<string, unknown>>
  kind?: 'unconfigured' | 'error'
  message?: string
}

export function createServerStudentSource(): StudentSource {
  return {
    async load(): Promise<LoadResult> {
      let response: Response
      try {
        response = await fetch('/api/students')
      } catch {
        return { ok: false, kind: 'error', message: '名簿のサーバーにつながりませんでした。' }
      }

      // 開発サーバーが動いていないと、API のパスに index.html が返ってくる
      const type = response.headers.get('content-type') ?? ''
      if (!type.includes('application/json')) {
        return {
          ok: false,
          kind: 'error',
          message: '名簿のサーバーが動いていません。npm run dev で起動してください。',
        }
      }

      let body: ServerResponse
      try {
        body = (await response.json()) as ServerResponse
      } catch {
        return { ok: false, kind: 'error', message: '名簿を読み取れませんでした。' }
      }

      if (!body.ok || !body.rows) {
        return {
          ok: false,
          kind: body.kind === 'unconfigured' ? 'unconfigured' : 'error',
          message: body.message ?? '名簿を取れませんでした。',
        }
      }

      // 列の当て方は、貼り付けた表と同じものを使う
      const { students } = jsonRowsToStudents(body.rows)
      return { ok: true, students, from: 'Supabase' }
    },
  }
}

/** 設定に合わせて、名簿の出どころを選ぶ */
export function createStudentSource(mode: 'local' | 'server'): StudentSource {
  return mode === 'server' ? createServerStudentSource() : createLocalStudentSource()
}
