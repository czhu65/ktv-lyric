import type { Syllable } from '../types'

const LRU_MAX = 600 // ~600 clips of ~0.4s ≈ 10 MB decoded. A single sprite
                    // would be ~137 MB resident, which iOS Safari will kill.

export interface AudioEngine {
  unlock(): Promise<void>
  /**
   * Fetches the syllable manifest only -- no `AudioContext.resume()`, so
   * this is safe to call before any user gesture (e.g. at mount) to let
   * `has()` settle to real answers before the first tap or play. `unlock()`
   * also does this as part of unlocking, so calling both is harmless: the
   * fetch is shared/memoised either way.
   */
  preloadManifest(): Promise<void>
  /**
   * True once the manifest lists this syllable, OR the manifest has not
   * resolved yet. Unknown is treated as available, not absent -- rendering
   * before the manifest loads must not mark every character "no audio";
   * see Finding 2. Once the manifest arrives, this reflects real membership.
   */
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
  /**
   * Schedules already-loaded syllables back-to-back, in order, using the
   * context's own clock (not wall-clock `await`s) so consecutive syllables
   * never overlap. A syllable with no decoded buffer is skipped without
   * throwing -- the rest of the sequence still plays in order. Load the
   * syllables first (e.g. via `prefetch`); this does not load anything.
   */
  playSequence(ss: Syllable[]): void
}

export function createAudioEngine(
  ctx: BaseAudioContext,
  opts: { lruMax?: number } = {},
): AudioEngine {
  const base = import.meta.env.BASE_URL
  const lruMax = opts.lruMax ?? LRU_MAX
  const buffers = new Map<Syllable, AudioBuffer>()
  const inflight = new Map<Syllable, Promise<AudioBuffer | null>>()
  // null = "not yet known" (manifest hasn't loaded). Deliberately distinct
  // from an empty Set, which would mean "known, and nothing is available".
  let available: Set<Syllable> | null = null
  let manifestPromise: Promise<void> | null = null

  function touch(s: Syllable, b: AudioBuffer) {
    buffers.delete(s)
    buffers.set(s, b)
    while (buffers.size > lruMax) buffers.delete(buffers.keys().next().value as Syllable)
  }

  // Shared/memoised across concurrent callers, and NOT memoised on failure
  // (mirrors src/dict/index.ts) so a transient network blip doesn't
  // permanently strand has()/duration() on "assume everything is available".
  function loadManifest(): Promise<void> {
    manifestPromise ??= fetch(`${base}data/syllables.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`syllables.json -> HTTP ${r.status}`)
        return r.json() as Promise<Syllable[]>
      })
      .then((list) => { available = new Set(list) })
      .catch((err) => {
        manifestPromise = null
        throw err
      })
    return manifestPromise
  }

  return {
    async unlock() {
      // AudioContext starts suspended on Chrome DESKTOP too, not just mobile.
      const c = ctx as unknown as AudioContext
      if (c.state === 'suspended' && typeof c.resume === 'function') await c.resume()
      await loadManifest()
    },

    preloadManifest: loadManifest,

    // Unknown (manifest not yet loaded) reads as available, not absent --
    // see the `has` doc comment on the AudioEngine interface above.
    has: (s) => available === null || available.has(s),

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

    playSequence(ss) {
      let when = ctx.currentTime
      for (const s of ss) {
        const b = buffers.get(s)
        if (!b) continue // no audio for this syllable -- skip, don't throw, don't advance the clock
        touch(s, b)
        const src = (ctx as AudioContext).createBufferSource()
        src.buffer = b
        src.connect(ctx.destination)
        src.start(when)
        when += b.duration
      }
    },
  }
}
