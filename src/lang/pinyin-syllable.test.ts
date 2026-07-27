import { describe, it, expect } from 'vitest'
import { normalizePinyinSyllable } from './pinyin-syllable'
import { pinyin } from 'pinyin-pro'
// @ts-expect-error -- plain ESM build script, no .d.ts
import { normalizeSyllable } from '../../scripts/lib/pinyin-inventory.mjs'

describe('normalizePinyinSyllable', () => {
  it('passes through a well-formed toned syllable', () => {
    expect(normalizePinyinSyllable('wo3')).toBe('wo3')
    expect(normalizePinyinSyllable('tian1')).toBe('tian1')
  })

  it('maps neutral tone to 0 whichever digit the engine used', () => {
    // pinyin-pro may emit either; both must land on the Polly convention.
    expect(normalizePinyinSyllable('de5')).toBe('de0')
    expect(normalizePinyinSyllable('de0')).toBe('de0')
  })

  it('treats a missing tone digit as neutral', () => {
    expect(normalizePinyinSyllable('de')).toBe('de0')
  })

  it('normalizes u-umlaut to v, the form Polly accepts', () => {
    expect(normalizePinyinSyllable('lü4')).toBe('lv4')
    expect(normalizePinyinSyllable('lu:4')).toBe('lv4')
    expect(normalizePinyinSyllable('lv4')).toBe('lv4')
  })

  it('lowercases', () => {
    expect(normalizePinyinSyllable('Wo3')).toBe('wo3')
  })

  it('returns null for non-readings', () => {
    expect(normalizePinyinSyllable('')).toBeNull()
    expect(normalizePinyinSyllable('  ')).toBeNull()
    expect(normalizePinyinSyllable('，')).toBeNull()
    expect(normalizePinyinSyllable('abc!')).toBeNull()
  })

  it('rejects a tone digit out of range rather than silently truncating', () => {
    expect(normalizePinyinSyllable('wo7')).toBeNull()
  })
})

describe('normalizePinyinSyllable against pinyin-pro itself', () => {
  it('canonicalizes every syllable the engine emits for a synthetic phrase', () => {
    const raw = pinyin('你好嗎天空的', { toneType: 'num', type: 'array' }) as string[]
    const out = raw.map(normalizePinyinSyllable)
    expect(out.every((s) => s !== null)).toBe(true)
    expect(out.every((s) => /^[a-z]+[0-4]$/.test(s as string))).toBe(true)
  })
})

// The normalizer exists twice -- here for the app, and in
// scripts/lib/pinyin-inventory.mjs for the build script (which cannot
// import TypeScript). If the two diverge, the audio bank and the annotator
// key syllables differently and every affected character goes silent.
describe('the build-script normalizer agrees with the app normalizer', () => {
  it('agrees on every interesting input', () => {
    for (const raw of ['wo3', 'de5', 'de', 'lü4', 'lu:4', 'LV4', 'wo7', '', 'abc!']) {
      expect(normalizeSyllable(raw)).toBe(normalizePinyinSyllable(raw))
    }
  })

  // The 9 hand-picked inputs above only catch a divergence the author
  // thought to type in. They cannot catch, say, pinyin-pro widening its tone
  // range to 0-5 (a new digit neither list-writer anticipated) or adding a
  // ü spelling neither normalizer's regex accepts -- both normalizers would
  // silently agree to reject or mis-fold something new. This loop instead
  // feeds pinyin-pro's OWN current output -- every reading (`multiple:
  // true`) of a wide sweep of CJK Unified Ideographs, not a curated list --
  // through both normalizers and asserts they agree on every single one, so
  // any future divergence in either normalizer's accepted input shape shows
  // up here without anyone having to predict it in advance. Not lyrics, not
  // a fixture of song text -- just a scan of Unicode codepoints for
  // characters that happen to be Han.
  it('agrees on every reading pinyin-pro produces for a broad sweep of Han characters', () => {
    const rawReadings: string[] = []
    for (let cp = 0x4e00; cp <= 0x9fa5; cp += 7) {
      const ch = String.fromCodePoint(cp)
      const out = pinyin(ch, { toneType: 'num', type: 'array', multiple: true })
      const readings = Array.isArray(out) ? out : [out]
      rawReadings.push(...readings)
    }
    expect(rawReadings.length).toBeGreaterThan(1000)

    let agreements = 0
    for (const raw of rawReadings) {
      expect(normalizeSyllable(raw)).toBe(normalizePinyinSyllable(raw))
      agreements++
    }
    // A loop that silently iterated zero times would pass vacuously.
    expect(agreements).toBe(rawReadings.length)
  })
})
