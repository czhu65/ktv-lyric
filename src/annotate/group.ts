import type { Char, Token } from '../types'
import type { SegmentOptions } from './index'

/**
 * Greedy longest-match grouping of already-annotated characters into tokens,
 * using the gloss dictionary's keys as the word list.
 *
 * Shared by both language packs deliberately: this step depends only on the
 * Char[] shape, never on which engine produced the readings. Grouping is
 * computed separately from the reading engines' own internal segmentation, so
 * a divergence is cosmetic and can never produce a wrong pronunciation.
 */
export function groupTokens(chars: Char[], opts: SegmentOptions): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < chars.length) {
    let len = 1
    for (let n = Math.min(opts.maxWordLength, chars.length - i); n >= 2; n--) {
      const candidate = chars.slice(i, i + n).map((c) => c.char).join('')
      if (opts.words.has(candidate)) {
        len = n
        break
      }
    }
    tokens.push({ chars: chars.slice(i, i + len) })
    i += len
  }
  return tokens
}
