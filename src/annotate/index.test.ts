import { describe, it, expect } from 'vitest'
import { annotateLine } from './index'

const WORDS = new Set(['唱歌', '一齊', '仙女', '初生'])
const OPTS = { words: WORDS, maxWordLength: 2 }
const flat = (ts: ReturnType<typeof annotateLine>) =>
  ts.flatMap((t) => t.chars).map((c) => c.syllables.join(' '))

describe('annotateLine', () => {
  it('assigns a reading to every Chinese character', () => {
    const t = annotateLine('唱歌', OPTS)
    expect(flat(t)).toEqual(['coeng3', 'go1'])
  })

  it('groups known words into a single token', () => {
    const t = annotateLine('一齊唱歌', OPTS)
    expect(t.map((x) => x.chars.map((c) => c.char).join(''))).toEqual(['一齊', '唱歌'])
  })

  it('emits unknown characters as single-character tokens', () => {
    const t = annotateLine('我唱歌', OPTS)
    expect(t.map((x) => x.chars.map((c) => c.char).join(''))).toEqual(['我', '唱歌'])
  })

  it('gives punctuation an empty syllable list', () => {
    const t = annotateLine('唱，歌', OPTS)
    const comma = t.flatMap((x) => x.chars).find((c) => c.char === '，')!
    expect(comma.syllables).toEqual([])
  })

  it('splits a character carrying multiple syllables', () => {
    // 瓩 is a single character read as two syllables.
    const c = annotateLine('瓩', OPTS)[0].chars[0]
    expect(c.syllables.length).toBe(2)
  })

  it('resolves polyphones from word context, not per character', () => {
    // Golden fixtures. These are the regression net for a to-jyutping upgrade.
    const read = (s: string) => flat(annotateLine(s, OPTS)).join(' ')
    expect(read('生日')).toContain('saang1')
    expect(read('生命')).toContain('sang1')
    expect(read('仙女')).toContain('neoi2')
    expect(read('女人')).toContain('neoi5')
  })

  it('is called with a WHOLE line — a break changes the reading', () => {
    // Documents the trap rather than asserting a library behaviour we control:
    // 仙女 as one line reads neoi2; the characters annotated apart do not.
    const together = flat(annotateLine('仙女', OPTS)).join(' ')
    const apart = flat(annotateLine('女', OPTS)).join(' ')
    expect(together).toContain('neoi2')
    expect(apart).toContain('neoi5')
  })
})
