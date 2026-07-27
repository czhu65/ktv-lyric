import { describe, it, expect } from 'vitest'
import { guessLang } from './genre'

describe('guessLang', () => {
  it('recognises the HK storefront vocabulary', () => {
    expect(guessLang('廣東歌/香港流行樂')).toBe('yue')
    expect(guessLang('國語流行樂')).toBe('cmn')
  })

  it('recognises the TW storefront vocabulary', () => {
    expect(guessLang('粵語流行樂')).toBe('yue')
    expect(guessLang('華語流行樂')).toBe('cmn')
    expect(guessLang('華語音樂')).toBe('cmn')
  })

  it('returns undefined for genres that say nothing about language', () => {
    for (const g of ['流行樂', '世界音樂', '器樂', '演奏曲', '新世紀', 'Pop', 'K-Pop']) {
      expect(guessLang(g)).toBeUndefined()
    }
  })

  it('returns undefined for missing or empty input', () => {
    expect(guessLang(undefined)).toBeUndefined()
    expect(guessLang('')).toBeUndefined()
  })

  it('tolerates surrounding whitespace', () => {
    expect(guessLang('  粵語流行樂 ')).toBe('yue')
  })
})
