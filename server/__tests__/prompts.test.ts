import { describe, expect, it } from 'vitest'
import { buildSystemPrompt, turnInstruction } from '../prompts'
import { DEFAULT_PERSONA, toPersona } from '../persona'

describe('buildSystemPrompt', () => {
  it('キャラクター設定が指示文に入る', () => {
    const prompt = buildSystemPrompt({
      name: 'そら',
      firstPerson: 'ぼく',
      character: '元気で早口。犬が好き。',
      likes: '散歩、コロッケ',
    })
    expect(prompt).toContain('「そら」')
    expect(prompt).toContain('一人称は「ぼく」')
    expect(prompt).toContain('元気で早口。犬が好き。')
    expect(prompt).toContain('散歩、コロッケ')
  })

  it('ふだんの長さは仕様どおり 1 文・25 文字以内のまま', () => {
    // 全部の回を長くすると、声を作る時間がそのぶん伸びる
    expect(buildSystemPrompt()).toContain('返事は原則ひとつの文だけ。長くても25文字以内')
  })

  it('自分の話をしてよいこと、毎回質問しないことが書いてある', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('毎回質問で返さない')
    expect(prompt).toContain('相手の言葉をそのまま繰り返さない')
    expect(prompt).toContain('自分のことを素直に答える')
  })

  it('していない体験は語らせない（生徒は未成年のため、作り話をさせない）', () => {
    expect(buildSystemPrompt()).toContain('していないことを「した」とは言わない')
  })

  it('声で読み上げるための書き方は、仕様 3.3 のまま残す', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('記号、絵文字、顔文字、括弧、箇条書き、三点リーダーは使わない')
    expect(prompt).toContain('文の終わりは「。」か「？」')
  })

  it('渡さなければ既定のキャラクターになる', () => {
    expect(buildSystemPrompt()).toContain(DEFAULT_PERSONA.name)
  })
})

describe('turnInstruction', () => {
  it('回ごとの返し方が入る', () => {
    expect(turnInstruction(null, 'question')).toContain('短い質問を1つだけ')
    expect(turnInstruction(null, 'self')).toContain('自分の好きなものや考えを')
    expect(turnInstruction(null, 'echo')).toContain('短く受けとめるだけ')
    expect(turnInstruction(null, 'answer')).toContain('その質問に自分の言葉で素直に答えて')
  })

  it('締めの回は、話を広げずに終える', () => {
    const note = turnInstruction(null, 'closing')
    expect(note).toContain('いったん会話を終わります')
    expect(note).toContain('新しい質問はしないでください')
    // 聞かれたまま終わらないようにする
    expect(note).toContain('聞かれていたら')
  })

  it('自分の話と受けとめるだけの回は、質問を止める', () => {
    expect(turnInstruction(null, 'self')).toContain('質問をしないでください')
    expect(turnInstruction(null, 'echo')).toContain('質問をしないでください')
  })

  it('長さを広げるのは、自分の話をする回と答える回だけ', () => {
    expect(turnInstruction(null, 'self')).toContain('40文字以内')
    expect(turnInstruction(null, 'answer')).toContain('40文字以内')
    expect(turnInstruction(null, 'question')).not.toContain('40文字以内')
    expect(turnInstruction(null, 'echo')).not.toContain('40文字以内')
  })

  it('つなぎ言葉を言った回は、続きだけを書かせる', () => {
    const note = turnInstruction('おおー、いいねー。', 'self')
    expect(note).toContain('すでに「おおー、いいねー。」と声に出しています')
    expect(note).not.toContain('短い相槌をひとこと入れてから')
    // つなぎ言葉があっても、返し方の指示は残る
    expect(note).toContain('質問をしないでください')
  })

  it('注意は 1 つの見出しにまとめる', () => {
    const note = turnInstruction('うんうん。', 'question')
    expect(note.match(/【このターンの注意】/g)).toHaveLength(1)
  })
})

describe('toPersona', () => {
  it('渡された値を使う', () => {
    const persona = toPersona({
      name: 'そら',
      firstPerson: 'ぼく',
      character: '元気',
      likes: '散歩',
    })
    expect(persona).toEqual({ name: 'そら', firstPerson: 'ぼく', character: '元気', likes: '散歩' })
  })

  it('空や欠けている項目は、既定値に戻す', () => {
    expect(toPersona({ name: '  ', firstPerson: 'ぼく' })).toEqual({
      ...DEFAULT_PERSONA,
      firstPerson: 'ぼく',
    })
    expect(toPersona(undefined)).toEqual(DEFAULT_PERSONA)
    expect(toPersona('こわれている')).toEqual(DEFAULT_PERSONA)
  })

  it('長すぎる指示文は切りつめる', () => {
    const persona = toPersona({ character: 'あ'.repeat(1000) })
    expect(persona.character.length).toBe(300)
  })
})
