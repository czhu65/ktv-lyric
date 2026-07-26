import { scriptVariants } from '../script'
import { searchItunes } from './itunes'
import { lrclibGet, lrclibSearch, RateLimitError } from '../lyrics/lrclib'
import { parseLyricText, type SourceLine } from '../lyrics/parse'
import type { SongCandidate } from '../types'

export { RateLimitError }

const key = (c: SongCandidate) => `${c.title}${c.artist}`.toLowerCase()

/**
 * LRCLIB and iTunes both do zero query-time script folding, so a Simplified
 * query and its Traditional equivalent return disjoint result sets. Always
 * issue both variants and merge.
 */
export async function searchSongs(query: string): Promise<SongCandidate[]> {
  const variants = await scriptVariants(query)

  const batches = await Promise.all(
    variants.map(async (v) => {
      try {
        return await searchItunes(v)
      } catch {
        try {
          return await lrclibSearch(v) // tier-1 fallback
        } catch {
          return []
        }
      }
    }),
  )

  const merged = new Map<string, SongCandidate>()
  for (const c of batches.flat()) {
    if (c.title && !merged.has(key(c))) merged.set(key(c), c)
  }
  return [...merged.values()]
}

export async function fetchLyrics(c: SongCandidate): Promise<SourceLine[] | null> {
  const rec = await lrclibGet(c)
  const body = rec?.syncedLyrics || rec?.plainLyrics
  if (!body) return null
  return parseLyricText(body)
}
