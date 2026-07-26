import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchSongs, fetchLyrics, RateLimitError } from './index'

const itunes = (names: string[]) =>
  new Response(
    JSON.stringify({
      resultCount: names.length,
      results: names.map((n) => ({
        trackName: n, artistName: 'A', collectionName: 'Alb', trackTimeMillis: 240_000,
      })),
    }),
  )

describe('searchSongs', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('queries both script variants and merges results', async () => {
    const f = vi.fn(async (url: string) =>
      url.includes(encodeURIComponent('浮夸')) ? itunes(['浮夸']) : itunes(['浮誇']))
    vi.stubGlobal('fetch', f)

    const r = await searchSongs('浮夸')
    expect(f).toHaveBeenCalledTimes(2)
    expect(r.map((x) => x.title).sort()).toEqual(['浮夸', '浮誇'])
  })

  it('dedupes identical title+artist across variants', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => itunes(['唱歌'])))
    expect(await searchSongs('唱歌')).toHaveLength(1)
  })

  it('falls back to LRCLIB search when iTunes fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('itunes')) return new Response('', { status: 503 })
      return new Response(JSON.stringify([{ trackName: 'T', artistName: 'A', duration: 200 }]))
    }))
    const r = await searchSongs('唱歌')
    expect(r[0].title).toBe('T')
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
    expect(r).toEqual([{ text: '唱', timeMs: 1000 }])
  })

  it('returns null on a 404 miss so the caller can offer the paste box', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    expect(await fetchLyrics({ title: 'T', artist: 'A' })).toBeNull()
  })

  it('throws RateLimitError carrying Retry-After on 429', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('', { status: 429, headers: { 'Retry-After': '30' } })))
    await expect(fetchLyrics({ title: 'T', artist: 'A' })).rejects.toThrow(RateLimitError)
  })
})
