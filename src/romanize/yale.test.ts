import { describe, it, expect } from 'vitest'
import { toYale } from './yale'

describe('toYale', () => {
  it('maps initials z/c/j', () => {
    expect(toYale('zi1')).toBe('jī')
    expect(toYale('ci1')).toBe('chī')
    expect(toYale('jat1')).toBe('yāt')
  })

  it('maps the yu vowel', () => {
    expect(toYale('jyu4')).toBe('yùh')
  })

  it('marks the six tones', () => {
    expect(toYale('si1')).toBe('sī')
    expect(toYale('si2')).toBe('sí')
    expect(toYale('si3')).toBe('si')
    expect(toYale('si4')).toBe('sìh')
    expect(toYale('si5')).toBe('síh')
    expect(toYale('si6')).toBe('sih')
  })

  it('places the h before a final consonant', () => {
    expect(toYale('man4')).toBe('màhn')
  })

  it('returns the input unchanged when it is not a jyutping syllable', () => {
    expect(toYale('')).toBe('')
    expect(toYale('abc')).toBe('abc')
  })
})

describe('toYale syllabic nasals', () => {
  it('marks the six tones on m', () => {
    expect(toYale('m1')).toBe('m̄')
    expect(toYale('m2')).toBe('ḿ')
    expect(toYale('m3')).toBe('m')
    expect(toYale('m4')).toBe('m̀h')
    expect(toYale('m5')).toBe('ḿh')
    expect(toYale('m6')).toBe('mh')
  })

  it('marks the six tones on ng', () => {
    expect(toYale('ng1')).toBe('n̄g')
    expect(toYale('ng2')).toBe('ńg')
    expect(toYale('ng3')).toBe('ng')
    expect(toYale('ng4')).toBe('ǹgh')
    expect(toYale('ng5')).toBe('ńgh')
    expect(toYale('ng6')).toBe('ngh')
  })

  it('keeps the leading h on the interjection form', () => {
    expect(toYale('hm1')).toBe('hm̄')
  })

  it('never leaves a tone digit in the output for any syllabic nasal', () => {
    const nasalSyllables = ['ng5', 'ng4', 'ng6', 'm2', 'm4', 'hm1']
    for (const syllable of nasalSyllables) {
      expect(toYale(syllable)).not.toMatch(/[0-9]/)
    }
  })
})
