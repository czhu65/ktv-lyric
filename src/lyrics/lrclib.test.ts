import { describe, it, expect, vi } from 'vitest'
import { toSimplified } from '../script'
import { lrclibGet, RateLimitError } from './lrclib'

// Synthetic title/artist, not a real song: 對話 has a genuine Traditional/
// Simplified difference (對話 vs 对话); 歌手 ("singer") is script-invariant,
// so these exercise the variant logic without needing two hardcoded spellings
// to stay in sync with opencc's tables.
const TITLE = '對話'
const ARTIST = '歌手'

function urlOf(call: unknown[]): URL {
  return new URL(call[0] as string)
}

describe('lrclibGet script-variant retry', () => {
  it('tries the original script first, with album/duration attached', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: 1, plainLyrics: '唱' })))
    vi.stubGlobal('fetch', f)

    await lrclibGet({ title: TITLE, artist: ARTIST, album: 'Album', durationSec: 200 })

    expect(f).toHaveBeenCalledTimes(1)
    const u = urlOf(f.mock.calls[0])
    expect(u.pathname).toBe('/api/get')
    expect(u.searchParams.get('track_name')).toBe(TITLE)
    expect(u.searchParams.get('artist_name')).toBe(ARTIST)
    expect(u.searchParams.get('album_name')).toBe('Album')
    expect(u.searchParams.get('duration')).toBe('200')
  })

  it('retries /get in the converted script on a 404, and finds it', async () => {
    const simpTitle = await toSimplified(TITLE)
    const simpArtist = await toSimplified(ARTIST)

    const f = vi.fn(async (url: string) => {
      const p = new URL(url).searchParams
      if (p.get('track_name') === simpTitle && p.get('artist_name') === simpArtist) {
        return new Response(JSON.stringify({ id: 2, plainLyrics: '你好' }))
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', f)

    const rec = await lrclibGet({ title: TITLE, artist: ARTIST })
    expect(rec?.id).toBe(2)
    // First call was the original script and missed; the Simplified retry
    // is what actually found it -- more than one /get call happened.
    expect(f.mock.calls.length).toBeGreaterThan(1)
  })

  it('drops album_name on a converted-script retry but keeps duration', async () => {
    const f = vi.fn(async (url: string) => {
      const p = new URL(url).searchParams
      if (p.get('album_name')) return new Response('', { status: 404 })
      // The retry (no album_name) succeeds.
      return new Response(JSON.stringify({ id: 3, plainLyrics: '歌' }))
    })
    vi.stubGlobal('fetch', f)

    const rec = await lrclibGet({ title: TITLE, artist: ARTIST, album: 'Album', durationSec: 90 })
    expect(rec?.id).toBe(3)
    const lastUrl = urlOf(f.mock.calls[f.mock.calls.length - 1])
    expect(lastUrl.searchParams.get('album_name')).toBeNull()
    expect(lastUrl.searchParams.get('duration')).toBe('90')
  })

  it('falls back to /search when /get misses under every script variant', async () => {
    const f = vi.fn(async (url: string) => {
      const u = new URL(url)
      if (u.pathname === '/api/get') return new Response('', { status: 404 })
      // /search tolerates a suffix /get would have missed on.
      return new Response(JSON.stringify([{ id: 4, plainLyrics: '歌詞' }]))
    })
    vi.stubGlobal('fetch', f)

    const rec = await lrclibGet({ title: TITLE, artist: ARTIST })
    expect(rec?.id).toBe(4)
  })

  it('returns null when /get and /search both miss for every script variant', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = new URL(url)
      return u.pathname === '/api/search'
        ? new Response('[]')
        : new Response('', { status: 404 })
    }))

    expect(await lrclibGet({ title: TITLE, artist: ARTIST })).toBeNull()
  })

  it('propagates a 429 immediately, without exhausting other script variants', async () => {
    const f = vi.fn(async () => new Response('', { status: 429, headers: { 'Retry-After': '12' } }))
    vi.stubGlobal('fetch', f)

    const err: unknown = await lrclibGet({ title: TITLE, artist: ARTIST }).catch((e) => e)
    expect(err).toBeInstanceOf(RateLimitError)
    expect((err as RateLimitError).retryAfterSec).toBe(12)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('does not duplicate a script-invariant title/artist into repeat requests', async () => {
    // '你好' / '大家' round-trip unchanged through both toTraditional and
    // toSimplified, so there is only ONE variant pair -- confirms dedup, not
    // just that the happy path works.
    const f = vi.fn(async () => new Response('', { status: 404 }))
    vi.stubGlobal('fetch', f)

    await lrclibGet({ title: '你好', artist: '大家' })

    // One variant x two tiers (/get, /search) = exactly 2 calls, not up to 6.
    expect(f).toHaveBeenCalledTimes(2)
  })
})
