import { describe, expect, it } from 'vitest'
import {
  clipKey,
  findPrebuiltClip,
  parsePrebuiltManifest,
  type PrebuiltManifest,
  type PrebuiltVoice,
} from '../prebuiltClips'

const VOICE: PrebuiltVoice = {
  speaker: 'まお',
  style: 'おちつき',
  speedScale: 1.0,
  pitchScale: 0.0,
  intonationScale: 1.0,
  tempoDynamicsScale: 1.0,
}

const OPENING = 'こんにちは。今日はどんな一日だった？'

const MANIFEST: PrebuiltManifest = {
  clips: [
    { id: 'opening', text: OPENING, file: 'opening-abc12345.wav', voice: VOICE },
    {
      id: 'retry-notice',
      text: 'うまく聞き取れませんでした。もう一度押してください。',
      file: 'retry-notice-def67890.wav',
      voice: VOICE,
    },
  ],
}

describe('clipKey', () => {
  it('前後の空白は無視する', () => {
    expect(clipKey(`  ${OPENING}  `, VOICE)).toBe(clipKey(OPENING, VOICE))
  })

  it('小数の誤差は同じものとして扱う', () => {
    expect(clipKey(OPENING, { ...VOICE, speedScale: 1.0000001 })).toBe(clipKey(OPENING, VOICE))
  })

  it('声が違えば別のものになる', () => {
    expect(clipKey(OPENING, { ...VOICE, speaker: 'あんず' })).not.toBe(clipKey(OPENING, VOICE))
  })
})

describe('findPrebuiltClip', () => {
  it('文言と声がそろえば見つかる', () => {
    expect(findPrebuiltClip(MANIFEST, OPENING, VOICE)?.file).toBe('opening-abc12345.wav')
  })

  it('文言を変えたら見つからない（その場の合成に落とす）', () => {
    expect(findPrebuiltClip(MANIFEST, 'やあ、調子はどう？', VOICE)).toBeNull()
  })

  it('声を変えたら見つからない', () => {
    expect(findPrebuiltClip(MANIFEST, OPENING, { ...VOICE, speaker: 'あんず' })).toBeNull()
  })

  it('スタイルを変えたら見つからない', () => {
    expect(findPrebuiltClip(MANIFEST, OPENING, { ...VOICE, style: 'げんき' })).toBeNull()
  })

  it('速さを変えたら見つからない', () => {
    expect(findPrebuiltClip(MANIFEST, OPENING, { ...VOICE, speedScale: 1.2 })).toBeNull()
  })

  it('抑揚を変えたら見つからない', () => {
    expect(findPrebuiltClip(MANIFEST, OPENING, { ...VOICE, intonationScale: 1.3 })).toBeNull()
  })

  it('抑揚の動きを変えたら見つからない', () => {
    expect(findPrebuiltClip(MANIFEST, OPENING, { ...VOICE, tempoDynamicsScale: 1.4 })).toBeNull()
  })

  it('一覧が空なら見つからない', () => {
    expect(findPrebuiltClip({ clips: [] }, OPENING, VOICE)).toBeNull()
  })
})

describe('parsePrebuiltManifest', () => {
  it('正しい一覧はそのまま通る', () => {
    const parsed = parsePrebuiltManifest(MANIFEST)
    expect(parsed.clips).toHaveLength(2)
    expect(findPrebuiltClip(parsed, OPENING, VOICE)?.id).toBe('opening')
  })

  it('一覧でないものは空として扱う', () => {
    expect(parsePrebuiltManifest(null).clips).toEqual([])
    expect(parsePrebuiltManifest('こわれている').clips).toEqual([])
    expect(parsePrebuiltManifest({}).clips).toEqual([])
    expect(parsePrebuiltManifest({ clips: 'なにか' }).clips).toEqual([])
  })

  it('欠けている項目のあるものは捨てて、残りは生かす', () => {
    const parsed = parsePrebuiltManifest({
      clips: [
        { id: 'no-file', text: OPENING, voice: VOICE },
        { id: 'no-text', file: 'x.wav', voice: VOICE },
        { id: 'no-voice', text: OPENING, file: 'x.wav' },
        { id: 'blank-text', text: '   ', file: 'x.wav', voice: VOICE },
        null,
        MANIFEST.clips[0],
      ],
    })
    expect(parsed.clips.map((c) => c.id)).toEqual(['opening'])
  })

  it('数字が抜けていても 0 として読み、突き合わせに使える形にする', () => {
    const parsed = parsePrebuiltManifest({
      clips: [{ id: 'opening', text: OPENING, file: 'x.wav', voice: { speaker: 'まお', style: 'おちつき' } }],
    })
    expect(parsed.clips[0]?.voice).toEqual({
      speaker: 'まお',
      style: 'おちつき',
      speedScale: 0,
      pitchScale: 0,
      intonationScale: 0,
      tempoDynamicsScale: 0,
    })
  })
})
