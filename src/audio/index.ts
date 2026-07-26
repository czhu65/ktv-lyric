import type { Syllable } from '../types'

const LRU_MAX = 600 // ~600 clips of ~0.4s ≈ 10 MB decoded. A single sprite
                    // would be ~137 MB resident, which iOS Safari will kill.

export interface AudioEngine {
  unlock(): Promise<void>
  /** Always false until `unlock()` has resolved (the manifest isn't loaded yet) — await `unlock()` first. */
  has(s: Syllable): boolean
  /**
   * Decoded clip length in seconds, or 0 if not loaded. Does not play.
   * Requires `unlock()` to have resolved before the syllable is loaded —
   * await `unlock()` first.
   */
  duration(s: Syllable): number
  load(s: Syllable): Promise<AudioBuffer | null>
  prefetch(ss: Syllable[]): Promise<void>
  play(s: Syllable, when?: number): number
}

export function createAudioEngine(
  ctx: BaseAudioContext,
  opts: { lruMax?: number } = {},
): AudioEngine {
  const base = import.meta.env.BASE_URL
  const lruMax = opts.lruMax ?? LRU_MAX
  const buffers = new Map<Syllable, AudioBuffer>()
  const inflight = new Map<Syllable, Promise<AudioBuffer | null>>()
  let available: Set<Syllable> | null = null

  function touch(s: Syllable, b: AudioBuffer) {
    buffers.delete(s)
    buffers.set(s, b)
    while (buffers.size > lruMax) buffers.delete(buffers.keys().next().value as Syllable)
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
      if (cached) {
        touch(s, cached) // refresh recency on a cache hit, not just on decode
        return Promise.resolve(cached)
      }
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
      touch(s, b) // playing counts as a use for recency purposes
      const src = (ctx as AudioContext).createBufferSource()
      src.buffer = b
      src.connect(ctx.destination)
      src.start(when ?? ctx.currentTime)
      return b.duration
    },
  }
}
