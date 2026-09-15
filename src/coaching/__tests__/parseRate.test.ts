import { describe, expect, it } from 'vitest'
import { parseRate } from '../parseRate'

describe('parseRate', () => {
  it('割で答える', () => {
    expect(parseRate('8割くらいかな')).toBe(80)
    expect(parseRate('はち割くらい')).toBe(80)
    expect(parseRate('十割できた')).toBe(100)
    expect(parseRate('0割')).toBe(0)
  })

  it('割と分をあわせて答える', () => {
    expect(parseRate('7割5分くらい')).toBe(75)
  })

  it('パーセントで答える', () => {
    expect(parseRate('80パーセント')).toBe(80)
    expect(parseRate('80%')).toBe(80)
    expect(parseRate('だいたい65パーセントくらい')).toBe(65)
  })

  it('言い回しで答える', () => {
    expect(parseRate('半分くらいかな')).toBe(50)
    expect(parseRate('ぜんぶできた')).toBe(100)
    expect(parseRate('ぜんぜんできなかった')).toBe(0)
    expect(parseRate('ほとんどできなかったです')).toBe(0)
  })

  it('数字だけで答える', () => {
    expect(parseRate('70')).toBe(70)
    expect(parseRate('ななじゅう')).toBe(70)
  })

  it('読み取れないときは null（無理に数字にしない）', () => {
    expect(parseRate('うーん、どうだろう')).toBeNull()
    expect(parseRate('')).toBeNull()
    expect(parseRate('   ')).toBeNull()
  })

  it('割合として大きすぎる数は、そのままでは採らない', () => {
    // 「150」は割合ではない。言い回しにも当たらないので読み取れない
    expect(parseRate('150')).toBeNull()
  })
})
