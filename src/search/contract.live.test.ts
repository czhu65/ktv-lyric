// Live contract tests. NOT part of `npm test`.
// Run deliberately: npx vitest run --config vitest.live.config.ts
import { describe, it, expect } from 'vitest'
import { searchItunes } from './itunes'
import { lrclibSearch } from '../lyrics/lrclib'

describe('upstream contracts', () => {
  it('iTunes Search still returns trackName and trackTimeMillis', async () => {
    const r = await searchItunes('Beyond', 'HK')
    expect(r.length).toBeGreaterThan(0)
    expect(r[0].title).toBeTruthy()
    expect(r[0].durationSec).toBeGreaterThan(0)
  }, 20_000)

  it('LRCLIB search still accepts the Lrclib-Client header and returns rows', async () => {
    const r = await lrclibSearch('Beyond')
    expect(Array.isArray(r)).toBe(true)
  }, 20_000)

  it('the HK storefront returns Chinese metadata, not English', async () => {
    const results = await searchItunes('晴天', 'HK')
    const top = results.slice(0, 5)
    // The whole reason US is dropped: it returns "Sunny Day — Jay Chou" here.
    expect(top.some((r) => r.title.includes('晴天'))).toBe(true)
    expect(top.some((r) => r.artist.includes('周杰倫'))).toBe(true)
  }, 20_000)

  it('genre metadata still distinguishes the two languages', async () => {
    const cantonese = await searchItunes('富士山下', 'HK')
    const mandarin = await searchItunes('告白氣球', 'HK')
    expect(cantonese.some((r) => r.langGuess === 'yue')).toBe(true)
    expect(mandarin.some((r) => r.langGuess === 'cmn')).toBe(true)
  }, 20_000)
})
