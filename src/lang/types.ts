import type { SegmentOptions } from '../annotate'
import type { LangId, Syllable, Token } from '../types'

// LangId is DEFINED in src/types.ts, not here, and re-exported for
// convenience. Defining it here instead would make src/types.ts import from
// src/lang/types.ts while this file imports Token back from src/types.ts --
// a circular import. It would survive compilation (both sides are type-only
// and therefore erased) but it is a trap for the first person to add a
// runtime value to either file.
export type { LangId }

export interface RomanizationStyle {
  /** Persisted in Settings, so it must stay stable across releases. */
  id: string
  label: string
  render(syllable: Syllable): string
}

/**
 * Everything that differs between the two languages, in one object.
 *
 * The point of this boundary: LyricView, LyricLine, Transport and player/
 * depend ONLY on this interface and never learn which language they are
 * rendering. The per-song language toggle is therefore a swap of this object,
 * not a conditional threaded through five modules.
 *
 * Both languages happen to share some syllable spellings (`sin1` is valid
 * Jyutping AND valid pinyin), but they can never collide because each pack
 * carries its own audioDir and manifest.
 */
export interface LanguagePack {
  id: LangId
  /** Shown on the toggle: 粵語 / 普通話 */
  label: string
  /**
   * Annotate ONE WHOLE UNBROKEN SOURCE LINE. Never call with a wrapped
   * display fragment -- both engines are greedy longest-match, so a break
   * inside a word silently changes the reading.
   */
  annotate(line: string, opts: SegmentOptions): Token[]
  /** First entry is the default for a user who has never chosen. */
  romanizations: RomanizationStyle[]
  /** Relative to BASE_URL, no trailing slash. */
  audioDir: string
  /** Relative to BASE_URL. */
  manifest: string
}
