/**
 * 返事の音声を鳴らす。
 *
 * new Audio() を毎回作る方式ではなく、AudioContext を 1 つだけ作って
 * 使いまわす。Safari は画面のタップから時間がたってからの再生を止めるため、
 * 「はじめる」のタップで作った 1 つを持ち回るのが確実（引き継ぎ仕様 4.2）。
 *
 * 音は 1 本の列にして、前が終わってから次を鳴らす。重ねない。
 */

let context: AudioContext | null = null
let current: AudioBufferSourceNode | null = null
/** 前の再生が終わるまで待つための鎖 */
let queue: Promise<void> = Promise.resolve()

type AudioContextCtor = typeof AudioContext

function getCtor(): AudioContextCtor | undefined {
  if (typeof window === 'undefined') return undefined
  return window.AudioContext ?? (window as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
}

/**
 * ユーザー操作の中で呼んで、音を出せる状態にしておく。
 * 2 度目以降は、止まっていたら動かし直すだけ。
 */
export function unlockAudioContext(): void {
  const Ctor = getCtor()
  if (!Ctor) return
  if (!context) context = new Ctor()
  if (context.state === 'suspended') void context.resume()
}

export function isAudioContextReady(): boolean {
  return context !== null && context.state === 'running'
}

/** 鳴っているものを止めて、待っている列も捨てる */
export function stopAllAudio(): void {
  if (current) {
    try {
      current.stop()
    } catch {
      // すでに終わっている
    }
    current = null
  }
  queue = Promise.resolve()
}

/**
 * 音声データを鳴らし終わるまで待つ。
 * @param onStart 実際に音が出はじめた時点で呼ばれる
 */
export function playAudio(
  data: ArrayBuffer,
  onStart?: () => void,
  signal?: AbortSignal,
): Promise<void> {
  const play = async () => {
    const Ctor = getCtor()
    if (!Ctor) return
    if (!context) context = new Ctor()
    if (context.state === 'suspended') await context.resume()
    if (signal?.aborted) return

    const buffer = await context.decodeAudioData(data)
    if (signal?.aborted) return

    await new Promise<void>((resolve) => {
      const source = context!.createBufferSource()
      source.buffer = buffer
      source.connect(context!.destination)
      current = source

      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', onAbort)
        if (current === source) current = null
        resolve()
      }
      function onAbort() {
        try {
          source.stop()
        } catch {
          // すでに終わっている
        }
        finish()
      }

      source.onended = finish
      signal?.addEventListener('abort', onAbort)
      source.start()
      onStart?.()
    })
  }

  // 前の音が終わってから鳴らす。失敗しても列は止めない
  queue = queue.then(play, play)
  return queue
}
