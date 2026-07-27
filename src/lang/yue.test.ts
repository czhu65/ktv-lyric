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
