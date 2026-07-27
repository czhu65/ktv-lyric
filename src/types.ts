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

// `Song` -- an annotated lyric bundled with its title/artist/source -- used
// to live here. It is deliberately gone rather than gaining a `lang` field.
// Nothing constructs one any more: the IndexedDB cache stores raw,
// language-independent lines (`CachedLyric` in storage/index.ts) because
// annotation depends on the active language pack, and App holds the
// annotated lines together with the pack that produced them. A `Song` would
// now be a third representation of the same lyric with no owner and no way
// to stay honest about which language it had been annotated in.

export interface SongCandidate {
  title: string
  artist: string
  album?: string
  durationSec?: number
  /** iTunes primaryGenreName, verbatim and localized. Kept so the guess can
   *  be re-derived or debugged without another network call. */
  genre?: string
  /** Seeds the language toggle. Undefined when the genre is uninformative. */
  langGuess?: LangId
}
