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
}

export interface PlayerDeps {
  engine: AudioEngine
  now(): number
  /** MUST be setTimeout, never setInterval. */
  schedule(fn: () => void, ms: number): void
}

export interface Player {
  playLine(line: Line): void
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
  let state: PlayerState = { playing: false, lineIndex: -1, charIndex: -1 }
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
    await engine.unlock()
    await engine.prefetch(
      lines.flatMap((l) => l.tokens.flatMap((t) => t.chars.flatMap((c) => c.syllables))),
    )
    if (gen !== generation) return
    events = build(lines, startLine)
    cursor = 0
    emit({ playing: true })
    pump(gen)
  }

  return {
    playLine: (line) => void start([line], 0),
    playAll: (lines) => void start(lines, 0),
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
