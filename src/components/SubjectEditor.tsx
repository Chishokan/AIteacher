import { useState } from 'react'

interface SubjectEditorProps {
  label: string
  subjects: string[]
  onChange: (subjects: string[]) => void
}

/** 教科の一覧を追加・削除するエディタ */
export function SubjectEditor({ label, subjects, onChange }: SubjectEditorProps) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const name = draft.trim()
    if (!name || subjects.includes(name)) {
      setDraft('')
      return
    }
    onChange([...subjects, name])
    setDraft('')
  }

  return (
    <div className="field">
      <span>{label}</span>
      <div className="chips">
        {subjects.map((subject) => (
          <span className="chip" key={subject}>
            {subject}
            <button
              type="button"
              aria-label={`${subject}を削除`}
              onClick={() => onChange(subjects.filter((s) => s !== subject))}
            >
              ×
            </button>
          </span>
        ))}
        {subjects.length === 0 && <span className="muted">（なし）</span>}
      </div>
      <div className="row">
        <input
          className="input"
          style={{ flex: '1 1 200px', width: 'auto' }}
          value={draft}
          placeholder="教科を追加"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
        />
        <button type="button" className="btn" onClick={add}>
          追加
        </button>
      </div>
    </div>
  )
}
