import { describe, it, expect } from 'vitest'
import { normalize, isSimplified, toTraditional, toSimplified, scriptVariants } from './index'

describe('normalize', () => {
  it('applies NFC', () => {
    // U+FA10 is a compatibility ideograph with a singleton canonical decomposition.
    expect(normalize('塚')).toBe('塚')
  })
})

describe('isSimplified', () => {
  it('detects Simplified-only characters', async () => {
    for (const ch of ['学', '说', '这', '时', '电', '见', '来', '对', '会']) {
      expect(await isSimplified(ch)).toBe(true)
    }
  })

  it('detects Simplified words', async () => {
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

  // Regression: an earlier fix switched the detection converter's target
  // from `hk` to `t` to stop `hk` mangling already-Traditional glyphs
  // (說→説, 溫→温, 臥→卧, 戶→户— see the isSimplified/converters() comments
  // in index.ts). But `t` has its own, opposite-direction defect: opencc's
  // base dictionary always promotes bare 台 to the more formal 臺, so
  // ordinary Traditional words using the common spelling of 台 round-trip
  // to a different string and get misreported as Simplified. Both classes
  // of ordinary Traditional text must be recognized correctly.
  it('does not flag ordinary Traditional words containing former false-positive characters', async () => {
    expect(await isSimplified('說話')).toBe(false)
    expect(await isSimplified('小說')).toBe(false)
    expect(await isSimplified('臥室')).toBe(false)
    expect(await isSimplified('溫暖')).toBe(false)
    expect(await isSimplified('戶口')).toBe(false)
    expect(await isSimplified('電台')).toBe(false)
    expect(await isSimplified('舞台')).toBe(false)
    expect(await isSimplified('只是')).toBe(false)
    expect(await isSimplified('方向')).toBe(false)
  })
})

describe('toTraditional', () => {
  it('converts Simplified to Traditional', async () => {
    expect(await toTraditional('浮夸')).toBe('浮誇')
    expect(await toTraditional('因为')).toBe('因為')
    expect(await toTraditional('众人')).toBe('眾人')
  })

  // Regression: `to: 'hk'` applied its glyph-variant table regardless of
  // source script, so already-Traditional input wasn't left alone —
  // conversion wasn't idempotent. `to: 'tw'` must leave ordinary
  // Traditional text completely unchanged.
  it('leaves ordinary Traditional text unchanged', async () => {
    for (const word of ['說話', '溫暖', '臥室', '戶口']) {
      expect(await toTraditional(word)).toBe(word)
    }
  })
})

describe('toSimplified', () => {
  it('converts Traditional to Simplified', async () => {
    expect(await toSimplified('浮誇')).toBe('浮夸')
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
