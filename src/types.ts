export type Syllable = string // e.g. "ngo5" — both the audio key and the romanization key

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
