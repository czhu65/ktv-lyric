import { describe, it, expect } from 'vitest'
import { normalize, isSimplified, toTraditional, scriptVariants } from './index'

describe('normalize', () => {
  it('applies NFC', () => {
    // U+FA10 is a compatibility ideograph with a singleton canonical decomposition.
    expect(normalize('塚')).toBe('塚')
  })
})

describe('isSimplified', () => {
  it('detects Simplified-only characters', async () => {
    expect(await isSimplified('浮夸')).toBe(true)
    expect(await isSimplified('陈奕迅')).toBe(true)
  })

  it('does not flag Traditional text', async () => {
    expect(await isSimplified('浮誇')).toBe(false)
    expect(await isSimplified('陳奕迅')).toBe(false)
  })

  it('does not flag characters shared by both scripts', async () => {
    expect(await isSimplified('一齊唱歌')).toBe(false)
  })

  // Regression: the old hand-maintained marker set flagged 向/只/台 as
  // "Simplified-only" even though they are the standard script-neutral or
  // Traditional/HK forms, misclassifying ordinary Traditional vocabulary.
  it('does not flag ordinary Traditional words containing former false-positive characters', async () => {
    expect(await isSimplified('電台')).toBe(false)
    expect(await isSimplified('舞台')).toBe(false)
    expect(await isSimplified('平台')).toBe(false)
    expect(await isSimplified('只是')).toBe(false)
    expect(await isSimplified('只有')).toBe(false)
    expect(await isSimplified('方向')).toBe(false)
  })

  // Regression: the old marker set missed most common simplifications
  // entirely (88% miss rate) — these are among the highest-frequency
  // Simplified characters and must all be detected.
  it('detects common Simplified characters the old marker set missed', async () => {
    for (const ch of ['学', '说', '这', '时', '电', '见', '来', '对', '会']) {
      expect(await isSimplified(ch)).toBe(true)
    }
  })
})

describe('toTraditional', () => {
  it('converts Simplified to Traditional', async () => {
    expect(await toTraditional('浮夸')).toBe('浮誇')
  })
})

describe('scriptVariants', () => {
  it('returns both variants for Simplified input', async () => {
    const v = await scriptVariants('浮夸')
    expect(v).toContain('浮夸')
    expect(v).toContain('浮誇')
    expect(v).toHaveLength(2)
  })

  it('returns a single variant when the scripts agree', async () => {
    expect(await scriptVariants('唱歌')).toEqual(['唱歌'])
  })
})
