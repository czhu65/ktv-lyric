import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createDict, loadDict } from './index'

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
})

describe('loadDict', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(RAW))))
  })

  it('fetches from the BASE_URL-relative data path', async () => {
    const d = await loadDict()
    expect(d.lookup('唱歌')).toBe('to sing a song')
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('data/dict.json')
  })
})
