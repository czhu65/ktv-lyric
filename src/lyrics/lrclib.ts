import type { SongCandidate } from '../types'

const BASE = 'https://lrclib.net/api'

// `User-Agent` is a forbidden header in browsers. LRCLIB's CORS preflight
// explicitly allows `Lrclib-Client`, which is the only way to comply.
const HEADERS = { 'Lrclib-Client': 'ktv-lyric/0.1 (https://github.com/czhu65/ktv-lyric)' }

export class RateLimitError extends Error {
  constructor(readonly retryAfterSec: number) {
    super(`LRCLIB rate limited; retry in ${retryAfterSec}s`)
    this.name = 'RateLimitError'
  }
}

function guard(res: Response) {
  if (res.status === 429) {
    throw new RateLimitError(Number(res.headers.get('Retry-After') ?? 30))
  }
}

export interface LrclibRecord {
  id?: number
  syncedLyrics?: string | null
  plainLyrics?: string | null
}

export async function lrclibGet(c: SongCandidate): Promise<LrclibRecord | null> {
  const p = new URLSearchParams({ track_name: c.title, artist_name: c.artist })
  if (c.album) p.set('album_name', c.album)
  if (c.durationSec) p.set('duration', String(c.durationSec))

  const res = await fetch(`${BASE}/get?${p}`, { headers: HEADERS })
  guard(res)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`lrclib get -> HTTP ${res.status}`)
  return res.json()
}

export async function lrclibSearch(q: string): Promise<SongCandidate[]> {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`, { headers: HEADERS })
  guard(res)
  if (!res.ok) throw new Error(`lrclib search -> HTTP ${res.status}`)
  const rows = await res.json()
  return (rows ?? []).map((r: Record<string, unknown>) => ({
    title: String(r.trackName ?? ''),
    artist: String(r.artistName ?? ''),
    album: r.albumName ? String(r.albumName) : undefined,
    durationSec: r.duration ? Math.round(Number(r.duration)) : undefined,
  }))
}
