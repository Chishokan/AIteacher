import type { CoachingAgenda } from './agenda'
import { parseRate } from './parseRate'
import { matchCourses, slowestCourse } from '../students/match'
import { formatProgress, type Student } from '../students/types'

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

/**
 * 名簿と照らし合わせた結果。
 *
 * **食い違いを「間違い」とは書かない。** 名簿が古いことも、聞き取りが
 * うまくいっていないこともある。並べて出すだけにして、扱いはコーチが決める。
 */
export interface RosterCheck {
  studentId: string
  /** 来校状況 */
  attendance: string
  /** 名簿の来校予定日 */
  nextVisit: string
  /** 志望校 */
  school: string
  /** 講座進捗（読みやすい形にしたもの） */
  progress: string[]
  /** いちばん遅れている講座 */
  slowest: string | null
  /** 「今日の講座の予定」に出てきた、取得講座と合う講座 */
  matchedCourses: string[]
  /** 話に出た講座が、取得講座のどれにも当たらなかった */
  courseUnmatched: boolean
}

export interface CoachingRecord {
  id: string
  studentName: string
  /** 東進ID（固有ID）。あとから名簿に突き合わせ直すために残す */
  toshinId: string
  startedAt: string
  finishedAt: string
  items: CoachingItem[]
  /** 名簿と照らし合わせた結果。名簿に見つからなければ null */
  roster: RosterCheck | null
}

/**
 * 話し終わったあとに、記録を組み立てる。
 * @param answers 項目の id ごとの、聞き取った言葉（話した順）
 */
export function buildRecord(
  agenda: CoachingAgenda,
  answers: Map<string, string[]>,
  meta: {
    id: string
    studentName: string
    toshinId: string
    startedAt: string
    finishedAt: string
  },
  /** 名簿で引き当てた生徒。無ければ照らし合わせをしない */
  student?: Student | null,
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
  return { ...meta, items, roster: checkRoster(agenda, answers, student) }
}

/** 名簿と、聞き取った内容を照らし合わせる */
function checkRoster(
  agenda: CoachingAgenda,
  answers: Map<string, string[]>,
  student?: Student | null,
): RosterCheck | null {
  if (!student) return null

  // 「今日の講座の予定」で話に出た講座を、取得講座と突き合わせる
  const lessonTopic = agenda.topics.find((topic) => topic.id === 'today-lesson')
  const said = (lessonTopic ? (answers.get(lessonTopic.id) ?? []) : []).join(' ')
  const matched = matchCourses(said, student.courses)
  const slowest = slowestCourse(student.progress)

  return {
    studentId: student.id,
    attendance: student.attendance,
    nextVisit: student.nextVisit,
    school: student.school,
    progress: student.progress.map((p) => `${p.course} ${formatProgress(p)}`),
    slowest: slowest ? `${slowest.course} ${formatProgress(slowest)}` : null,
    matchedCourses: matched,
    // 何か言っているのに、取得講座のどれにも当たらなかったときだけ印を付ける
    courseUnmatched: said.trim().length > 0 && student.courses.length > 0 && matched.length === 0,
  }
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
    // 表計算ソフトで名簿と突き合わせ直すときの鍵
    ['東進ID', record.toshinId || '（未入力）'],
    ['実施日時', new Date(record.startedAt).toLocaleString('ja-JP')],
    [],
  ]

  const roster = record.roster
    ? [
        [],
        ['名簿との照らし合わせ'],
        ['来校状況', orBlank(record.roster.attendance)],
        ['来校予定日', orBlank(record.roster.nextVisit)],
        ['志望校', orBlank(record.roster.school)],
        ['講座進捗', record.roster.progress.join(' / ')],
        ['話に出た講座', record.roster.matchedCourses.join('、')],
        [
          '取得講座との照合',
          record.roster.courseUnmatched
            ? '名簿の取得講座に当たりませんでした（確認してください）'
            : record.roster.matchedCourses.length > 0
              ? '取得講座と合っています'
              : '',
        ],
      ]
    : [[], ['名簿との照らし合わせ'], ['', '名簿に見つかりませんでした']]
  return (
    '﻿' +
    [...header, ...rows, ...roster].map((row) => row.map(CELL).join(',')).join('\r\n')
  )
}

/** 空欄のままだと、聞き忘れなのか空欄なのか分からなくなる */
const orBlank = (value: string) => value || '（空欄）'

/** 書き出すファイル名。同じ生徒でも日時で分かれる */
export function csvFileName(record: CoachingRecord): string {
  const at = new Date(record.startedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`
  const name = (record.studentName || 'コーチングタイム').replace(/[\\/:*?"<>|\s]/g, '')
  return `${name}-${stamp}.csv`
}
