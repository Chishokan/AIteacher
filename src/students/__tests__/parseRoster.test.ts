import { describe, expect, it } from 'vitest'
import { mapHeaders, normalizeDate, parseProgressCell, parseRoster } from '../parseRoster'

/** Google スプレッドシートからコピーするとタブ区切りになる */
const TSV = [
  '生徒番号\t生徒名\t来校状況\t来校予定日\t取得講座\t講座進捗\t志望校\t担当',
  '1001\t山田 太郎\t順調\t2026/9/18\t英語長文、数学I\t英語長文 12/20、数学I 5/15\t東京大学\t佐藤',
  '1002\t鈴木 花子\t減少\t9/20\t古文\t古文 3/20\t早稲田大学\t佐藤',
].join('\n')

const TODAY = new Date(2026, 8, 15) // 2026-09-15

describe('parseRoster', () => {
  it('タブ区切りの表を読む', () => {
    const { students, skipped } = parseRoster(TSV, TODAY)
    expect(skipped).toEqual([])
    expect(students).toHaveLength(2)
    expect(students[0]).toMatchObject({
      id: '1001',
      name: '山田 太郎',
      attendance: '順調',
      nextVisit: '2026-09-18',
      courses: ['英語長文', '数学I'],
      school: '東京大学',
    })
  })

  it('カンマ区切り（CSV）も読む', () => {
    const csv = '生徒名,志望校\n山田 太郎,東京大学'
    expect(parseRoster(csv, TODAY).students[0]).toMatchObject({
      name: '山田 太郎',
      school: '東京大学',
    })
  })

  it('引用符で囲まれたセルの中のカンマは、区切りにしない', () => {
    const csv = '生徒名,取得講座\n山田 太郎,"英語長文,数学I"'
    expect(parseRoster(csv, TODAY).students[0]!.courses).toEqual(['英語長文', '数学I'])
  })

  it('列の順番が違っても読める', () => {
    const csv = '志望校,生徒名\n京都大学,鈴木 花子'
    expect(parseRoster(csv, TODAY).students[0]).toMatchObject({
      name: '鈴木 花子',
      school: '京都大学',
    })
  })

  it('知らない列は、そのまま控えておく', () => {
    expect(parseRoster(TSV, TODAY).students[0]!.extra).toEqual({ 担当: '佐藤' })
  })

  it('講座進捗を数として読み取る', () => {
    const { progress } = parseRoster(TSV, TODAY).students[0]!
    expect(progress).toHaveLength(2)
    expect(progress[0]).toMatchObject({ course: '英語長文', done: 12, total: 20 })
  })

  it('生徒名の列が無ければ、読まずに理由を返す', () => {
    const result = parseRoster('志望校,担当\n東京大学,佐藤', TODAY)
    expect(result.students).toEqual([])
    expect(result.skipped[0]?.reason).toContain('生徒名')
  })

  it('名前が空の行は飛ばす', () => {
    const result = parseRoster('生徒名,志望校\n,東京大学\n山田,京都大学', TODAY)
    expect(result.students).toHaveLength(1)
    expect(result.skipped[0]).toMatchObject({ line: 2 })
  })

  it('同じ生徒番号が並んでいたら、あとの行を飛ばす', () => {
    const result = parseRoster('生徒番号,生徒名\n1,山田\n1,鈴木', TODAY)
    expect(result.students).toHaveLength(1)
    expect(result.skipped[0]?.reason).toContain('すでにいます')
  })

  it('空の入力でも落ちない', () => {
    expect(parseRoster('', TODAY).students).toEqual([])
    expect(parseRoster('   \n  ', TODAY).students).toEqual([])
  })
})

describe('mapHeaders', () => {
  it('見出しの書き方のゆれを吸収する', () => {
    const map = mapHeaders(['氏名', '次回来校日', '第一志望'])
    expect([...map.values()]).toEqual(['name', 'nextVisit', 'school'])
  })

  it('見出しに但し書きが付いていても当てる', () => {
    expect([...mapHeaders(['生徒名（フリガナ）']).values()]).toEqual(['name'])
  })
})

describe('normalizeDate', () => {
  const today = new Date(2026, 8, 15)

  it('年が書かれていれば、そのまま使う', () => {
    expect(normalizeDate('2026/9/18', today)).toBe('2026-09-18')
    expect(normalizeDate('2026-09-18', today)).toBe('2026-09-18')
    expect(normalizeDate('2026年9月18日', today)).toBe('2026-09-18')
  })

  it('年が無ければ今年。ただし半年以上前なら来年とみなす', () => {
    expect(normalizeDate('9/20', today)).toBe('2026-09-20')
    expect(normalizeDate('1/10', today)).toBe('2027-01-10')
  })

  it('読み取れなければ、書かれていたまま残す', () => {
    expect(normalizeDate('未定', today)).toBe('未定')
    expect(normalizeDate('', today)).toBe('')
  })
})

describe('parseProgressCell', () => {
  it('講座名とコマ数に分ける', () => {
    expect(parseProgressCell('英語長文 12/20')).toMatchObject({
      course: '英語長文',
      done: 12,
      total: 20,
    })
  })

  it('コマ数が書かれていなければ、講座名だけにする', () => {
    expect(parseProgressCell('数学I 受講中')).toMatchObject({
      course: '数学I 受講中',
      done: null,
      total: null,
    })
  })
})
