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
