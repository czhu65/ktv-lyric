import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchSongs, fetchLyrics, RateLimitError } from './index'

const itunesRows = (rows: { title: string; artist: string }[]) =>
  new Response(
    JSON.stringify({
      resultCount: rows.length,
      results: rows.map((r) => ({
        trackName: r.title, artistName: r.artist, collectionName: 'Alb', trackTimeMillis: 240_000,
      })),
    }),
  )

describe('searchSongs', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('queries both script variants and merges results', async () => {
    // Distinct catalog entries per variant (not just a script-different
    // rendering of the same title/artist -- that case is covered by
    // "collapses candidates whose artist differs only by script" below,
    // where correctly folding scripts means they must NOT both survive).
    const f = vi.fn(async (url: string) =>
      url.includes(encodeURIComponent('浮夸'))
        ? itunesRows([{ title: 'Song One', artist: 'A' }])
        : itunesRows([{ title: 'Song Two', artist: 'B' }]))
    vi.stubGlobal('fetch', f)

    const r = await searchSongs('浮夸')
    expect(f).toHaveBeenCalledTimes(2)
    expect(r.map((x) => x.title).sort()).toEqual(['Song One', 'Song Two'])
  })

  it('dedupes identical title+artist across variants', async () => {
    // 唱歌 is unchanged by script conversion, so scriptVariants used to
    // return a single variant for it -- only one request ever fired, and
    // this test would still pass even with dedup completely broken.
    // 陈奕迅/陳奕迅 (Simplified/Traditional) genuinely differ, so this query
    // really does issue two requests and exercises the merge.
    const f = vi.fn(async () => itunesRows([{ title: 'Song', artist: 'A' }]))
    vi.stubGlobal('fetch', f)

    const r = await searchSongs('陈奕迅')
    expect(f).toHaveBeenCalledTimes(2)
    expect(r).toHaveLength(1)
  })

  it('collapses candidates whose artist differs only by script', async () => {
    // Same artist, same title, but one variant's iTunes response spells the
    // artist in Simplified and the other in Traditional -- exactly what the
    // dual-script fan-out produces for a real track. The dedupe key must
    // fold script before comparing, or this counts as two different songs
    // and defeats the entire point of merging the two result sets.
    const f = vi.fn(async (url: string) =>
      url.includes(encodeURIComponent('陈奕迅'))
        ? itunesRows([{ title: 'Song', artist: '陈奕迅' }])
        : itunesRows([{ title: 'Song', artist: '陳奕迅' }]))
    vi.stubGlobal('fetch', f)

    const r = await searchSongs('陈奕迅')
    expect(f).toHaveBeenCalledTimes(2)
    expect(r).toHaveLength(1)
  })

  it('does not collide title/artist pairs that share characters across the boundary', async () => {
    // The old key `${title}${artist}` had no separator, so title:'A'
    // artist:'BC' and title:'AB' artist:'C' both stringified to 'ABC' and
    // one was silently dropped as a "duplicate". 'AB' is plain Latin text,
    // so scriptVariants returns a single variant and only one request fires.
    const f = vi.fn(async () =>
      itunesRows([{ title: 'A', artist: 'BC' }, { title: 'AB', artist: 'C' }]))
    vi.stubGlobal('fetch', f)

    const r = await searchSongs('AB')
    expect(r).toHaveLength(2)
  })

  it('falls back to LRCLIB search when iTunes fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('itunes')) return new Response('', { status: 503 })
      return new Response(JSON.stringify([{ trackName: 'T', artistName: 'A', duration: 200 }]))
    }))
    const r = await searchSongs('唱歌')
    expect(r[0].title).toBe('T')
  })

  it('propagates RateLimitError from the LRCLIB fallback instead of swallowing it', async () => {
    // There is no server-side fallback beyond LRCLIB. If iTunes is down and
    // LRCLIB is rate limited, searchSongs must reject with RateLimitError so
    // the UI can tell the user to retry in N seconds -- not silently return
    // fewer results (or none), which looks indistinguishable from "no such
    // song".
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('itunes')) return new Response('', { status: 503 })
      return new Response('', { status: 429, headers: { 'Retry-After': '17' } })
    }))

    const err: unknown = await searchSongs('AB').catch((e) => e)
    expect(err).toBeInstanceOf(RateLimitError)
    expect((err as RateLimitError).retryAfterSec).toBe(17)
  })
})

describe('fetchLyrics', () => {
  it('sends the Lrclib-Client header', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ id: 1, syncedLyrics: '[00:01.00]唱', plainLyrics: '唱' })))
    vi.stubGlobal('fetch', f)

    await fetchLyrics({ title: 'T', artist: 'A', durationSec: 200 })
    const init = f.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['Lrclib-Client']).toMatch(/^ktv-lyric\//)
  })

  it('prefers synced lyrics over plain', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ id: 1, syncedLyrics: '[00:01.00]唱', plainLyrics: '歌' }))))
    const r = await fetchLyrics({ title: 'T', artist: 'A' })
    expect(r).toEqual({ raw: [{ text: '唱', timeMs: 1000 }], lrclibId: 1 })
  })

  // --- Finding 4: the id must come back too, or the caller has no key to
  // cache the song under (see storage/index.ts's getCachedSongByTitleArtist
  // and cacheSong, which key on it). ---

  it('returns the record id alongside the parsed lines', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ id: 99, syncedLyrics: '[00:01.00]唱歌', plainLyrics: null }))))
    const r = await fetchLyrics({ title: 'T', artist: 'A' })
    expect(r?.lrclibId).toBe(99)
  })

  it('returns null on a 404 miss so the caller can offer the paste box', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    expect(await fetchLyrics({ title: 'T', artist: 'A' })).toBeNull()
  })

  it('throws RateLimitError with a delta-seconds Retry-After', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('', { status: 429, headers: { 'Retry-After': '45' } })))

    const err: unknown = await fetchLyrics({ title: 'T', artist: 'A' }).catch((e) => e)
    expect(err).toBeInstanceOf(RateLimitError)
    expect((err as RateLimitError).retryAfterSec).toBe(45)
  })

  it('parses an HTTP-date Retry-After into seconds from now', async () => {
    // RFC 7231 §7.1.3 permits Retry-After to be an HTTP-date instead of
    // delta-seconds. Number(<http-date>) is NaN, so this must fall through
    // to Date.parse and convert to a delta.
    const target = new Date(Date.now() + 45_000).toUTCString()
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('', { status: 429, headers: { 'Retry-After': target } })))

    const err: unknown = await fetchLyrics({ title: 'T', artist: 'A' }).catch((e) => e)
    expect(err).toBeInstanceOf(RateLimitError)
    const sec = (err as RateLimitError).retryAfterSec
    expect(sec).toBeGreaterThan(40)
    expect(sec).toBeLessThanOrEqual(45)
  })

  it('falls back to 30s when Retry-After is missing or unparseable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('', { status: 429, headers: { 'Retry-After': 'not-a-real-value' } })))

    const err: unknown = await fetchLyrics({ title: 'T', artist: 'A' }).catch((e) => e)
    expect(err).toBeInstanceOf(RateLimitError)
    expect((err as RateLimitError).retryAfterSec).toBe(30)
  })
})
