import { normalize, toHalfWidth } from '../logic/normalize'
import type { CourseProgress, Student } from './types'

/**
 * 名簿と、聞き取った言葉を照らし合わせる。
 *
 * **食い違いを「間違い」とは言わない。** 名簿が古いことも、
 * 聞き取りがうまくいっていないこともある。画面には並べて出すだけにして、
 * どう扱うかはコーチが決める。
 *
 * ここは副作用のない関数だけ（`__tests__/match.test.ts`）。
 */

/**
 * 東進ID（固有ID）を突き合わせる形にそろえる。
 *
 * **東進ID は数字だけ。** 全角で入れられたり、空白・ハイフン・「No.」などが
 * 混ざったりしても当たるよう、数字以外を落としてしまう。
 */
export function normalizeId(value: string): string {
  return toHalfWidth(value).replace(/\D/g, '')
}

/**
 * 東進ID で名簿から探す。
 *
 * **こちらが本命。** 同姓や表記ゆれの心配がないので、当たれば確実。
 *
 * 表計算ソフトが ID を数値として扱うと、先頭の 0 が落ちることがある
 * （「0101」が「101」になる）。そのときのために 0 を外した形でも見るが、
 * **2 人以上に当たるなら当てない。** 取り違えるくらいなら見つからないほうがよい。
 */
export function findById(roster: Student[], id: string): Student | null {
  const key = normalizeId(id)
  if (!key) return null

  const exact = roster.find((student) => normalizeId(student.id) === key)
  if (exact) return exact

  const trim = (value: string) => value.replace(/^0+/, '')
  const trimmed = trim(key)
  if (!trimmed) return null
  const loose = roster.filter((student) => trim(normalizeId(student.id)) === trimmed)
  return loose.length === 1 ? loose[0]! : null
}

/**
 * 東進ID があればそれで、無ければ名前で探す。
 *
 * 名前での照合は、同姓の生徒がいると当てられない。
 * **ID を入れてもらうのがいちばん確実**なので、そちらを先に見る。
 */
export function lookupStudent(
  roster: Student[],
  who: { id?: string; name?: string },
): Student | null {
  return (who.id ? findById(roster, who.id) : null) ?? (who.name ? findStudent(roster, who.name) : null)
}

/** 名前で名簿から探す。表記のゆれ（空白・全半角）は吸収する */
export function findStudent(roster: Student[], name: string): Student | null {
  const key = normalize(name)
  if (!key) return null
  const exact = roster.find((student) => normalize(student.name) === key)
  if (exact) return exact
  // 「山田」だけで呼ばれることもある。前方一致で 1 人に絞れるときだけ当てる
  const partial = roster.filter(
    (student) => normalize(student.name).startsWith(key) || key.startsWith(normalize(student.name)),
  )
  return partial.length === 1 ? partial[0]! : null
}

/** 聞き取った言葉の中に出てきた講座 */
export function matchCourses(transcript: string, courses: string[]): string[] {
  const said = normalize(transcript)
  if (!said) return []
  return courses.filter((course) => {
    const key = normalize(course)
    return key.length >= 2 && said.includes(key)
  })
}

export type VisitCheck =
  /** 名簿の予定日と、言っていた日が合っている */
  | { status: 'match'; planned: string }
  /** 食い違っている */
  | { status: 'differ'; planned: string; said: string }
  /** 名簿に予定が無い、または日付が聞き取れなかった */
  | { status: 'unknown'; planned: string }

/**
 * 「次はいつ来る？」の答えと、名簿の来校予定日を見くらべる。
 * @param planned 名簿の来校予定日（YYYY-MM-DD）
 * @param today 「あした」「木曜」を日付にするときの基準
 */
export function checkVisit(planned: string, transcript: string, today = new Date()): VisitCheck {
  const said = spokenDate(transcript, today)
  if (!planned || !said) return { status: 'unknown', planned }
  return said === planned ? { status: 'match', planned } : { status: 'differ', planned, said }
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** 話し言葉の日付を YYYY-MM-DD にする。読めなければ null */
export function spokenDate(transcript: string, today = new Date()): string | null {
  const text = transcript.trim()
  if (!text) return null

  const add = (days: number) => {
    const date = new Date(today)
    date.setDate(date.getDate() + days)
    return ymd(date)
  }
  if (/きょう|今日/.test(text)) return add(0)
  if (/あした|あす|明日/.test(text)) return add(1)
  if (/あさって|明後日/.test(text)) return add(2)

  // 「9月18日」「9/18」
  const md = /(\d{1,2})\s*[月\/／]\s*(\d{1,2})/.exec(text)
  if (md) {
    const month = Number(md[1])
    const day = Number(md[2])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let year = today.getFullYear()
      if (new Date(year, month - 1, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate() - 180)) {
        year += 1
      }
      return `${year}-${pad(month)}-${pad(day)}`
    }
  }

  // 「木曜」「来週の火曜日」。今日より後の、いちばん近いその曜日
  const weekday = /([日月火水木金土])\s*曜/.exec(text)
  if (weekday) {
    const target = WEEKDAYS.indexOf(weekday[1]!)
    const nextWeek = /来週/.test(text)
    let days = (target - today.getDay() + 7) % 7
    if (days === 0) days = 7
    if (nextWeek && days < 7) days += 7
    return add(days)
  }
  return null
}

/** 画面に出すための、日付の読みやすい形。「9月18日（木）」 */
export function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return `${date.getMonth() + 1}月${date.getDate()}日（${WEEKDAYS[date.getDay()]}）`
}

/** 講座の進み具合のうち、いちばん遅れているもの */
export function slowestCourse(progress: CourseProgress[]): CourseProgress | null {
  const rated = progress.filter((p) => p.done !== null && p.total !== null && p.total > 0)
  if (rated.length === 0) return null
  return rated.reduce((slow, item) => (item.done! / item.total! < slow.done! / slow.total! ? item : slow))
}
