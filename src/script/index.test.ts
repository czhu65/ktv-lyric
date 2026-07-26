import { describe, it, expect } from 'vitest'
import { normalize, isSimplified, toTraditional, scriptVariants } from './index'

describe('normalize', () => {
  it('applies NFC', () => {
    // U+FA10 is a compatibility ideograph with a singleton canonical decomposition.
    expect(normalize('塚')).toBe('塚')
  })
})

describe('isSimplified', () => {
  it('detects Simplified-only characters', () => {
    expect(isSimplified('浮夸')).toBe(true)
    expect(isSimplified('陈奕迅')).toBe(true)
  })

  it('does not flag Traditional text', () => {
    expect(isSimplified('浮誇')).toBe(false)
    expect(isSimplified('陳奕迅')).toBe(false)
  })

  it('does not flag characters shared by both scripts', () => {
    expect(isSimplified('一齊唱歌')).toBe(false)
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
