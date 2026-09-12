/**
 * あらかじめ用意した音声を鳴らす。
 *
 * ファイルが置かれていないものは読み上げ（音声合成）にまわすので、
 * 少しずつ差し替えていける。
 */

/** 1 サンプルぶんの無音。iOS で音を出す許可を取るために使う */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

/** 音声があるか調べた結果。同じファイルを何度も問い合わせない */
const availability = new Map<string, Promise<boolean>>()

export function clipUrl(id: string): string {
  return `${import.meta.env.BASE_URL}audio/${id}.mp3`
}

/** その音声が置かれているか。1 度だけ問い合わせて覚えておく */
export function isClipAvailable(id: string): Promise<boolean> {
  const cached = availability.get(id)
  if (cached) return cached

  const probe = fetch(clipUrl(id), { method: 'HEAD' })
    .then((response) => {
      if (!response.ok) return false
      // 置かれていないパスに index.html が返ってくる配信もあるため、種類も見る
      const type = response.headers.get('content-type') ?? ''
      return type === '' || /audio|mpeg|octet-stream/i.test(type)
    })
    .catch(() => false)

  availability.set(id, probe)
  return probe
}

/** 1 本鳴らし終わるまで待つ。失敗しても例外にはしない */
function playOne(url: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(url)
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      audio.onended = null
      audio.onerror = null
      resolve()
    }
    function onAbort() {
      audio.pause()
      finish()
    }

    if (signal?.aborted) {
      resolve()
      return
    }
    signal?.addEventListener('abort', onAbort)

    audio.onended = finish
    audio.onerror = finish
    void audio.play().catch(finish)
  })
}

/**
 * 音声を順番に鳴らす。
 * 1 本でも置かれていなければ何も鳴らさず false を返す（読み上げにまわす）。
 */
export async function playClips(ids: string[], signal?: AbortSignal): Promise<boolean> {
  if (ids.length === 0) return false

  const found = await Promise.all(ids.map(isClipAvailable))
  if (!found.every(Boolean)) return false
  if (signal?.aborted) return true

  for (const id of ids) {
    if (signal?.aborted) break
    await playOne(clipUrl(id), signal)
  }
  return true
}

/**
 * iOS / Safari 対策。
 * ユーザー操作の中で一度だけ無音を鳴らして、音声の再生を解禁する。
 */
export function unlockAudio(): void {
  const audio = new Audio(SILENT_WAV)
  audio.volume = 0
  void audio.play().catch(() => {
    // 解禁できなくても、あとで実際の再生を試みる
  })
}
