// Imported from '../types', NOT from '../lang' -- importing the barrel would
// drag yuePack (and therefore to-jyutping) into the search module for the
// sake of one type.
import type { LangId } from '../types'

// Lyrics cannot reveal the language: Cantopop is written in 書面語 and is
// character-identical to Mandarin. Measured on four Cantopop songs -- ZERO
// Cantonese-specific characters (嘅 喺 唔 佢 咗 …) across 1,744 Han
// characters. So the guess has to come from metadata.
//
// Apple's primaryGenreName is the usable signal, and crucially it is
// PER-TRACK, which is what makes bilingual artists (陳奕迅, 鄧紫棋, 張學友)
// resolve correctly -- their Cantonese recordings come back 廣東歌 and their
// Mandarin ones 國語流行樂.
//
// The vocabulary is LOCALIZED PER STOREFRONT: HK and TW use different strings
// for the same concept, so both are listed. This is deliberately a data table
// and not logic -- adding a storefront later means extending the table only.
const GENRE_LANG: Record<string, LangId> = {
  // HK storefront
  '廣東歌/香港流行樂': 'yue',
  '國語流行樂': 'cmn',
  // TW storefront
  '粵語流行樂': 'yue',
  '華語流行樂': 'cmn',
  '華語音樂': 'cmn',
}

/**
 * Undefined means "this genre says nothing about language" -- 流行樂,
 * 世界音樂, 器樂 and friends. Returning undefined rather than defaulting here
 * keeps the fallback decision at the call site, where it belongs.
 */
export function guessLang(genre: string | undefined): LangId | undefined {
  if (!genre) return undefined
  return GENRE_LANG[genre.trim()]
}
