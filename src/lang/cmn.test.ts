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

  it('declares that it needs Simplified input', () => {
    expect(cmnPack.script).toBe('simp')
  })

  it('resolves a polyphone from word context, given SIMPLIFIED input', () => {
    // 行 is xing2 in 行走 but hang2 in 银行.
    //
    // The input MUST be Simplified: pinyin-pro's polyphone dictionary is
    // Simplified-keyed, and Traditional 銀行 silently returns yin2 xing2.
    // That is why LanguagePack carries `script` and why App.tsx converts to
    // pack.script before calling annotate.
    const walk = cmnPack.annotate('行走', OPTS)[0].chars[0].syllables[0]
    const bank = cmnPack.annotate('银行', OPTS).flatMap((t) => t.chars)[1].syllables[0]
    expect(walk).toBe('xing2')
    expect(bank).toBe('hang2')
  })

  it('does NOT resolve polyphones on Traditional input — the reason `script` exists', () => {
    // Characterizes the engine limitation this design works around. If a
    // future pinyin-pro gains Traditional support this test will fail, which
    // is the signal to revisit LanguagePack.script — not to delete the test.
    const bank = cmnPack.annotate('銀行', OPTS).flatMap((t) => t.chars)[1].syllables[0]
    expect(bank).toBe('xing2')
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
