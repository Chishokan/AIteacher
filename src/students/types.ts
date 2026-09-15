/**
 * 生徒名簿。校舎のスプレッドシートで管理されているものを取り込む。
 *
 * **個人情報なので、この端末の中だけに置く。** サーバーには送らない
 * （Supabase につなぐ場合は別。第 7 章の未決事項を参照）。
 * コーチングタイムの聞き取りと照らし合わせるために使う。
 */

/** 講座の進み具合。「数学I 12/20」のような書き方を読み取ったもの */
export interface CourseProgress {
  /** 講座名 */
  course: string
  /** 受講済みのコマ数。読み取れなければ null */
  done: number | null
  /** 全体のコマ数。読み取れなければ null */
  total: number | null
  /** 名簿に書かれていたそのままの文字列 */
  raw: string
}

export interface Student {
  /** 名簿の中で一意。生徒番号があればそれ、無ければ名前から作る */
  id: string
  name: string
  /** 来校状況（例「順調」「減少」「停滞」） */
  attendance: string
  /** 次の来校予定日。読み取れたら YYYY-MM-DD、読めなければ書かれていたまま */
  nextVisit: string
  /** 取得講座 */
  courses: string[]
  /** 講座進捗 */
  progress: CourseProgress[]
  /** 志望校 */
  school: string
  /** 名簿にあったその他の列。画面には出すが、照らし合わせには使わない */
  extra: Record<string, string>
}

/** 進み具合を「12/20（60%）」のような読みやすい形にする */
export function formatProgress(progress: CourseProgress): string {
  if (progress.done === null || progress.total === null || progress.total === 0) return progress.raw
  const percent = Math.round((progress.done / progress.total) * 100)
  return `${progress.done}/${progress.total}（${percent}%）`
}
