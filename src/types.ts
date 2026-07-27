export type Syllable = string // e.g. "ngo5" — both the audio key and the romanization key

/** The two supported reading systems. Defined here rather than in
 *  src/lang/types.ts so the shared types module has no dependency on the
 *  language packs; src/lang/types.ts re-exports it. */
export type LangId = 'yue' | 'cmn'

export interface Char {
  char: string
  syllables: Syllable[] // [] for punctuation/Latin. MAY have length > 1.
}

export interface Token {
  chars: Char[]
  gloss?: string
}

export interface Line {
  tokens: Token[]
  timeMs?: number
}

export interface Song {
  title: string
  artist: string
  lines: Line[]
  source: 'lrclib' | 'pasted'
  lrclibId?: number
}

export interface SongCandidate {
  title: string
  artist: string
  album?: string
  durationSec?: number
}
