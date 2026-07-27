import { pinyin } from 'pinyin-pro'
import { groupTokens } from '../annotate/group'
import type { SegmentOptions } from '../annotate'
import type { Char, Token } from '../types'
import { normalizePinyinSyllable } from './pinyin-syllable'
import { numToMark } from './tone-mark'
import type { LanguagePack } from './types'

// One entry per INPUT CHARACTER, in order. pinyin-pro's `type: 'all'` mode is
// the only one that guarantees this -- `type: 'array'` drops or merges
// non-Chinese runs depending on the nonZh option, which would desynchronise
// the flat character index that LyricLine and the player both rely on.
//
// pinyin-pro's own .d.ts overloads pinyin() to return AllData[] (with
// matching origin/pinyin/isZh fields) when `type: 'all'` is passed, so no
// cast is needed here -- the literal `type: 'all'` below is enough for
// TypeScript to pick that overload.
function toChars(line: string): Char[] {
  const entries = pinyin(line, {
    type: 'all',
    toneType: 'num',
    nonZh: 'consecutive',
  })

  const chars: Char[] = []
  for (const e of entries) {
    // A non-Chinese run can arrive as one multi-character entry; split it so
    // the flat index stays one-per-character.
    if (!e.isZh) {
      for (const ch of [...e.origin]) chars.push({ char: ch, syllables: [] })
      continue
    }
    const syl = normalizePinyinSyllable(e.pinyin)
    chars.push({ char: e.origin, syllables: syl ? [syl] : [] })
  }
  return chars
}

/**
 * Annotate ONE WHOLE UNBROKEN SOURCE LINE.
 *
 * Readings come from pinyin-pro over the full line, so its own segmentation
 * resolves polyphones (行 xing2 vs hang2). Token grouping below is computed
 * SEPARATELY, from the gloss dictionary's keys. A divergence between the two
 * is therefore cosmetic -- it can never produce a wrong pronunciation. This is
 * exactly the argument annotate/index.ts already makes for to-jyutping.
 */
function annotate(line: string, opts: SegmentOptions): Token[] {
  return groupTokens(toChars(line), opts)
}

export const cmnPack: LanguagePack = {
  id: 'cmn',
  label: '普通話',
  annotate,
  romanizations: [
    { id: 'tonemark', label: 'Tone marks (wǒ)', render: numToMark },
    { id: 'tonenum', label: 'Tone numbers (wo3)', render: (s) => s },
  ],
  audioDir: 'audio/pin',
  manifest: 'data/pinyin.json',
  script: 'simp',
}
