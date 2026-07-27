import type { AudioEngine } from '../audio'
import type { Line, Syllable } from '../types'

const IN_LINE_GAP = 0.12 // seconds between syllables within a line
const FALLBACK_CLIP_SEC = 0.4 // only used if a clip failed to load
const LOOKAHEAD_SEC = 0.1
const TICK_MS = 25

export interface PlayerState {
  playing: boolean
  lineIndex: number
  charIndex: number
  /** Set when the most recent start() attempt (unlock/prefetch) failed;
   *  cleared to null on the next attempt that gets past unlock+prefetch. */
  error: string | null
}

export interface PlayerDeps {
  engine: AudioEngine
  now(): number
  /** MUST be setTimeout, never setInterval. */
  schedule(fn: () => void, ms: number): void
}

export interface Player {
  /** `lineIndex` is the line's position within the full lyric, NOT always 0
   *  -- it becomes the emitted PlayerState.lineIndex, which is what the UI
   *  uses to decide which line to highlight. */
  playLine(line: Line, lineIndex: number): void
  playAll(lines: Line[]): void
  stop(): void
  setInterLineGap(sec: number): void
  subscribe(fn: (s: PlayerState) => void): () => void
}

interface Event { syllable: Syllable; at: number; lineIndex: number; charIndex: number }

export function createPlayer({ engine, now, schedule }: PlayerDeps): Player {
  let interLineGap = 1.0
  let events: Event[] = []
  let cursor = 0
  let generation = 0
  let state: PlayerState = { playing: false, lineIndex: -1, charIndex: -1, error: null }
  const subs = new Set<(s: PlayerState) => void>()

  const emit = (patch: Partial<PlayerState>) => {
    state = { ...state, ...patch }
    for (const f of subs) f(state)
  }

  // Called only AFTER prefetch, so every clip length is already known and the
  // timeline is exact. No drift correction needed at dispatch time.
  function build(lines: Line[], startLine: number): Event[] {
    const out: Event[] = []
    let t = now() + LOOKAHEAD_SEC
    lines.forEach((line, li) => {
      let charIndex = 0
      for (const token of line.tokens) {
        for (const ch of token.chars) {
          for (const syl of ch.syllables) {
            out.push({ syllable: syl, at: t, lineIndex: startLine + li, charIndex })
            t += (engine.duration(syl) || FALLBACK_CLIP_SEC) + IN_LINE_GAP
          }
          charIndex++
        }
      }
      t += interLineGap - IN_LINE_GAP
    })
    return out
  }

  function pump(gen: number) {
    if (gen !== generation) return
    // Lookahead exists to absorb main-thread jitter from GC and layout — not
    // because of background-tab throttling, which is waived for pages holding
    // an active AudioContext.
    const horizon = now() + LOOKAHEAD_SEC
    while (cursor < events.length && events[cursor].at <= horizon) {
      const e = events[cursor]
      engine.play(e.syllable, e.at)
      emit({ lineIndex: e.lineIndex, charIndex: e.charIndex })
      cursor++
    }
    if (cursor >= events.length) {
      emit({ playing: false })
      return
    }
    schedule(() => pump(gen), TICK_MS)
  }

  async function start(lines: Line[], startLine: number) {
    generation++
    const gen = generation
    try {
      await engine.unlock()
      await engine.prefetch(
        lines.flatMap((l) => l.tokens.flatMap((t) => t.chars.flatMap((c) => c.syllables))),
      )
    } catch (err) {
      // A failed manifest/clip fetch must not leave `playing` stuck true
      // from some earlier, still-displayed playback, and must not vanish
      // silently -- surface it on state for the UI to turn into a notice.
      if (gen !== generation) return // superseded by a newer start() already
      emit({ playing: false, error: err instanceof Error ? err.message : 'Playback failed' })
      return
    }
    if (gen !== generation) return
    events = build(lines, startLine)
    cursor = 0
    emit({ playing: true, error: null })
    pump(gen)
  }

  // .catch() here is the safety net that keeps a rejection from ever
  // escaping start() as an unhandled promise rejection -- start()'s own
  // try/catch already handles the expected unlock/prefetch failures above;
  // this only matters for a genuinely unexpected throw (e.g. inside build()
  // or pump()).
  const startSafe = (lines: Line[], startLine: number) => {
    start(lines, startLine).catch((err: unknown) => {
      emit({ playing: false, error: err instanceof Error ? err.message : 'Playback failed' })
    })
  }

  return {
    playLine: (line, lineIndex) => startSafe([line], lineIndex),
    playAll: (lines) => startSafe(lines, 0),
    stop() {
      generation++
      events = []
      cursor = 0
      emit({ playing: false, lineIndex: -1, charIndex: -1 })
    },
    setInterLineGap: (sec) => { interLineGap = sec },
    subscribe(fn) {
      subs.add(fn)
      fn(state)
      return () => subs.delete(fn)
    },
  }
}
