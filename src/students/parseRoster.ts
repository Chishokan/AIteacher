import { normalize, toHalfWidth } from '../logic/normalize'
import type { CourseProgress, Student } from './types'

/**
 * スプレッドシートから貼り付けた表を、名簿として読む。
 *
 * **列の順番は決め打ちにしない。** 1 行目の見出しを見て対応づける。
 * 校舎ごとに列の並びや呼び方が違っても、見出しさえ合っていれば読める。
 *
 * 区切りはタブとカンマの両方に対応する。Google スプレッドシートや Excel から
 * そのままコピーするとタブ区切りになり、CSV で書き出すとカンマ区切りになるため。
 *
 * ここは副作用のない関数だけ。単体テストで確かめられる
 * （`__tests__/parseRoster.test.ts`）。
 */

/** 見出しの書き方のゆれ。左が名簿の項目、右が受け付ける見出し */
const HEADERS: ReadonlyArray<readonly [keyof Student | 'none', readonly string[]]> = [
  // 東進ID が固有の鍵。これがあれば、名前のあいまい一致に頼らずに済む
  ['id', ['東進id', '東進生徒id', '生徒番号', '生徒id', '会員番号', 'id', '番号']],
  ['name', ['生徒名', '氏名', '名前', '生徒']],
  ['attendance', ['来校状況', '来校', '出席状況', '登校状況']],
  ['nextVisit', ['来校予定日', '次回来校', '次回来校日', '来校予定', '次回予定']],
  ['courses', ['取得講座', '受講講座', '講座']],
  ['progress', ['講座進捗', '進捗', '受講進捗']],
  ['school', ['志望校', '第一志望', '志望大学']],
]

/** 1 つのセルの中で、複数の値を区切るもの */
const MULTI = /[、，,;；\/／\n]+/
/**
 * 講座進捗を区切るもの。
 * 「英語長文 12/20」のスラッシュはコマ数の区切りなので、ここでは分けない
 */
const MULTI_KEEP_SLASH = /[、，,;；\n]+/

function splitRow(line: string): string[] {
  // タブがあればタブ区切り。無ければカンマ区切りとみなす
  const sep = line.includes('\t') ? '\t' : ','
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === sep) {
      cells.push(cell)
      cell = ''
      continue
    }
    cell += char
  }
  cells.push(cell)
  return cells.map((c) => c.trim())
}

/**
 * 見出しの候補を、長いものから順に並べたもの。
 *
 * **長い見出しを先に見るのが大事。** 「次回来校日」は「来校」を含むので、
 * 短いほうから見ると来校状況の列だと取り違える。「講座進捗」と「講座」も同じ。
 */
const HEADER_ALIASES: ReadonlyArray<readonly [keyof Student, string]> = HEADERS.flatMap(
  ([field, names]) =>
    field === 'none'
      ? []
      : names.map((name) => [field as keyof Student, normalize(name)] as const),
).sort((a, b) => b[1].length - a[1].length)

/** 見出しの行から、何列目が何かを決める */
export function mapHeaders(cells: string[]): Map<number, keyof Student> {
  const found = new Map<number, keyof Student>()
  const used = new Set<keyof Student>()

  const assign = (index: number, field: keyof Student) => {
    if (found.has(index) || used.has(field)) return
    found.set(index, field)
    used.add(field)
  }

  // まず、見出しがぴったり同じもの
  cells.forEach((cell, index) => {
    const key = normalize(cell)
    if (!key) return
    for (const [field, alias] of HEADER_ALIASES) if (key === alias) return assign(index, field)
  })

  // 次に、「生徒名（フリガナ）」のように但し書きが付いたもの
  cells.forEach((cell, index) => {
    const key = normalize(cell)
    if (!key || found.has(index)) return
    for (const [field, alias] of HEADER_ALIASES) {
      if (key.includes(alias)) return assign(index, field)
    }
  })
  return found
}

/** 「数学I 12/20」→ done 12, total 20 */
export function parseProgressCell(raw: string): CourseProgress {
  const text = toHalfWidth(raw).trim()
  const match = /(\d+)\s*[\/／のうち]+\s*(\d+)/.exec(text)
  const course = text.replace(/(\d+)\s*[\/／のうち]+\s*(\d+).*$/, '').replace(/[（(]\s*$/, '').trim()
  if (!match) return { course: text, done: null, total: null, raw }
  return {
    course: course || text,
    done: Number(match[1]),
    total: Number(match[2]),
    raw,
  }
}

/**
 * 「2026/9/18」「9月18日」「2026-09-18」を YYYY-MM-DD にそろえる。
 * 読み取れなければ、書かれていたままを返す。
 * @param today 年が書かれていないときに補う基準日
 */
export function normalizeDate(raw: string, today = new Date()): string {
  const text = toHalfWidth(raw).trim()
  if (!text) return ''
  const pad = (n: number) => String(n).padStart(2, '0')

  const full = /(\d{4})[-\/年.](\d{1,2})[-\/月.](\d{1,2})/.exec(text)
  if (full) return `${full[1]}-${pad(Number(full[2]))}-${pad(Number(full[3]))}`

  const short = /(\d{1,2})[-\/月.](\d{1,2})/.exec(text)
  if (short) {
    const month = Number(short[1])
    const day = Number(short[2])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      // 年が無いときは今年。ただし半年以上前なら来年とみなす
      let year = today.getFullYear()
      const candidate = new Date(year, month - 1, day)
      const halfYearAgo = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000)
      if (candidate < halfYearAgo) year += 1
      return `${year}-${pad(month)}-${pad(day)}`
    }
  }
  return text
}

export interface ParseRosterResult {
  students: Student[]
  /** 読み取れた見出し（画面で確かめてもらう） */
  headers: string[]
  /** 読み飛ばした行と、その理由 */
  skipped: Array<{ line: number; reason: string }>
}

/**
 * 見出しつきの行の並びを名簿にする。
 *
 * 貼り付けた表からも、Supabase から返ってきた行からも、ここに集める。
 * 列の当て方（`mapHeaders`）と読み取りを 1 か所にしておくため。
 */
export function recordsToStudents(
  headerCells: string[],
  rows: string[][],
  today = new Date(),
): ParseRosterResult {
  const map = mapHeaders(headerCells)
  const headers = [...map.values()]
  const skipped: Array<{ line: number; reason: string }> = []

  if (!headers.includes('name')) {
    return {
      students: [],
      headers,
      skipped: [
        { line: 1, reason: '「生徒名」の列が見つかりません。1 行目に見出しを入れてください' },
      ],
    }
  }

  const students: Student[] = []
  const seen = new Set<string>()

  rows.forEach((cells, index) => {
    const line = index + 2
    const pick = (field: keyof Student): string => {
      for (const [column, key] of map) if (key === field) return cells[column] ?? ''
      return ''
    }

    const name = pick('name').trim()
    if (!name) {
      skipped.push({ line, reason: '生徒名が空です' })
      return
    }

    const extra: Record<string, string> = {}
    cells.forEach((cell, column) => {
      if (map.has(column) || !cell.trim()) return
      const label = headerCells[column]?.trim()
      if (label) extra[label] = cell.trim()
    })

    const id = pick('id').trim() || `name:${normalize(name)}`
    if (seen.has(id)) {
      skipped.push({ line, reason: `${name} は同じ番号の生徒がすでにいます` })
      return
    }
    seen.add(id)

    const list = (value: string, sep: RegExp = MULTI) =>
      value
        .split(sep)
        .map((part) => part.trim())
        .filter(Boolean)

    students.push({
      id,
      name,
      attendance: pick('attendance'),
      nextVisit: normalizeDate(pick('nextVisit'), today),
      courses: list(pick('courses')),
      progress: list(pick('progress'), MULTI_KEEP_SLASH).map(parseProgressCell),
      school: pick('school'),
      extra,
    })
  })

  return { students, headers, skipped }
}

/** 貼り付けた表（タブ区切り / CSV）を名簿にする */
export function parseRoster(input: string, today = new Date()): ParseRosterResult {
  const lines = input.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length === 0) return { students: [], headers: [], skipped: [] }
  const [header, ...rest] = lines
  return recordsToStudents(splitRow(header!), rest.map(splitRow), today)
}

/**
 * Supabase などから返ってきた行（キーと値の組）を名簿にする。
 * 列の名前は、貼り付けた表と同じ見出しの当て方で拾う
 */
export function jsonRowsToStudents(
  rows: Array<Record<string, unknown>>,
  today = new Date(),
): ParseRosterResult {
  if (rows.length === 0) return { students: [], headers: [], skipped: [] }
  // 行によって欠けている列があるので、出てきたキーを全部集める
  const keys: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row)) if (!keys.includes(key)) keys.push(key)
  }
  const cells = rows.map((row) =>
    keys.map((key) => {
      const value = row[key]
      if (value === null || value === undefined) return ''
      if (Array.isArray(value)) return value.join('、')
      return String(value)
    }),
  )
  return recordsToStudents(keys, cells, today)
}
