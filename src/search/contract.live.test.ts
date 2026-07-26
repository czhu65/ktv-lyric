// Live contract tests. NOT part of `npm test`.
// Run deliberately: npx vitest run --config vitest.live.config.ts
import { describe, it, expect } from 'vitest'
import { searchItunes } from './itunes'
import { lrclibSearch } from '../lyrics/lrclib'

describe('upstream contracts', () => {
  it('iTunes Search still returns trackName and trackTimeMillis', async () => {
    const r = await searchItunes('Beyond')
    expect(r.length).toBeGreaterThan(0)
    expect(r[0].title).toBeTruthy()
    expect(r[0].durationSec).toBeGreaterThan(0)
  }, 20_000)

  it('LRCLIB search still accepts the Lrclib-Client header and returns rows', async () => {
    const r = await lrclibSearch('Beyond')
    expect(Array.isArray(r)).toBe(true)
  }, 20_000)
})
