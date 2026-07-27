import { describe, it, expect } from 'vitest'
import { cmnPack } from './cmn'

const OPTS = { words: new Set<string>(['天空']), maxWordLength: 2 }

describe('cmnPack', () => {
  it('identifies itself', () => {
    expect(cmnPack.id).toBe('cmn')
    expect(cmnPack.audioDir).toBe('audio/pin')
    expect(cmnPack.manifest).toBe('data/pinyin.json')
  })

  it('annotates with canonical pinyin keys', () => {
    const tokens = cmnPack.annotate('天空', OPTS)
    const syllables = tokens.flatMap((t) => t.chars.flatMap((c) => c.syllables))
    expect(syllables).toEqual(['tian1', 'kong1'])
  })

  it('emits one Char per input character, punctuation included', () => {
    const tokens = cmnPack.annotate('你好，a', OPTS)
    const chars = tokens.flatMap((t) => t.chars)
    expect(chars.map((c) => c.char)).toEqual(['你', '好', '，', 'a'])
    expect(chars[2].syllables).toEqual([])
    expect(chars[3].syllables).toEqual([])
  })

  it('groups dictionary words into one token', () => {
    const tokens = cmnPack.annotate('天空', OPTS)
    expect(tokens).toHaveLength(1)
    expect(tokens[0].chars).toHaveLength(2)
  })

  it('resolves a polyphone from word context', () => {
    // 行 is xing2 in 行走 but hang2 in 銀行. pinyin-pro decides; we only
    // assert the two differ, so the test does not encode one engine version's
    // exact answer.
    const walk = cmnPack.annotate('行走', OPTS)[0].chars[0].syllables[0]
    const bank = cmnPack.annotate('銀行', OPTS).flatMap((t) => t.chars)[1].syllables[0]
    expect(walk).not.toBe(bank)
  })

  it('offers tone marks first, tone numbers second', () => {
    expect(cmnPack.romanizations.map((r) => r.id)).toEqual(['tonemark', 'tonenum'])
  })

  it('renders both styles', () => {
    const [mark, num] = cmnPack.romanizations
    expect(mark.render('wo3')).toBe('wǒ')
    expect(num.render('wo3')).toBe('wo3')
  })

  it('every emitted syllable is a canonical key', () => {
    const tokens = cmnPack.annotate('一個蘋果掉下來了', OPTS)
    const syllables = tokens.flatMap((t) => t.chars.flatMap((c) => c.syllables))
    expect(syllables.length).toBeGreaterThan(0)
    expect(syllables.every((s) => /^[a-z]+[0-4]$/.test(s))).toBe(true)
  })
})
