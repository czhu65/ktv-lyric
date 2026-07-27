import type { SongCandidate } from '../types'

// No API key, origin-reflected CORS. Undocumented SLA and roughly 20 req/min,
// so callers must debounce. Apple can change this legacy endpoint without notice.
export async function searchItunes(term: string): Promise<SongCandidate[]> {
  const url =
    `https://itunes.apple.com/search?media=music&limit=25&term=${encodeURIComponent(term)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`itunes -> HTTP ${res.status}`)
  const data = await res.json()
  return (data.results ?? []).map((r: Record<string, unknown>) => ({
    title: String(r.trackName ?? ''),
    artist: String(r.artistName ?? ''),
    album: r.collectionName ? String(r.collectionName) : undefined,
    durationSec: r.trackTimeMillis ? Math.round(Number(r.trackTimeMillis) / 1000) : undefined,
  }))
}
