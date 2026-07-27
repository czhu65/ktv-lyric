import { describe, it, expect } from 'vitest'
import { numToMark } from './tone-mark'

describe('numToMark', () => {
  it('places the mark on the sole vowel', () => {
    expect(numToMark('wo3')).toBe('wǒ')
    expect(numToMark('ma1')).toBe('mā')
    expect(numToMark('ni3')).toBe('nǐ')
  })

  it('strips the digit for neutral tone', () => {
    expect(numToMark('de0')).toBe('de')
  })

  it('prefers a or e when present', () => {
    expect(numToMark('hao3')).toBe('hǎo')   // a, not o
    expect(numToMark('tian1')).toBe('tiān') // a, not i
    expect(numToMark('xie4')).toBe('xiè')   // e, not i
  })

  it('marks the o of ou', () => {
    expect(numToMark('zhou1')).toBe('zhōu')
  })

  it('marks the SECOND vowel otherwise', () => {
    // The standard rule: with no a/e/ou, the mark goes on the last vowel.
    expect(numToMark('liu2')).toBe('liú')
    expect(numToMark('gui4')).toBe('guì')
  })

  it('renders v as ü', () => {
    expect(numToMark('lv4')).toBe('lǜ')
    expect(numToMark('nv3')).toBe('nǚ')
  })

  it('handles the syllabic interjections with no standard vowel', () => {
    expect(numToMark('n2')).toBe('n2')   // unmarkable, passed through
    expect(numToMark('hm0')).toBe('hm')  // neutral: digit still dropped
  })

  it('passes through anything that is not a canonical key', () => {
    expect(numToMark('ngo5')).toBe('ngo5') // a Jyutping syllable, not ours
    expect(numToMark('')).toBe('')
  })
})
