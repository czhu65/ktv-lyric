import ToJyutping from 'to-jyutping'
import type { Char, Token } from '../types'

export interface SegmentOptions {
  words: ReadonlySet<string>
  maxWordLength: number
}

/**
 * Annotate ONE WHOLE UNBROKEN SOURCE LINE.
 *
 * Never call this with a wrapped display fragment: to-jyutping's trie is a
 * greedy longest-match matcher, so a break inside a word silently changes the
 * reading (仙女 -> neoi2, but 仙 / 女 apart -> neoi5).
 *
 * Readings come from getJyutpingList over the full line. Grouping is computed
 * separately, because to-jyutping exposes no segmentation API. A divergence
 * between our grouping and the trie's internal matching is therefore cosmetic
 * — it can never produce a wrong pronunciation.
 */
export function annotateLine(line: string, opts: SegmentOptions): Token[] {
  const pairs = ToJyutping.getJyutpingList(line)

  const chars: Char[] = pairs.map(([char, jyutping]) => ({
    char,
    // A single character can carry more than one syllable (瓩 -> "cin1 ngaa5").
    syllables: jyutping ? jyutping.split(/\s+/).filter(Boolean) : [],
  }))

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
