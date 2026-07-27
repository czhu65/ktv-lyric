import { describe, it, expect } from 'vitest'
import { yuePack } from './yue'

const OPTS = { words: new Set<string>(['天空']), maxWordLength: 2 }

describe('yuePack', () => {
  it('identifies itself', () => {
    expect(yuePack.id).toBe('yue')
    expect(yuePack.audioDir).toBe('audio/syl')
    expect(yuePack.manifest).toBe('data/syllables.json')
    expect(yuePack.script).toBe('trad')
  })

  it('annotates with Jyutping', () => {
    const tokens = yuePack.annotate('天空', OPTS)
    const syllables = tokens.flatMap((t) => t.chars.flatMap((c) => c.syllables))
    expect(syllables).toEqual(['tin1', 'hung1'])
  })

  it('emits exactly one Char per input code point, reconstructing the line', () => {
    // Guards the flat character index the player and LyricLine both rely on.
    // Binds the shared groupTokens() extraction as much as it binds to-jyutping.
    const line = '你好，世界！abc 123 天空'
    const chars = yuePack.annotate(line, OPTS).flatMap((t) => t.chars)
    expect(chars).toHaveLength([...line].length)
    expect(chars.map((c) => c.char).join('')).toBe(line)
  })

  it('groups dictionary words into one token', () => {
    const tokens = yuePack.annotate('天空', OPTS)
    expect(tokens).toHaveLength(1)
    expect(tokens[0].chars).toHaveLength(2)
  })

  it('offers Jyutping and Yale, Jyutping first', () => {
    expect(yuePack.romanizations.map((r) => r.id)).toEqual(['jyutping', 'yale'])
  })

  it('renders Jyutping as itself and Yale with diacritics', () => {
    const [jyutping, yale] = yuePack.romanizations
    expect(jyutping.render('ngo5')).toBe('ngo5')
    expect(yale.render('ngo5')).toBe('ngóh')
  })
})
