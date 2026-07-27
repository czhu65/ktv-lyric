import { scriptVariants, toSimplified } from '../script'
import { searchItunes } from './itunes'
import { lrclibGet, lrclibSearch, RateLimitError } from '../lyrics/lrclib'
import { parseLyricText, type SourceLine } from '../lyrics/parse'
import type { SongCandidate } from '../types'

export { RateLimitError }

const SEP = '\u0000' // cannot occur in either field, so unlike a bare
// concatenation (title:'A' artist:'BC' vs title:'AB' artist:'C') the two
// fields can never collide across the boundary. Fold both fields to
// Simplified first so the same track returned by the Traditional and
// Simplified query variants (e.g. artist 陳奕迅 vs 陈奕迅) keys identically
// and actually merges -- without folding, dedup would defeat the entire
// point of the dual-script fan-out below.
async function dedupeKey(c: SongCandidate): Promise<string> {
  const [title, artist] = await Promise.all([toSimplified(c.title), toSimplified(c.artist)])
  return `${title}${SEP}${artist}`.toLowerCase()
}

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
      } catch (err) {
        // Defensive: searchItunes never actually throws RateLimitError today
        // (it only talks to iTunes, never LRCLIB), but if that ever changes,
        // a rate limit must still surface rather than be treated as "iTunes
        // is down, fall back to LRCLIB".
        if (err instanceof RateLimitError) throw err
        try {
          return await lrclibSearch(v) // tier-1 fallback
        } catch (fallbackErr) {
          // A 429 here is not an ordinary "this variant failed" -- there is
          // no server-side fallback beyond LRCLIB, so a rate limit must
          // reach the UI (which can tell the user to retry in N seconds)
          // instead of being swallowed into an empty, look-alike "no
          // results" response.
          if (fallbackErr instanceof RateLimitError) throw fallbackErr
          return []
        }
      }
    }),
  )

  const flat = batches.flat().filter((c) => c.title)
  const keyed = await Promise.all(flat.map(async (c) => [await dedupeKey(c), c] as const))

  const merged = new Map<string, SongCandidate>()
  for (const [k, c] of keyed) {
    if (!merged.has(k)) merged.set(k, c)
  }
  return [...merged.values()]
}

export interface LyricsResult {
  raw: SourceLine[]
  /** LRCLIB's own record id. Undefined for a hit whose record omits it
   *  (shouldn't happen in practice, but the field is optional on
   *  LrclibRecord) -- callers that want to cache the result must check it. */
  lrclibId?: number
}

export async function fetchLyrics(c: SongCandidate): Promise<LyricsResult | null> {
  const rec = await lrclibGet(c)
  const body = rec?.syncedLyrics || rec?.plainLyrics
  if (!body) return null
  return { raw: parseLyricText(body), lrclibId: rec?.id }
}
