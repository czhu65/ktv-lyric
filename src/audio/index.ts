import type { Syllable } from '../types'

const LRU_MAX = 600 // ~600 clips of ~0.4s ≈ 10 MB decoded. A single sprite
                    // would be ~137 MB resident, which iOS Safari will kill.

export interface AudioEngine {
  unlock(): Promise<void>
  has(s: Syllable): boolean
  /** Decoded clip length in seconds, or 0 if not loaded. Does not play. */
  duration(s: Syllable): number
  load(s: Syllable): Promise<AudioBuffer | null>
  prefetch(ss: Syllable[]): Promise<void>
  play(s: Syllable, when?: number): number
}

export function createAudioEngine(ctx: BaseAudioContext): AudioEngine {
  const base = import.meta.env.BASE_URL
  const buffers = new Map<Syllable, AudioBuffer>()
  const inflight = new Map<Syllable, Promise<AudioBuffer | null>>()
  let available: Set<Syllable> | null = null

  function touch(s: Syllable, b: AudioBuffer) {
    buffers.delete(s)
    buffers.set(s, b)
    while (buffers.size > LRU_MAX) buffers.delete(buffers.keys().next().value as Syllable)
  }

  return {
    async unlock() {
      // AudioContext starts suspended on Chrome DESKTOP too, not just mobile.
      const c = ctx as unknown as AudioContext
      if (c.state === 'suspended' && typeof c.resume === 'function') await c.resume()
      available ??= new Set<Syllable>(
        await fetch(`${base}data/syllables.json`).then((r) => r.json()),
      )
    },

    has: (s) => available?.has(s) ?? false,

    duration: (s) => buffers.get(s)?.duration ?? 0,

    load(s) {
      const cached = buffers.get(s)
      if (cached) return Promise.resolve(cached)
      if (available && !available.has(s)) return Promise.resolve(null)

      let p = inflight.get(s)
      if (!p) {
        p = fetch(`${base}audio/syl/${s}.mp3`)
          .then((r) => (r.ok ? r.arrayBuffer() : null))
          // decodeAudioData sniffs bytes and ignores Content-Type, which makes
          // GitHub Pages' odd `audio/mp3` MIME mapping a non-issue.
          .then((ab) => (ab ? ctx.decodeAudioData(ab) : null))
          .then((b) => {
            if (b) touch(s, b)
            return b
          })
          .catch(() => null)
          .finally(() => inflight.delete(s))
        inflight.set(s, p)
      }
      return p
    },

    async prefetch(ss) {
      await Promise.all([...new Set(ss)].map((s) => this.load(s)))
    },

    play(s, when) {
      const b = buffers.get(s)
      if (!b) return 0
      const src = (ctx as AudioContext).createBufferSource()
      src.buffer = b
      src.connect(ctx.destination)
      src.start(when ?? ctx.currentTime)
      return b.duration
    },
  }
}
