import { describe, it, expect, vi } from 'vitest'
import { createPlayer } from './index'
import type { Line } from '../types'

const line = (...groups: string[][]): Line => ({
  tokens: groups.map((g) => ({ chars: g.map((s) => ({ char: 'x', syllables: [s] })) })),
})

function harness() {
  let now = 0
  const played: { s: string; when: number }[] = []
  const queue: { fn: () => void; at: number }[] = []

  const engine = {
    unlock: vi.fn(async () => {}),
    preloadManifest: vi.fn(async () => {}),
    has: () => true,
    duration: () => 0.4,
    load: vi.fn(async () => ({ duration: 0.4 }) as AudioBuffer),
    prefetch: vi.fn(async () => {}),
    play: (s: string, when = 0) => { played.push({ s, when }); return 0.4 },
    playSequence: vi.fn(),
  }

  const player = createPlayer({
    engine,
    now: () => now,
    schedule: (fn, ms) => { queue.push({ fn, at: now + ms / 1000 }) },
  })

  const advance = (sec: number) => {
    now += sec
    for (const t of queue.splice(0).sort((a, b) => a.at - b.at)) {
      if (t.at <= now) t.fn()
      else queue.push(t)
    }
  }

  return { player, played, advance }
}

// start() awaits unlock() then prefetch(), so a single `await flush()`
// does NOT reliably get past both. Drain the whole microtask queue instead.
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('player', () => {
  it('schedules every syllable of a line in order', async () => {
    const { player, played, advance } = harness()
    player.playLine(line(['ngo5'], ['dei6']), 0)
    await flush()
    advance(1)
    expect(played.map((p) => p.s)).toEqual(['ngo5', 'dei6'])
  })

  it('spaces syllables by clip duration plus the in-line gap', async () => {
    const { player, played, advance } = harness()
    player.playLine(line(['ngo5'], ['dei6']), 0)
    await flush()
    advance(1)
    expect(played[1].when - played[0].when).toBeCloseTo(0.4 + 0.12, 5)
  })

  it('applies the configured inter-line gap between lines', async () => {
    const { player, played, advance } = harness()
    player.setInterLineGap(1.0)
    player.playAll([line(['ngo5']), line(['dei6'])])
    await flush()
    advance(5)
    expect(played[1].when - played[0].when).toBeCloseTo(0.4 + 1.0, 5)
  })

  it('plays every syllable of a multi-syllable character', async () => {
    const { player, played, advance } = harness()
    player.playLine({ tokens: [{ chars: [{ char: '瓩', syllables: ['cin1', 'ngaa5'] }] }] }, 0)
    await flush()
    advance(1)
    expect(played.map((p) => p.s)).toEqual(['cin1', 'ngaa5'])
  })

  it('skips characters with no syllables', async () => {
    const { player, played, advance } = harness()
    player.playLine({
      tokens: [{ chars: [{ char: '唱', syllables: ['coeng3'] }, { char: '，', syllables: [] }] }],
    }, 0)
    await flush()
    advance(1)
    expect(played).toHaveLength(1)
  })

  it('stop() halts further scheduling and reports not playing', async () => {
    const { player, played, advance } = harness()
    player.playAll([line(['a1']), line(['b1']), line(['c1'])])
    await flush()
    player.stop()
    advance(10)
    expect(played.length).toBeLessThan(3)
    let state = { playing: true } as { playing: boolean }
    player.subscribe((s) => { state = s })
    expect(state.playing).toBe(false)
  })

  it('notifies subscribers of the current line index', async () => {
    const { player, advance } = harness()
    const seen: number[] = []
    player.subscribe((s) => seen.push(s.lineIndex))
    player.playAll([line(['a1']), line(['b1'])])
    await flush()
    advance(5)
    expect(seen).toContain(1)
  })

  // --- Finding 1: playLine must thread the line's real index through, not
  // hardcode 0 -- otherwise playing line 3's audio highlights line 1. ---

  it('playLine at a nonzero index emits that same index, not 0', async () => {
    const { player, advance } = harness()
    const seen: number[] = []
    player.subscribe((s) => seen.push(s.lineIndex))
    player.playLine(line(['ngo5']), 2)
    await flush()
    advance(1)
    expect(seen).toContain(2)
    expect(seen).not.toContain(0)
  })

  it('a multi-line lyric where playing line 3 (index 2) emits lineIndex 2 for every syllable in it', async () => {
    const { player, advance } = harness()
    const seen: number[] = []
    player.subscribe((s) => seen.push(s.lineIndex))
    player.playLine(line(['ngo5'], ['dei6']), 2)
    await flush()
    advance(1)
    // Every update once playback has actually started belongs to index 2 --
    // never 0, which is what the hardcoded-startLine bug produced. (The
    // final entry is the "done playing" emit, which doesn't touch
    // lineIndex, so it reports whatever index was last set -- still 2.)
    expect(seen.filter((i) => i >= 0).every((i) => i === 2)).toBe(true)
    expect(seen).toContain(2)
  })
})

describe('player edge cases', () => {
  it('a line of only punctuation (no syllables) does not hang and reports not-playing', async () => {
    const { player, played, advance } = harness()
    let state = { playing: true } as { playing: boolean }
    player.subscribe((s) => { state = s })
    player.playLine({ tokens: [{ chars: [{ char: '，', syllables: [] }] }] }, 0)
    await flush()
    advance(1)
    expect(played).toHaveLength(0)
    expect(state.playing).toBe(false)
  })

  it('an empty lines array passed to playAll does not throw and reports not-playing', async () => {
    const { player, played, advance } = harness()
    let state = { playing: true } as { playing: boolean }
    player.subscribe((s) => { state = s })
    // playAll returns void and any failure would surface as a rejection, not
    // a synchronous throw -- `expect(() => ...).not.toThrow()` on it could
    // never fail regardless of behaviour, so the real assertions below (on
    // `played` and `state.playing`) are what actually exercise this case.
    player.playAll([])
    await flush()
    advance(1)
    expect(played).toHaveLength(0)
    expect(state.playing).toBe(false)
  })

  it('calling playAll again while already running abandons the first playback', async () => {
    const { player, played, advance } = harness()
    // Both calls fire before either async start() resolves, so this exercises
    // the generation-counter race, not just a stop-then-restart.
    player.playAll([line(['a1']), line(['a2'])])
    player.playAll([line(['b1']), line(['b2'])])
    await flush()
    advance(5)
    expect(played.map((p) => p.s)).toEqual(['b1', 'b2'])
  })

  it('calling playAll again after the first has started playing drops the rest of the first', async () => {
    const { player, played, advance } = harness()
    player.playAll([line(['a1']), line(['a2']), line(['a3'])])
    await flush()
    advance(0.1) // let the first syllable of the first playback fire
    player.playAll([line(['b1'])])
    await flush()
    advance(5)
    expect(played.map((p) => p.s)).toEqual(['a1', 'b1'])
  })

  it('stop() before playback has started still notifies subscribers, and does not throw', async () => {
    const { player } = harness()
    const seen: boolean[] = []
    // Subscribed BEFORE stop() -- unlike the old version of this test, which
    // subscribed AFTER, so its assertion passed off of the constructor's
    // default state and would have passed even if stop() were a no-op.
    player.subscribe((s) => seen.push(s.playing))
    expect(() => player.stop()).not.toThrow()
    // subscribe() itself fires once immediately with the state at
    // subscription time (false); a real stop()-triggered emit shows up as a
    // SECOND entry. A no-op stop() would leave `seen` at length 1.
    expect(seen).toEqual([false, false])
  })

  it('a missing-audio syllable in the middle of a line is skipped but later syllables keep their scheduled offsets', async () => {
    const now = { t: 0 }
    const played: { s: string; when: number }[] = []
    const queue: { fn: () => void; at: number }[] = []
    // engine.play mimics the real AudioEngine: returns 0 and plays nothing
    // when the clip never loaded, without throwing.
    const engine = {
      unlock: vi.fn(async () => {}),
      preloadManifest: vi.fn(async () => {}),
      has: (s: string) => s !== 'm4',
      duration: (s: string) => (s === 'm4' ? 0 : 0.4),
      load: vi.fn(async () => ({ duration: 0.4 }) as AudioBuffer),
      prefetch: vi.fn(async () => {}),
      play: (s: string, when = 0) => {
        if (s === 'm4') return 0
        played.push({ s, when })
        return 0.4
      },
      playSequence: vi.fn(),
    }
    const player = createPlayer({
      engine,
      now: () => now.t,
      schedule: (fn, ms) => { queue.push({ fn, at: now.t + ms / 1000 }) },
    })
    const advance = (sec: number) => {
      now.t += sec
      for (const t of queue.splice(0).sort((a, b) => a.at - b.at)) {
        if (t.at <= now.t) t.fn()
        else queue.push(t)
      }
    }

    player.playLine(line(['a1'], ['m4'], ['b1']), 0)
    await flush()
    expect(() => advance(2)).not.toThrow()
    expect(played.map((p) => p.s)).toEqual(['a1', 'b1'])
    // b1's offset must account for m4's fallback-duration slot even though
    // m4 never actually sounded — the timeline is fixed up front.
    expect(played[1].when - played[0].when).toBeCloseTo(2 * (0.4 + 0.12), 5)
  })

  // --- Finding 3: a failed unlock()/prefetch() must not vanish silently,
  // must not leave `playing` stuck true, and must never escape start() as
  // an unhandled promise rejection. ---

  describe('a failing engine.unlock()', () => {
    function failingHarness() {
      let now = 0
      const queue: { fn: () => void; at: number }[] = []
      const engine = {
        unlock: vi.fn(async () => { throw new Error('syllables.json -> HTTP 404') }),
        preloadManifest: vi.fn(async () => {}),
        has: () => true,
        duration: () => 0.4,
        load: vi.fn(async () => ({ duration: 0.4 }) as AudioBuffer),
        prefetch: vi.fn(async () => {}),
        play: () => 0.4,
        playSequence: vi.fn(),
      }
      const player = createPlayer({
        engine,
        now: () => now,
        schedule: (fn, ms) => { queue.push({ fn, at: now + ms / 1000 }) },
      })
      const advance = (sec: number) => {
        now += sec
        for (const t of queue.splice(0).sort((a, b) => a.at - b.at)) {
          if (t.at <= now) t.fn()
          else queue.push(t)
        }
      }
      return { player, advance }
    }

    it('surfaces the failure on state.error and leaves playing false, without throwing', async () => {
      const { player } = failingHarness()
      let state = { playing: true, error: null } as { playing: boolean; error: string | null }
      player.subscribe((s) => { state = s })

      player.playAll([line(['a1'])])
      await flush()

      expect(state.playing).toBe(false)
      expect(state.error).toBeTruthy()
    })

    it('does not produce an unhandled promise rejection', async () => {
      // @types/node isn't part of this project's tsconfig (browser app), so
      // `process` is reached through globalThis with a narrow local type
      // rather than pulling in Node's ambient types project-wide.
      const proc = (globalThis as unknown as {
        process: { on(event: string, cb: (reason: unknown) => void): void; off(event: string, cb: (reason: unknown) => void): void }
      }).process
      const seen: unknown[] = []
      const onUnhandled = (reason: unknown) => seen.push(reason)
      proc.on('unhandledRejection', onUnhandled)
      try {
        const { player } = failingHarness()
        player.playAll([line(['a1'])])
        await flush()
        await flush()
        expect(seen).toHaveLength(0)
      } finally {
        proc.off('unhandledRejection', onUnhandled)
      }
    })

    it('a subsequent successful play on the same player clears the error', async () => {
      let now = 0
      const queue: { fn: () => void; at: number }[] = []
      const played: string[] = []
      const engine = {
        // Fails on the first call, succeeds on every call after -- same
        // player instance, so this is a genuine retry, not a fresh one.
        unlock: vi.fn()
          .mockRejectedValueOnce(new Error('syllables.json -> HTTP 404'))
          .mockResolvedValue(undefined),
        preloadManifest: vi.fn(async () => {}),
        has: () => true,
        duration: () => 0.4,
        load: vi.fn(async () => ({ duration: 0.4 }) as AudioBuffer),
        prefetch: vi.fn(async () => {}),
        play: (s: string) => { played.push(s); return 0.4 },
        playSequence: vi.fn(),
      }
      const player = createPlayer({
        engine,
        now: () => now,
        schedule: (fn, ms) => { queue.push({ fn, at: now + ms / 1000 }) },
      })
      const advance = (sec: number) => {
        now += sec
        for (const t of queue.splice(0).sort((a, b) => a.at - b.at)) {
          if (t.at <= now) t.fn()
          else queue.push(t)
        }
      }
      let state = { playing: true, error: null } as { playing: boolean; error: string | null }
      player.subscribe((s) => { state = s })

      player.playLine(line(['a1']), 0)
      await flush()
      expect(state.error).toBeTruthy()
      expect(state.playing).toBe(false)

      player.playLine(line(['a1']), 0)
      await flush()
      advance(1)
      expect(state.error).toBeNull()
      expect(played).toEqual(['a1'])
    })
  })
})
