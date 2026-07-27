import { describe, it, expect } from 'vitest'
import { normalizeSyllable, derivePinyinInventory } from './pinyin-inventory.mjs'
// This file is plain ESM (see the comment atop pinyin-inventory.mjs), but
// vitest transforms TypeScript regardless of the importing file's own
// extension, so this import is real, not aspirational -- unlike the old
// version of the test below, which hardcoded 6 expectations against
// normalizeSyllable alone and would keep passing after the two normalizers
// diverged.
import { normalizePinyinSyllable } from '../../src/lang/pinyin-syllable.ts'

describe('normalizeSyllable', () => {
  it('matches the TypeScript normalizer exactly', () => {
    for (const raw of ['wo3', 'de5', 'de', 'lü4', 'wo7', '']) {
      expect(normalizeSyllable(raw)).toBe(normalizePinyinSyllable(raw))
    }
    // And pin down the actual values, so a bug shared by both normalizers
    // (which would pass the comparison above) still gets caught.
    expect(normalizeSyllable('wo3')).toBe('wo3')
    expect(normalizeSyllable('de5')).toBe('de0')
    expect(normalizeSyllable('de')).toBe('de0')
    expect(normalizeSyllable('lü4')).toBe('lv4')
    expect(normalizeSyllable('wo7')).toBeNull()
    expect(normalizeSyllable('')).toBeNull()
  })
})

describe('derivePinyinInventory', () => {
  const out = derivePinyinInventory('public/data/dict.json')

  it('returns sorted, deduped canonical syllable keys', () => {
    expect(out.syllables.length).toBeGreaterThan(1000)
    expect(out.syllables.every((s) => /^[a-z]+[0-4]$/.test(s))).toBe(true)
    expect([...out.syllables].sort()).toEqual(out.syllables)
    expect(new Set(out.syllables).size).toBe(out.syllables.length)
  })

  it('covers the readings of common characters, each with a representative', () => {
    for (const s of ['wo3', 'ni3', 'hao3', 'tian1', 'de0']) {
      expect(out.syllables).toContain(s)
      expect(out.representatives[s]).toBeTruthy()
    }
  })

  it('every representative value is a single Han character', () => {
    for (const ch of Object.values(out.representatives)) {
      expect([...ch].length).toBe(1)
      expect(/\p{Script=Han}/u.test(ch)).toBe(true)
    }
  })

  it('unreachable is sorted, deduped, and made only of valid syllable keys', () => {
    expect([...out.unreachable].sort()).toEqual(out.unreachable)
    expect(new Set(out.unreachable).size).toBe(out.unreachable.length)
    expect(out.unreachable.every((s) => /^[a-z]+[0-4]$/.test(s))).toBe(true)
  })

  it('representatives and unreachable together account for every syllable exactly once', () => {
    const repKeys = Object.keys(out.representatives)
    const union = new Set([...repKeys, ...out.unreachable])
    expect(union.size).toBe(out.syllables.length)
    expect([...union].sort()).toEqual(out.syllables)

    // No overlap between the two.
    const overlap = repKeys.filter((s) => out.unreachable.includes(s))
    expect(overlap).toEqual([])
  })
})
