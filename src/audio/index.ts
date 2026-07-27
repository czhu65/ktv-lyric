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
  opts: {
    dir?: string
    manifest?: string
    lruMax?: number
    /** Injectable so tests never touch the real `navigator`/`Audio` globals
     *  -- see ios-unlock.ts. Omitted entirely by every existing call site
     *  and test; App.tsx is the one real caller that supplies it. */
    unlockIosAudioSession?: () => void
  } = {},
): AudioEngine {
  const base = import.meta.env.BASE_URL
  const lruMax = opts.lruMax ?? LRU_MAX
  // Defaulted to the Cantonese bank so every existing call site -- and every
  // existing test -- keeps working without opting in. The Mandarin pack
  // supplies its own pair via LanguagePack.audioDir / .manifest.
  const dir = opts.dir ?? 'audio/syl'
  const manifest = opts.manifest ?? 'data/syllables.json'
  const buffers = new Map<Syllable, AudioBuffer>()
  const inflight = new Map<Syllable, Promise<AudioBuffer | null>>()
  // null = "not yet known" (manifest hasn't loaded). Deliberately distinct
  // from an empty Set, which would mean "known, and nothing is available".
  let available: Set<Syllable> | null = null
  let manifestPromise: Promise<void> | null = null
  // Runs the iOS mute-switch mitigation exactly once per engine instance --
  // see ios-unlock.ts. Once per instance, not once globally, matches how
  // App.tsx already treats a language switch: it builds a fresh engine, and
  // the fresh engine's first tap re-primes the audio session, which is
  // cheap and harmless to repeat.
  let iosAudioUnlocked = false

  function touch(s: Syllable, b: AudioBuffer) {
    buffers.delete(s)
    buffers.set(s, b)
    while (buffers.size > lruMax) buffers.delete(buffers.keys().next().value as Syllable)
  }

  // Shared/memoised across concurrent callers, and NOT memoised on failure
  // (mirrors src/dict/index.ts) so a transient network blip doesn't
  // permanently strand has()/duration() on "assume everything is available".
  //
  // A 404 is treated as "this bank does not exist" rather than "the network
  // failed" -- e.g. the Mandarin pack before its audio bank has been built
  // (see Task 16's amendment). That resolves successfully with an EMPTY
  // Set, not null: has() must settle to false for every syllable so every
  // character renders the existing per-character "no audio" marker, rather
  // than silently treating the missing bank as "unknown -> available" or
  // surfacing the generic network-failure notice for something that isn't
  // broken. Any other failure (500, network error, ...) still rejects and
  // is NOT memoised, so a retry is possible.
  function loadManifest(): Promise<void> {
    manifestPromise ??= fetch(`${base}${manifest}`)
      .then((r) => {
        if (r.status === 404) return []
        if (!r.ok) throw new Error(`${manifest} -> HTTP ${r.status}`)
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
      // Runs inside the same gesture-triggered call as resume() above, which
      // is what the mitigation requires -- see ios-unlock.ts. resume()
      // fixes "the context won't start"; this fixes the separate, iOS-only
      // "the context runs but the OS mutes it" failure -- one does not
      // substitute for the other.
      if (!iosAudioUnlocked) {
        iosAudioUnlocked = true
        opts.unlockIosAudioSession?.()
      }
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
        p = fetch(`${base}${dir}/${s}.mp3`)
          .then((r) => {
            if (r.ok) return r.arrayBuffer()
            // has() already said this syllable IS in the manifest, so a
            // non-ok response here is unexpected -- logged, not silent,
            // since it would otherwise look identical to a syllable that
            // was simply never recorded (see the swallowed-error comment
            // below for why that distinction matters).
            console.error(`audio: ${dir}/${s}.mp3 -> HTTP ${r.status}`)
            return null
          })
          // decodeAudioData sniffs bytes and ignores Content-Type, which makes
          // GitHub Pages' odd `audio/mp3` MIME mapping a non-issue.
          .then((ab) => (ab ? ctx.decodeAudioData(ab) : null))
          .then((b) => {
            if (b) touch(s, b)
            return b
          })
          .catch((err: unknown) => {
            // Logged, not swallowed. The known real-world case: iOS Safari's
            // decodeAudioData can reject with "EncodingError: Decoding
            // failed" on some MP3s (a still-open WebKit issue) even though
            // the identical file decodes fine on Chrome/Android -- see
            // ios-unlock.ts for the OTHER iOS-only audio failure mode this
            // can be confused with. Resolving to null either way keeps the
            // existing graceful "no audio" marker; this only makes the
            // failure visible to whoever has the console open (e.g. via
            // Safari's remote Web Inspector).
            console.error(`audio: failed to load ${dir}/${s}.mp3`, err)
            return null
          })
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
