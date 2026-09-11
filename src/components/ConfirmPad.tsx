interface ConfirmPadProps {
  /** 何についての答えか（例: 国語の得点） */
  label: string
  /** 聞き取った答え（例: 78点） */
  display: string
  onAnswer: (text: string) => void
}

/**
 * 聞き取った答えを画面に出して確認する。
 *
 * アバターは値を読み上げないので、ここが唯一の確認手段になる。
 * 生徒が声で「はい」「いいえ」と答えても、ボタンを押しても同じように進む。
 */
export function ConfirmPad({ label, display, onAnswer }: ConfirmPadProps) {
  return (
    <div className="confirm">
      <p className="confirm__label">{label}</p>
      <p className="confirm__value" aria-live="polite">
        {display}
      </p>
      <div className="confirm__actions">
        <button type="button" className="pad__key pad__key--accent" onClick={() => onAnswer('はい')}>
          はい、あっています
        </button>
        <button type="button" className="pad__key" onClick={() => onAnswer('いいえ')}>
          いいえ、ちがいます
        </button>
      </div>
    </div>
  )
}
