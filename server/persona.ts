/**
 * アバターのキャラクター設定。
 *
 * 引き継ぎ仕様 3.3 の指示文は「聞き役」に振り切っていて、毎回
 * おうむ返し＋質問になってしまう。自分のことも話せるように、
 * 人物像をここで持つ。
 *
 * **設定画面から変えられる。** 空のまま渡されたら、この既定値を使う。
 */

export interface ChatPersona {
  /** 名前 */
  name: string
  /** 一人称 */
  firstPerson: string
  /** どんな相手か */
  character: string
  /** 自分の話のたね。ここから一言そえる */
  likes: string
}

/**
 * 既定のキャラクター。
 *
 * **AI であることは隠さない。** 生徒は中高生なので、
 * 「昨日ラーメンを食べた」のような、していない体験を語らせない。
 * 代わりに「好きなもの」「そう思う理由」を話す。
 */
export const DEFAULT_PERSONA: ChatPersona = {
  name: 'ミライ',
  firstPerson: 'わたし',
  character:
    '塾にいる、話し好きのアシスタント。AIであることは隠さないが、堅苦しくはしない。生徒の話をおもしろがって聞く。おだやかで、少しのんびりしている。',
  likes: '星や宇宙の話、雨の音、寒い日の自動販売機、生徒から聞く給食の話、読みのむずかしい漢字',
}

/** 長すぎる指示文で費用と待ち時間が増えないように、上限を決めておく */
const LIMITS: Record<keyof ChatPersona, number> = {
  name: 20,
  firstPerson: 10,
  character: 300,
  likes: 200,
}

/**
 * 受け取った値を、信用できる形にそろえる。
 * 空だったり形が違ったりしたら、その項目は既定値に戻す。
 */
export function toPersona(raw: unknown): ChatPersona {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PERSONA
  const value = raw as Record<string, unknown>
  const pick = (key: keyof ChatPersona): string => {
    const text = typeof value[key] === 'string' ? (value[key] as string).trim() : ''
    if (!text) return DEFAULT_PERSONA[key]
    return text.slice(0, LIMITS[key])
  }
  return {
    name: pick('name'),
    firstPerson: pick('firstPerson'),
    character: pick('character'),
    likes: pick('likes'),
  }
}
