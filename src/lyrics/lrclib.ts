import { toSimplified, toTraditional } from '../script'
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

// Retry-After is RFC 7231 §7.1.3: either delta-seconds ("120") or an
// HTTP-date ("Fri, 31 Dec 1999 23:59:59 GMT"). `Number()` alone yields NaN
// for the date form, so a compliant-but-date-flavored server would blow up
// downstream retry-scheduling code. Try delta-seconds first, then an
// HTTP-date converted to seconds-from-now, and only fall back to a fixed
// default if neither produces a sane (finite, positive) value.
function parseRetryAfterSec(value: string | null): number {
  const FALLBACK_SEC = 30

  if (value) {
    const deltaSeconds = Number(value)
    if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) return deltaSeconds

    const dateMs = Date.parse(value)
    if (!Number.isNaN(dateMs)) {
      const secondsFromNow = Math.round((dateMs - Date.now()) / 1000)
      if (secondsFromNow > 0) return secondsFromNow
    }
  }

  return FALLBACK_SEC
}

function guard(res: Response) {
  if (res.status === 429) {
    throw new RateLimitError(parseRetryAfterSec(res.headers.get('Retry-After')))
  }
}

export interface LrclibRecord {
  id?: number
  syncedLyrics?: string | null
  plainLyrics?: string | null
}

// LRCLIB does ZERO script folding of its own: a Traditional query and its
// Simplified equivalent can be completely disjoint lookups, because the same
// song may be catalogued under either script depending on who submitted it.
// Measured 2026-07-27: "借過一下 / 陳小春" (exactly what the HK storefront
// hands back) 404s, while the identical song only exists on LRCLIB as
// "借过一下 / 陈小春" -- roughly 1 in 6 sampled songs were affected. Title and
// artist are converted TOGETHER, never independently: they come from the
// same storefront query, so they are always in the same script as each
// other, and a Traditional title paired with a Simplified artist would never
// match anything.
async function scriptVariantPairs(
  title: string,
  artist: string,
): Promise<{ title: string; artist: string }[]> {
  const [trad, simp] = await Promise.all([
    Promise.all([toTraditional(title), toTraditional(artist)]),
    Promise.all([toSimplified(title), toSimplified(artist)]),
  ])
  const pairs = [{ title, artist }]
  for (const [t, a] of [trad, simp]) {
    if (!pairs.some((p) => p.title === t && p.artist === a)) pairs.push({ title: t, artist: a })
  }
  return pairs
}

export async function lrclibGet(c: SongCandidate): Promise<LrclibRecord | null> {
  const variants = await scriptVariantPairs(c.title, c.artist)

  // Tier 1: exact match via /get, across every script variant.
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i]
    const p = new URLSearchParams({ track_name: v.title, artist_name: v.artist })
    // Only the ORIGINAL variant's album name is known to be in the right
    // script -- a converted-script album name isn't computed, and passing
    // the untranslated one would just make an already-uncertain match
    // stricter. Duration is script-invariant, so it stays on every attempt.
    if (i === 0 && c.album) p.set('album_name', c.album)
    if (c.durationSec) p.set('duration', String(c.durationSec))

    const res = await fetch(`${BASE}/get?${p}`, { headers: HEADERS })
    guard(res)
    if (res.status === 404) continue
    if (!res.ok) throw new Error(`lrclib get -> HTTP ${res.status}`)
    return res.json()
  }

  // Tier 2: /get's exact match also breaks on a suffix iTunes appends that
  // LRCLIB's own title omits (e.g. "(Live)") or on an album/duration
  // mismatch. /search tolerates both -- it fuzzy-matches on title/artist and
  // never considers album/duration -- but is ALSO script-exact (measured:
  // /search for "借過一下 / 陳小春" returns zero rows; the Simplified query
  // finds it), so it needs the same per-variant retry.
  for (const v of variants) {
    const p = new URLSearchParams({ track_name: v.title, artist_name: v.artist })
    const res = await fetch(`${BASE}/search?${p}`, { headers: HEADERS })
    guard(res)
    if (res.status === 404) continue
    if (!res.ok) throw new Error(`lrclib search -> HTTP ${res.status}`)
    const rows = ((await res.json()) ?? []) as LrclibRecord[]
    if (rows.length > 0) return rows[0]
  }

  return null
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
