import { describe, it, expect } from 'vitest'
import { parseLine, cleanGloss } from './cedict.mjs'

describe('parseLine', () => {
  it('parses a CC-CEDICT line', () => {
    const r = parseLine('一齊 一齐 [yi1 qi2] /together/in unison/')
    expect(r).toEqual({
      trad: '一齊', simp: '一齐', pinyin: 'yi1 qi2', jyutping: null,
      glosses: ['together', 'in unison'],
    })
  })

  it('parses a CC-Canto line with a jyutping field', () => {
    const r = parseLine('諗 谂 [shen3] {nam2} /to think/to consider/')
    expect(r.jyutping).toBe('nam2')
    expect(r.glosses[0]).toBe('to think')
  })

  it('keeps slashes that appear inside the jyutping braces', () => {
    const r = parseLine('乜嘢 乜嘢 [mie1 ye3] {mat1 je5} /what/')
    expect(r.trad).toBe('乜嘢')
    expect(r.glosses).toEqual(['what'])
  })

  it('returns null for comments and blank lines', () => {
    expect(parseLine('# comment')).toBeNull()
    expect(parseLine('')).toBeNull()
  })

  it('parses a CC-Canto line with a trailing "# adapted from cc-cedict" comment', () => {
    const r = parseLine('三 三 [san1] {saam1} /1. three 2. (slang) love affair (usually refers to a female)/ # adapted from cc-cedict')
    expect(r).not.toBeNull()
    expect(r.trad).toBe('三')
    expect(r.glosses).toEqual(['1. three 2. (slang) love affair (usually refers to a female)'])
    expect(r.glosses.some((g) => g.includes('adapted from cc-cedict'))).toBe(false)
  })
})

describe('cleanGloss', () => {
  it('drops classifier and Mandarin-equivalent noise', () => {
    expect(cleanGloss(['to think', 'CL:個|个[ge4]'])).toBe('to think')
    expect(cleanGloss(['Mandarin equivalent: 什麼', 'what'])).toBe('what')
  })

  it('truncates to 40 characters on a word boundary', () => {
    const long = ['a'.repeat(30) + ' ' + 'b'.repeat(30)]
    expect(cleanGloss(long).length).toBeLessThanOrEqual(40)
  })

  it('returns null when nothing survives cleaning', () => {
    expect(cleanGloss(['CL:個|个[ge4]'])).toBeNull()
  })

  it('does not filter a noise phrase that appears mid-string (documented limitation)', () => {
    // NOISE patterns are anchored to ^, so "Mandarin equivalent:" here is not
    // stripped because it doesn't start the gloss — this is the real 乜嘢
    // source string from CC-CEDICT. The gloss survives uncleaned and then
    // gets word-boundary truncated, producing a dangling fragment. This test
    // documents that this is the current, known behaviour rather than an
    // accident — a single hand-curated override in overrides.json is the
    // fix for this specific word, not a change to NOISE anchoring.
    const raw = ['what? (Cantonese) (Mandarin equivalent: 什麼|什么[shen2 me5])']
    expect(cleanGloss(raw)).toBe('what? (Cantonese) (Mandarin equivalent:')
  })

  it('drops a surname-only row, leaving null so the next row can supply a real gloss', () => {
    expect(cleanGloss(['surname Wong'])).toBeNull()
  })

  it('drops a bound-form cross-reference row', () => {
    expect(cleanGloss(['used in 上聲|上声[shang3 sheng1]'])).toBeNull()
  })

  it('drops an abbreviation row', () => {
    expect(cleanGloss(['abbr. for Israel 以色列[Yi3 se4 lie4]'])).toBeNull()
  })

  it('keeps a leading part-of-speech tag and only the first numbered sense', () => {
    expect(cleanGloss(['(noun) 1. seminar; 2. meeting; 3. conference'])).toBe('(noun) seminar')
  })

  it('takes the first numbered sense even when numbering does not start at 1', () => {
    expect(cleanGloss(['8. to climb 9. to get onto'])).toBe('to climb')
  })

  it('never leaves dangling punctuation after truncation', () => {
    // The 40-char cut lands right on a ';' (index 39) with no earlier space
    // to fall back to, so the naive slice ends in dangling punctuation.
    const long = ['a'.repeat(39) + ';' + 'b'.repeat(10)]
    const out = cleanGloss(long)
    expect(out.length).toBeLessThanOrEqual(40)
    expect(out).not.toMatch(/[;,(]\s*$/)
  })
})
