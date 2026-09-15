/**
 * 生徒名簿を Supabase から読む。
 *
 * **鍵はサーバー側だけが持つ。** ブラウザから Supabase を直接呼ばない。
 * 呼び方は Claude の API と同じ考え方（`.env.local` に書き、開発サーバーが読む）。
 *
 * 設定していなければ、何もせずに「未設定」を返す。アプリは端末に取り込んだ
 * 名簿のほうを使うので、Supabase を用意しなくても動く。
 *
 * ここは行をそのまま返すだけで、列の当て方は見ない。
 * 名簿の組み立ては、貼り付けた表と同じ場所（`src/students/parseRoster.ts`）に
 * まとめてあり、そちらには単体テストがある。
 */

const TIMEOUT_MS = 10_000

export interface SupabaseOptions {
  /** 例 https://xxxx.supabase.co */
  url?: string
  /** service_role か anon の鍵。ブラウザには渡らない */
  key?: string
  /** 読むテーブル。既定は students */
  table?: string
}

export type StudentsResult =
  | { ok: true; rows: Array<Record<string, unknown>> }
  /** 設定が無い。エラーではなく、端末の名簿を使えばよい */
  | { ok: false; kind: 'unconfigured'; message: string }
  | { ok: false; kind: 'error'; message: string }

export function isConfigured({ url, key }: SupabaseOptions): boolean {
  return Boolean(url?.trim() && key?.trim())
}

export async function fetchStudents(options: SupabaseOptions): Promise<StudentsResult> {
  const url = options.url?.trim()
  const key = options.key?.trim()
  const table = options.table?.trim() || 'students'

  if (!url || !key) {
    return {
      ok: false,
      kind: 'unconfigured',
      message:
        'Supabase の設定がありません。.env.local に SUPABASE_URL と SUPABASE_KEY を書いて、開発サーバーを再起動してください。',
    }
  }

  const endpoint = new URL(`/rest/v1/${encodeURIComponent(table)}`, url)
  endpoint.searchParams.set('select', '*')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        accept: 'application/json',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      // 本文には生徒の情報が入りうるので、状態だけを見る
      const hint =
        response.status === 401 || response.status === 403
          ? '鍵が正しいか、テーブルの読み取りが許可されているか確かめてください。'
          : response.status === 404
            ? `テーブル「${table}」が見つかりません。SUPABASE_STUDENTS_TABLE を確かめてください。`
            : ''
      return { ok: false, kind: 'error', message: `Supabase から名簿を取れませんでした（${response.status}）。${hint}` }
    }

    const body: unknown = await response.json()
    if (!Array.isArray(body)) {
      return { ok: false, kind: 'error', message: 'Supabase の返事を名簿として読めませんでした。' }
    }
    return { ok: true, rows: body as Array<Record<string, unknown>> }
  } catch (error) {
    if (controller.signal.aborted) {
      return { ok: false, kind: 'error', message: 'Supabase の応答が返ってきませんでした。' }
    }
    return { ok: false, kind: 'error', message: 'Supabase につながりません。URL を確かめてください。' }
  } finally {
    clearTimeout(timer)
  }
}
