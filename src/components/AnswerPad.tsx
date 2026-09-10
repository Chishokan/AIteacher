import { useEffect, useState } from 'react'
import type { Question } from '../types'

interface AnswerPadProps {
  question: Question
  onSubmit: (text: string, value?: number) => void
  onSkip: () => void
}

/** 音声で答えられないときに使う、画面入力用のパッド */
export function AnswerPad({ question, onSubmit, onSkip }: AnswerPadProps) {
  const [digits, setDigits] = useState('')
  const [text, setText] = useState('')

  // 質問が変わったら入力中の内容を捨てる
  useEffect(() => {
    setDigits('')
    setText('')
  }, [question.id])

  const max = question.maxScore ?? 100

  if (question.kind === 'score') {
    const value = digits === '' ? null : Number(digits)
    const tooLarge = value !== null && value > max

    const push = (digit: string) => {
      setDigits((prev) => {
        const next = (prev + digit).replace(/^0+(?=\d)/, '')
        return next.length > 4 ? prev : next
      })
    }

    return (
      <div className="pad">
        <p className="pad__hint">画面から入力する（0〜{max}点）</p>
        <div className="pad__display" aria-live="polite">
          {digits === '' ? '— —' : `${digits}点`}
        </div>
        {tooLarge && <p className="banner banner--warn">満点は{max}点です</p>}
        <div className="pad__grid pad__grid--numpad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button key={digit} type="button" className="pad__key" onClick={() => push(digit)}>
              {digit}
            </button>
          ))}
          <button type="button" className="pad__key" onClick={() => setDigits('')}>
            消す
          </button>
          <button type="button" className="pad__key" onClick={() => push('0')}>
            0
          </button>
          <button
            type="button"
            className="pad__key pad__key--accent"
            disabled={value === null || tooLarge}
            onClick={() => value !== null && onSubmit(`${value}点`, value)}
          >
            決定
          </button>
        </div>
        <button type="button" className="btn btn--block" onClick={onSkip}>
          この質問をとばす
        </button>
      </div>
    )
  }

  if (question.kind === 'grade') {
    return (
      <div className="pad">
        <p className="pad__hint">画面から入力する（評定 1〜5）</p>
        <div className="pad__grid pad__grid--grades">
          {[1, 2, 3, 4, 5].map((grade) => (
            <button
              key={grade}
              type="button"
              className="pad__key pad__key--accent"
              onClick={() => onSubmit(`${grade}`, grade)}
            >
              {grade}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--block" onClick={onSkip}>
          この質問をとばす
        </button>
      </div>
    )
  }

  if (question.kind === 'yesno') {
    return (
      <div className="pad">
        <p className="pad__hint">画面から答える</p>
        <div className="pad__choices">
          <button type="button" className="pad__key pad__key--accent" onClick={() => onSubmit('はい')}>
            はい
          </button>
          <button type="button" className="pad__key" onClick={() => onSubmit('いいえ')}>
            いいえ
          </button>
        </div>
      </div>
    )
  }

  if (question.kind === 'choice') {
    return (
      <div className="pad">
        <p className="pad__hint">画面から選ぶ</p>
        <div className="pad__choices">
          {(question.choices ?? []).map((choice) => (
            <button
              key={choice}
              type="button"
              className="pad__key pad__key--wide"
              onClick={() => onSubmit(choice)}
            >
              {choice}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--block" onClick={onSkip}>
          この質問をとばす
        </button>
      </div>
    )
  }

  return (
    <div className="pad">
      <p className="pad__hint">画面から入力する</p>
      <textarea
        className="textarea"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="ここに入力してください"
        aria-label="回答を入力"
      />
      <div className="row">
        <button
          type="button"
          className="btn btn--primary"
          disabled={text.trim().length === 0}
          onClick={() => onSubmit(text.trim())}
        >
          送信
        </button>
        <button type="button" className="btn" onClick={onSkip}>
          この質問をとばす
        </button>
      </div>
    </div>
  )
}
