import type { SongCandidate } from '../types'
import { guessLang } from './genre'

// No API key, origin-reflected CORS. Undocumented SLA and roughly 20 req/min,
// so callers must debounce.
//
// `country` is REQUIRED, never defaulted. Apple's default is the US store,
// which returns English-TRANSLATED metadata for Chinese songs (晴天 comes back
// as "Sunny Day — Jay Chou"), and that degrades the downstream LRCLIB lookup
// badly: measured 4 hits for "Sunny Day / Jay Chou" against 20 for
// "晴天 / 周杰倫". Making the parameter mandatory means no call site can
// silently reintroduce that default.
export async function searchItunes(term: string, country: string): Promise<SongCandidate[]> {
  const url =
    `https://itunes.apple.com/search?media=music&limit=25&country=${encodeURIComponent(country)}` +
    `&term=${encodeURIComponent(term)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`itunes -> HTTP ${res.status}`)
  const data = await res.json()
  return (data.results ?? []).map((r: Record<string, unknown>) => {
    const genre = r.primaryGenreName ? String(r.primaryGenreName) : undefined
    return {
      title: String(r.trackName ?? ''),
      artist: String(r.artistName ?? ''),
      album: r.collectionName ? String(r.collectionName) : undefined,
      durationSec: r.trackTimeMillis ? Math.round(Number(r.trackTimeMillis) / 1000) : undefined,
      genre,
      langGuess: guessLang(genre),
    }
  })
}
