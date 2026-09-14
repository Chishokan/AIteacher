import { describe, expect, it } from 'vitest'
import {
  FILLER_WORDS,
  NAME_SLOT,
  allFillerLines,
  chooseFiller,
  detectScene,
  rememberFiller,
  withoutRecent,
  type FillerContext,
} from '../fillers'

/**
 * 場面の判定は、引き継ぎ仕様 3.2（docs/voice-chat-spec.md）の表のとおり。
 * 仕様に「13 件すべて期待どおり」とあるうち、文面が載っているのは 2 件だけなので、
 * 残りは表の各行から作った。表を変えたら、ここも合わせて直すこと。
 */
describe('detectScene', () => {
  it('仕様に文面が載っている 2 件', () => {
    // 「楽しかった」が入っていても、負けた話は大変として拾う
    expect(detectScene('楽しかったけど試合には負けた')).toBe('大変')
    // 「楽しくなかった」を「楽しい」と取り違えない
    expect(detectScene('文化祭の準備は楽しくなかった')).toBe('大変')
  })

  it('打ち消しは大変として拾う', () => {
    expect(detectScene('あんまり嬉しくなかったなあ')).toBe('大変')
    expect(detectScene('テストはできなかったよ')).toBe('大変')
    expect(detectScene('あの映画はつまらなかった')).toBe('大変')
    expect(detectScene('部活はもう好きじゃなくなった')).toBe('大変')
  })

  it('大変', () => {
    expect(detectScene('部活で疲れちゃった')).toBe('大変')
    expect(detectScene('先生に怒られたんだよね')).toBe('大変')
    expect(detectScene('数学が赤点だったんだ')).toBe('大変')
  })

  it('質問', () => {
    expect(detectScene('先生はどこの出身なの？')).toBe('質問')
    expect(detectScene('部活のこと教えてほしいな')).toBe('質問')
    expect(detectScene('どうしてそう思ったのかな')).toBe('質問')
  })

  it('びっくり', () => {
    expect(detectScene('この前の大会で優勝したんだ')).toBe('びっくり')
    expect(detectScene('数学で満点とれたんだよ')).toBe('びっくり')
    expect(detectScene('生まれて初めて自分でごはんを作った')).toBe('びっくり')
  })

  it('楽しい', () => {
    expect(detectScene('友だちと遊んだのが楽しかった')).toBe('楽しい')
    expect(detectScene('お昼のカレーが美味しかったなあ')).toBe('楽しい')
  })

  it('みじかい（6文字以下）', () => {
    expect(detectScene('ふつう')).toBe('みじかい')
    expect(detectScene('べつに')).toBe('みじかい')
    expect(detectScene('いつもどおり')).toBe('みじかい') // ちょうど 6 文字
    expect(detectScene('いつもどおりだよ')).toBe('ふつう') // 8 文字
  })

  it('それ以外はふつう', () => {
    expect(detectScene('きのうは家で妹と留守番をしていた')).toBe('ふつう')
  })

  it('暗い話を、うれしい話やびっくりより先に拾う', () => {
    // 「優勝」（びっくり）より「負けた」（大変）が先
    expect(detectScene('優勝した学校に負けた')).toBe('大変')
  })

  it('前後の空白は無視する', () => {
    expect(detectScene('  べつに  ')).toBe('みじかい')
  })
})

/** テストのあいだは、すべての音声が用意できていることにする */
const allReady = () => true

function context(over: Partial<FillerContext> = {}): FillerContext {
  return {
    isReady: allReady,
    recent: [],
    turnsSinceName: Infinity,
    random: () => 0,
    ...over,
  }
}

describe('withoutRecent', () => {
  const all = ['A', 'B', 'C']

  it('使ったばかりの言葉を避ける', () => {
    expect(withoutRecent(all, ['A'])).toEqual(['B', 'C'])
  })

  it('候補が 2 つを切るなら、避けるのをあきらめる（順番を読まれないため）', () => {
    expect(withoutRecent(all, ['A', 'B'])).toEqual(['B', 'C'])
    expect(withoutRecent(all, ['A', 'B', 'C'])).toEqual(['B', 'C'])
  })

  it('もともと 2 つしか無ければ、そのまま返す', () => {
    expect(withoutRecent(['A', 'B'], ['A'])).toEqual(['A', 'B'])
  })
})

describe('rememberFiller', () => {
  it('新しいものが先頭に来る', () => {
    expect(rememberFiller(['A'], 'B')).toEqual(['B', 'A'])
  })

  it('同じ言葉が二重に並ばない', () => {
    expect(rememberFiller(['B', 'A'], 'A')).toEqual(['A', 'B'])
  })

  it('3 つまでしか覚えない', () => {
    expect(rememberFiller(['C', 'B', 'A'], 'D')).toEqual(['D', 'C', 'B'])
  })
})

describe('chooseFiller', () => {
  it('場面に合った言葉を選ぶ', () => {
    const pick = chooseFiller('部活で疲れちゃった', context())
    expect(pick.scene).toBe('大変')
    expect(FILLER_WORDS['大変']).toContain(pick.text)
    expect(pick.skipReason).toBeNull()
  })

  it('用意できていない言葉は使わない', () => {
    const only = 'あらら、おつかれさまー。'
    const pick = chooseFiller('部活で疲れちゃった', context({ isReady: (t) => t === only }))
    expect(pick.text).toBe(only)
  })

  it('その場面の声が無ければ、ふつうで代用する', () => {
    const pick = chooseFiller(
      '部活で疲れちゃった',
      context({ isReady: (t) => FILLER_WORDS['ふつう'].includes(t) }),
    )
    expect(pick.scene).toBe('大変') // 判定そのものは変わらない
    expect(FILLER_WORDS['ふつう']).toContain(pick.text)
  })

  it('ひとつも用意できていなければ、理由を添えて使わない', () => {
    const pick = chooseFiller('部活で疲れちゃった', context({ isReady: () => false }))
    expect(pick.text).toBeNull()
    expect(pick.skipReason).toBe('準備が間に合わず（ふつう・準備済み 0/3）')
  })

  it('名前が無ければ、名前入りの言葉は使わない', () => {
    // 「楽しい」の中で用意できているのを名前入りだけにしても、名前が無いので選べない
    const nameWord = FILLER_WORDS['楽しい'].find((w) => w.includes(NAME_SLOT))!
    const pick = chooseFiller(
      '友だちと遊んだのが楽しかった',
      context({ isReady: (t) => t === nameWord }),
    )
    expect(pick.text).toBeNull()
  })

  it('名前入りは、前に使ってから 4 回たつまで使わない', () => {
    const ctx = context({ studentName: 'ゆうと', turnsSinceName: 3, random: () => 0.99 })
    const pick = chooseFiller('友だちと遊んだのが楽しかった', ctx)
    expect(pick.usedName).toBe(false)
    expect(pick.text).not.toContain('ゆうと')
  })

  it('4 回たっていれば名前入りも候補に入る（見送りの目が出なければ使う）', () => {
    // random: 1 回目=言葉選び（最後の＝名前入り）、2 回目=見送りの判定（0.9 なので見送らない）
    const values = [0.99, 0.9]
    let i = 0
    const ctx = context({
      studentName: 'ゆうと',
      turnsSinceName: 4,
      random: () => values[i++] ?? 0,
    })
    const pick = chooseFiller('友だちと遊んだのが楽しかった', ctx)
    expect(pick.usedName).toBe(true)
    expect(pick.text).toBe('ゆうと、よかったねー。')
  })

  it('名前入りを選んでも、半分の確率で見送る', () => {
    // 2 回目の乱数が 0.1（<0.5）なので見送り、名前なしから選び直す
    const values = [0.99, 0.1, 0]
    let i = 0
    const ctx = context({
      studentName: 'ゆうと',
      turnsSinceName: 10,
      random: () => values[i++] ?? 0,
    })
    const pick = chooseFiller('友だちと遊んだのが楽しかった', ctx)
    expect(pick.usedName).toBe(false)
    expect(pick.text).not.toContain('ゆうと')
  })

  it('使ったばかりの言葉は避ける', () => {
    const recent = ['うんうん、なるほどねー。']
    const pick = chooseFiller('きのうは家で妹と留守番をしていた', context({ recent }))
    expect(pick.text).not.toBe(recent[0])
  })
})

describe('allFillerLines', () => {
  it('名前を渡さなければ、名前入りは作らない', () => {
    const lines = allFillerLines()
    expect(lines).toHaveLength(17)
    expect(lines.every((l) => !l.text.includes(NAME_SLOT))).toBe(true)
  })

  it('名前を渡すと、名前入りも作る', () => {
    const lines = allFillerLines('ゆうと')
    expect(lines).toHaveLength(19)
    expect(lines.filter((l) => l.text.includes('ゆうと'))).toHaveLength(2)
  })

  it('ファイル名に使う id は半角だけで作る', () => {
    for (const line of allFillerLines('ゆうと')) {
      expect(line.id).toMatch(/^[a-z0-9-]+$/)
    }
  })
})
