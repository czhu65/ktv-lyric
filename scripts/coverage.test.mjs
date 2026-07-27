import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import ToJyutping from 'to-jyutping'

// Which syllables can the annotator actually emit?
//
// An earlier version of this test scraped `src/trie.txt` with /\b[a-z]+[1-6]\b/.
// That is wrong: trie.txt is a custom BINARY-encoded trie on a single line, so the
// regex matched arbitrary ASCII runs inside the encoded structure and invented
// "syllables" no character ever produces (wbj5, wzwyx2, yhz2, x2, ...).
//
// Ask the engine instead. Sweeping every CJK character and collecting the readings
// it returns is authoritative by construction.
const CJK_RANGES = [
  [0x3400, 0x4dbf], // Extension A
  [0x4e00, 0x9fff], // Unified Ideographs
  [0xf900, 0xfaff], // Compatibility Ideographs
]

function emittableSyllables() {
  const need = new Map() // syllable -> an example character, for error messages
  for (const [lo, hi] of CJK_RANGES) {
    for (let cp = lo; cp <= hi; cp++) {
      const ch = String.fromCodePoint(cp)
      const reading = ToJyutping.getJyutpingList(ch)[0][1]
      if (!reading) continue
      // A single character can carry more than one syllable (瓩 -> "cin1 ngaa5").
      for (const syl of reading.split(/\s+/).filter(Boolean)) {
        if (!need.has(syl)) need.set(syl, ch)
      }
    }
  }
  return need
}

describe('audio coverage', () => {
  it('has an mp3 for every emittable syllable, except the known gaps', () => {
    const have = new Set(JSON.parse(readFileSync('public/data/syllables.json', 'utf8')))
    const need = emittableSyllables()
    const missing = [...need.keys()].filter((s) => !have.has(s)).sort()

    // Measured 2026-07-26: 1,814 syllables emitted, 3,884 audio files, 14 missing.
    // All 14 are absent from the amazonHiuJin subset of AlienKevin/cantone. They
    // exist only in that dataset's Microsoft voices, which are deliberately NOT
    // used: Microsoft has never publicly stated that generated speech may be
    // redistributed, and this repo is public. See docs/known-audio-gaps.md.
    //
    // Do NOT extend this list to make a failing build pass. A new missing syllable
    // means the audio set and the annotator have drifted apart, which is a real
    // regression. Regenerating with Amazon Polly closes all 14 — the documented
    // upgrade path, since Amazon grants redistribution explicitly.
    const KNOWN_GAPS = [
      'gak1', 'hm1', 'kwang1', 'm2', 'm4', 'nak6', 'ng4',
      'ng5', 'ng6', 'noek6', 'oi1', 'oi2', 'oi3', 'teot1',
    ]

    const unexpected = missing.filter((s) => !KNOWN_GAPS.includes(s))
    if (unexpected.length) {
      console.error(
        'Unexpected missing syllables:',
        unexpected.map((s) => `${s} (e.g. ${need.get(s)})`).join(', '),
      )
    }
    expect(unexpected).toEqual([])

    // Guard the other direction: if a gap is filled, update the list rather than
    // silently carrying a stale one.
    expect(KNOWN_GAPS.filter((s) => have.has(s))).toEqual([])
  }, 120_000)

  it('every audio file is named as a plausible jyutping syllable', () => {
    const have = JSON.parse(readFileSync('public/data/syllables.json', 'utf8'))
    expect(have.filter((s) => !/^[a-z]+[1-6]$/.test(s))).toEqual([])
  })
})
