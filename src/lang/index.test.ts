import { describe, it, expect } from 'vitest'
import { getPack, renderSyllable, yuePack } from './index'

describe('getPack', () => {
  it('returns the Cantonese pack', async () => {
    expect((await getPack('yue')).id).toBe('yue')
  })

  it('lazily returns the Mandarin pack', async () => {
    expect((await getPack('cmn')).id).toBe('cmn')
  })

  it('returns the same instance on repeat calls, so packs are not rebuilt', async () => {
    expect(await getPack('cmn')).toBe(await getPack('cmn'))
  })
})

describe('renderSyllable', () => {
  it('uses the named style', () => {
    expect(renderSyllable(yuePack, 'yale', 'ngo5')).toBe('ngóh')
    expect(renderSyllable(yuePack, 'jyutping', 'ngo5')).toBe('ngo5')
  })

  it('falls back to the first style for an unknown id', () => {
    // A stale Settings value (e.g. 'tonemark' persisted while Mandarin was
    // active, then read back under the Cantonese pack) must not crash.
    expect(renderSyllable(yuePack, 'tonemark', 'ngo5')).toBe('ngo5')
  })
})
