import { useCallback, useEffect, useState } from 'react'
import { parseRoster, type ParseRosterResult } from '../students/parseRoster'
import {
  clearLocalRoster,
  createServerStudentSource,
  loadLocalRoster,
  saveLocalRoster,
} from '../students/source'
import { formatDate } from '../students/match'
import { formatProgress, type Student } from '../students/types'

/**
 * 生徒名簿の取り込みと確認。
 *
 * **スプレッドシートから貼り付けるだけで使える。** Google スプレッドシートや
 * Excel の範囲をコピーするとタブ区切りになるので、そのまま貼れる。
 *
 * Supabase を設定していれば、そちらから読むこともできる。
 * 鍵はサーバー側だけが持っていて、ここには渡ってこない。
 */

const SAMPLE = `東進ID	生徒名	来校状況	来校予定日	取得講座	講座進捗	志望校
1001	山田 太郎	順調	2026/9/18	英語長文、数学I	英語長文 12/20、数学I 5/15	東京大学`

interface RosterScreenProps {
  onClose: () => void
}

export function RosterScreen({ onClose }: RosterScreenProps) {
  const [roster, setRoster] = useState<Student[]>([])
  const [pasted, setPasted] = useState('')
  const [preview, setPreview] = useState<ParseRosterResult | null>(null)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setRoster(loadLocalRoster())
  }, [])

  const readPasted = useCallback((text: string) => {
    setPasted(text)
    setNotice('')
    setPreview(text.trim() ? parseRoster(text) : null)
  }, [])

  const save = useCallback(() => {
    if (!preview || preview.students.length === 0) return
    saveLocalRoster(preview.students)
    setRoster(preview.students)
    setPasted('')
    setPreview(null)
    setNotice(`${preview.students.length} 人を取り込みました。`)
  }, [preview])

  const fromSupabase = useCallback(async () => {
    setLoading(true)
    setNotice('')
    const result = await createServerStudentSource().load()
    setLoading(false)
    if (!result.ok) {
      setNotice(result.message)
      return
    }
    saveLocalRoster(result.students)
    setRoster(result.students)
    setNotice(`Supabase から ${result.students.length} 人を読み込みました。`)
  }, [])

  return (
    <div className="settings">
      <div className="appbar">
        <h1 className="appbar__title">生徒名簿</h1>
        <span className="appbar__badge appbar__badge--quiet">{roster.length} 人</span>
        <span className="spacer" />
        <button type="button" className="btn" onClick={onClose}>
          閉じる
        </button>
      </div>

      <div className="card">
        <div className="field">
          <span>スプレッドシートから取り込む</span>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            表の範囲を見出しごとコピーして、下に貼り付けてください。
            列の順番は自由です。1 行目の見出しを見て読み取ります。
            <strong>名簿はこの端末の中だけに保存されます。</strong>
          </p>
        </div>

        <textarea
          className="textarea"
          rows={6}
          placeholder={SAMPLE}
          value={pasted}
          onChange={(event) => readPasted(event.target.value)}
        />

        {preview && (
          <div className="roster__preview">
            {preview.students.length > 0 ? (
              <p className="roster__preview-ok">
                {preview.students.length} 人ぶん読み取れました（
                {preview.headers.map((h) => FIELD_LABELS[h] ?? h).join('・')}）
              </p>
            ) : (
              <p className="banner banner--warn">読み取れませんでした。</p>
            )}
            {preview.skipped.length > 0 && (
              <ul className="roster__skipped">
                {preview.skipped.slice(0, 5).map((s) => (
                  <li key={s.line}>
                    {s.line} 行目：{s.reason}
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="btn btn--primary btn--block"
              disabled={preview.students.length === 0}
              onClick={save}
            >
              この内容で取り込む
            </button>
          </div>
        )}

        <div className="row" style={{ marginTop: 16 }}>
          <button type="button" className="btn" disabled={loading} onClick={() => void fromSupabase()}>
            {loading ? '読み込み中…' : 'Supabase から読み込む'}
          </button>
          {roster.length > 0 && (
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                clearLocalRoster()
                setRoster([])
                setNotice('名簿を消しました。')
              }}
            >
              名簿を消す
            </button>
          )}
        </div>

        {notice && <p className="banner banner--warn" style={{ marginTop: 12 }}>{notice}</p>}
      </div>

      {roster.length > 0 && (
        <div className="card">
          <div className="field">
            <span>取り込んである名簿</span>
          </div>
          <ul className="roster__list">
            {roster.slice(0, 50).map((student) => (
              <li key={student.id} className="roster__item">
                <strong>
                  {student.name}
                  <span className="roster__id">{student.id}</span>
                </strong>
                <span className="roster__tags">
                  {student.attendance && <span className="roster__tag">{student.attendance}</span>}
                  {student.nextVisit && (
                    <span className="roster__tag">次回 {formatDate(student.nextVisit)}</span>
                  )}
                  {student.school && <span className="roster__tag">{student.school}</span>}
                </span>
                {student.progress.length > 0 && (
                  <span className="roster__progress">
                    {student.progress.map((p) => `${p.course} ${formatProgress(p)}`).join(' / ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {roster.length > 50 && <p className="muted">ほか {roster.length - 50} 人</p>}
        </div>
      )}
    </div>
  )
}

const FIELD_LABELS: Record<string, string> = {
  id: '東進ID',
  name: '生徒名',
  attendance: '来校状況',
  nextVisit: '来校予定日',
  courses: '取得講座',
  progress: '講座進捗',
  school: '志望校',
}
