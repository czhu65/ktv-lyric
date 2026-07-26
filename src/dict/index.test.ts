import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createDict } from './index'

const RAW = { '唱': 'to sing', '歌': 'song', '唱歌': 'to sing a song', '一齊': 'together' }

describe('createDict', () => {
  const d = createDict(RAW)

  it('looks up a multi-character word', () => {
    expect(d.lookup('唱歌')).toBe('to sing a song')
  })

  it('looks up a single character', () => {
    expect(d.lookup('唱')).toBe('to sing')
  })

  it('falls back to per-character decomposition', () => {
    expect(d.lookup('歌唱')).toBe('歌 song · 唱 to sing')
  })

  it('returns null when nothing is known', () => {
    expect(d.lookup('\u{20000}')).toBeNull()
  })

  it('exposes keys and the longest key length for segmentation', () => {
    expect(d.keys().has('唱歌')).toBe(true)
    expect(d.maxKeyLength).toBe(2)
  })

  it('yields a maxKeyLength of 0 for an empty dictionary', () => {
    expect(createDict({}).maxKeyLength).toBe(0)
  })
})

describe('loadDict', () => {
  beforeEach(() => {
    // loadDict() memoises in module-level state, so each test needs a fresh
    // module instance — otherwise an earlier test's cached promise leaks in.
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(RAW))))
  })

  it('fetches from the BASE_URL-relative data path', async () => {
    const { loadDict } = await import('./index')
    const d = await loadDict()
    expect(d.lookup('唱歌')).toBe('to sing a song')
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/ktv-lyric/data/dict.json')
  })

  it('retries after a failed load, succeeding on the second call', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new Error('network blip'))
        .mockImplementationOnce(async () => new Response(JSON.stringify(RAW))),
    )
    const { loadDict } = await import('./index')

    await expect(loadDict()).rejects.toThrow('network blip')

    const d = await loadDict()
    expect(d.lookup('唱歌')).toBe('to sing a song')
    expect(vi.mocked(fetch).mock.calls).toHaveLength(2)
  })

  it('shares a single in-flight fetch across concurrent calls', async () => {
    const { loadDict } = await import('./index')
    const p1 = loadDict()
    const p2 = loadDict()

    const [d1, d2] = await Promise.all([p1, p2])

    expect(d1.lookup('唱歌')).toBe('to sing a song')
    expect(d2.lookup('唱歌')).toBe('to sing a song')
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1)
  })
})
