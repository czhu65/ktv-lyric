# Bilingual Cantonese + Mandarin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Broaden the app from Cantonese-only to Cantonese **and** Mandarin — search finds both, and each song is annotated with Jyutping or pinyin according to a per-song toggle seeded from iTunes genre metadata.

**Architecture:** A `LanguagePack` object per language holds everything language-specific (annotator, romanization styles, audio directory, manifest). `Char`, `Token`, `Line` and the entire player stay untouched, because Mandarin syllables are tone-numbered pinyin (`wo3`) exactly as Cantonese syllables are Jyutping (`ngo5`) — one string serving as audio filename, manifest key, and romanization source. The Mandarin pack is a lazy chunk.

**Tech Stack:** Vite 8, React 19, TypeScript 7, Vitest 4, `to-jyutping` 3.1.1, `pinyin-pro` 3.28.2 (new), `opencc-js` 1.4.1, Amazon Polly (build-time only).

**Spec:** `docs/superpowers/specs/2026-07-27-bilingual-search-design.md`

## Global Constraints

- **100% static.** No backend, no serverless function, no API key or secret anywhere in the bundle or repo. AWS credentials are build-time only, from the ambient profile.
- **No lyric fixtures in the repo, ever — including tests.** Use short synthetic phrases (你好, 一個蘋果, 天空). The "we host zero lyrics" property must hold for the test suite too.
- **Never Git LFS.** GitHub Pages serves the pointer stub.
- **The dictionary stays a separate `.json` file.** CC BY-SA ShareAlike binds the data file, not the app code. Never inline it into a JS bundle.
- **Non-commercial, un-monetised.** words.hk and rime-cantonese upstream data prohibit commercial use.
- **Commit locally only. Never push.**
- **`node` on PATH is Node 6.14.0** (bundled with Brackets) and cannot run ESM. Start every shell with:
  `export PATH="/c/Program Files/nodejs:$PATH"` — this fixes `node`, `npm`, and `npx` together. Verify with `node --version` (expect v20.x).
- **Canonical Mandarin syllable key:** `/^[a-z]+[0-4]$/`, neutral tone = `0`. This one string is the audio filename, the manifest entry, and the Polly `ph` value.
- **Canonical Cantonese syllable key:** `/^[a-z]+[1-6]$/`. Unchanged.
- Vite `base` is `/ktv-lyric/`; all runtime asset paths go through `import.meta.env.BASE_URL`.
- Test command is `npx vitest run <path>`. Full build check is `npm run build` (`tsc --noEmit && vite build`).

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/lang/types.ts` | `LangId`, `RomanizationStyle`, `LanguagePack` interfaces. No logic. |
| `src/lang/pinyin-syllable.ts` | `normalizePinyinSyllable()` — pinyin-pro output → canonical key |
| `src/lang/tone-mark.ts` | `numToMark()` — `wo3` → `wǒ` |
| `src/lang/yue.ts` | The Cantonese pack. Wraps existing `annotateLine` + `toYale`. |
| `src/lang/cmn.ts` | The Mandarin pack. pinyin-pro + the two functions above. |
| `src/lang/index.ts` | `getPack()` lazy loader + `renderSyllable()` helper |
| `src/search/genre.ts` | iTunes `primaryGenreName` → `LangId` lookup table |
| `src/ui/LangToggle.tsx` | The two-position language control |
| `scripts/lib/pinyin-inventory.mjs` | Derives the required syllable set from `dict.json` |
| `scripts/build-pinyin-audio.mjs` | Polly → ffmpeg → `public/audio/pin/` + `public/data/pinyin.json` |
| `scripts/pinyin-coverage.test.mjs` | Asserts every derivable syllable has an mp3 |

**Modified:** `src/types.ts`, `src/audio/index.ts`, `src/romanize/show.ts`, `src/storage/index.ts`, `src/search/index.ts`, `src/search/itunes.ts`, `src/ui/LyricLine.tsx`, `src/ui/LyricView.tsx`, `src/ui/SettingsPanel.tsx`, `src/ui/Credits.tsx`, `src/App.tsx`, `package.json`.

**Unchanged:** `src/annotate/index.ts`, `src/romanize/yale.ts`, `src/player/index.ts`, `src/dict/index.ts`, `src/script/index.ts`, `src/lyrics/*`.

---

### Task 1: Install pinyin-pro and pin the syllable normalizer

pinyin-pro's exact output shape cannot be confirmed from documentation alone — in particular which digit it emits for neutral tone (`0` or `5`) and whether `type: 'all'` yields strictly one entry per input character. Both are load-bearing. This task installs the library and turns its real behaviour into characterization tests, so every later task builds on verified facts.

**Files:**
- Modify: `package.json`
- Create: `src/lang/pinyin-syllable.ts`
- Test: `src/lang/pinyin-syllable.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `normalizePinyinSyllable(raw: string): string | null` — canonical `/^[a-z]+[0-4]$/`, or `null` when the input is not a Han reading (punctuation, Latin, empty).

- [ ] **Step 1: Install pinyin-pro**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npm install pinyin-pro@3.28.2
```

- [ ] **Step 2: Characterize the library's real output**

Run this throwaway probe and **record the actual output in your task report** — later steps depend on it:

```bash
node -e "
const { pinyin } = require('pinyin-pro');
console.log('array/num  :', JSON.stringify(pinyin('你好嗎的', { toneType: 'num', type: 'array' })));
console.log('all/num    :', JSON.stringify(pinyin('你好的', { toneType: 'num', type: 'all' }), null, 1));
console.log('nonZh keep :', JSON.stringify(pinyin('a天,b', { toneType: 'num', type: 'array', nonZh: 'consecutive' })));
console.log('v/u umlaut :', JSON.stringify(pinyin('綠女', { toneType: 'num', type: 'array' })));
"
```

Note especially: the neutral-tone digit on 的, whether `type: 'all'` entries carry `origin` and `isZh`, and how ü is spelled (`lv4` vs `lu:4`).

- [ ] **Step 3: Write the failing test**

Create `src/lang/pinyin-syllable.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizePinyinSyllable } from './pinyin-syllable'

describe('normalizePinyinSyllable', () => {
  it('passes through a well-formed toned syllable', () => {
    expect(normalizePinyinSyllable('wo3')).toBe('wo3')
    expect(normalizePinyinSyllable('tian1')).toBe('tian1')
  })

  it('maps neutral tone to 0 whichever digit the engine used', () => {
    // pinyin-pro may emit either; both must land on the Polly convention.
    expect(normalizePinyinSyllable('de5')).toBe('de0')
    expect(normalizePinyinSyllable('de0')).toBe('de0')
  })

  it('treats a missing tone digit as neutral', () => {
    expect(normalizePinyinSyllable('de')).toBe('de0')
  })

  it('normalizes u-umlaut to v, the form Polly accepts', () => {
    expect(normalizePinyinSyllable('lü4')).toBe('lv4')
    expect(normalizePinyinSyllable('lu:4')).toBe('lv4')
    expect(normalizePinyinSyllable('lv4')).toBe('lv4')
  })

  it('lowercases', () => {
    expect(normalizePinyinSyllable('Wo3')).toBe('wo3')
  })

  it('returns null for non-readings', () => {
    expect(normalizePinyinSyllable('')).toBeNull()
    expect(normalizePinyinSyllable('  ')).toBeNull()
    expect(normalizePinyinSyllable('，')).toBeNull()
    expect(normalizePinyinSyllable('abc!')).toBeNull()
  })

  it('rejects a tone digit out of range rather than silently truncating', () => {
    expect(normalizePinyinSyllable('wo7')).toBeNull()
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/lang/pinyin-syllable.test.ts`
Expected: FAIL — cannot resolve `./pinyin-syllable`

- [ ] **Step 5: Write the implementation**

Create `src/lang/pinyin-syllable.ts`:

```ts
// The canonical Mandarin syllable key: /^[a-z]+[0-4]$/, neutral tone = 0.
//
// This single string is used three ways and they must not drift apart:
//   - the audio filename           public/audio/pin/wo3.mp3
//   - the manifest entry           public/data/pinyin.json
//   - the Polly synthesis input    <phoneme alphabet="x-amazon-pinyin" ph="wo3">
// Amazon's x-amazon-pinyin alphabet uses tones 0-4 with 0 for neutral, so
// aligning on Polly's convention removes a translation layer at build time.
//
// pinyin-pro is the only producer of the raw input, but which digit IT uses
// for neutral tone is version-dependent (5 in some releases, absent in
// others), so both are accepted and folded to 0 here rather than at the call
// site. Tone 5 as a DISTINCT tone does not exist in Mandarin -- unlike
// Cantonese, where 5 is a real tone -- so this fold is unambiguous.
const TONED = /^([a-z]+)([0-5]?)$/

export function normalizePinyinSyllable(raw: string): string | null {
  const s = raw
    .trim()
    .toLowerCase()
    // ü appears as ü, u:, or v depending on the producer. Polly wants v.
    .replace(/ü/g, 'v')
    .replace(/u:/g, 'v')
  if (!s) return null

  const m = TONED.exec(s)
  if (!m) return null

  const [, letters, digit] = m
  // '' (no digit) and '5' both mean neutral -> 0.
  const tone = digit === '' || digit === '5' ? '0' : digit
  return `${letters}${tone}`
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lang/pinyin-syllable.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 7: Add a test asserting the real engine agrees**

Append to `src/lang/pinyin-syllable.test.ts`:

```ts
import { pinyin } from 'pinyin-pro'

describe('normalizePinyinSyllable against pinyin-pro itself', () => {
  it('canonicalizes every syllable the engine emits for a synthetic phrase', () => {
    const raw = pinyin('你好嗎天空的', { toneType: 'num', type: 'array' }) as string[]
    const out = raw.map(normalizePinyinSyllable)
    expect(out.every((s) => s !== null)).toBe(true)
    expect(out.every((s) => /^[a-z]+[0-4]$/.test(s as string))).toBe(true)
  })
})
```

- [ ] **Step 8: Run and commit**

Run: `npx vitest run src/lang/pinyin-syllable.test.ts`
Expected: PASS (8 tests)

```bash
git add package.json package-lock.json src/lang/pinyin-syllable.ts src/lang/pinyin-syllable.test.ts
git commit -m "feat(lang): add pinyin-pro and the canonical syllable normalizer"
```

---

### Task 2: Tone-numbered pinyin → tone-marked pinyin

**Files:**
- Create: `src/lang/tone-mark.ts`
- Test: `src/lang/tone-mark.test.ts`

**Interfaces:**
- Consumes: nothing (operates on the canonical key from Task 1)
- Produces: `numToMark(syllable: string): string` — `wo3` → `wǒ`. Returns the input unchanged if it is not a canonical key.

- [ ] **Step 1: Write the failing test**

Create `src/lang/tone-mark.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { numToMark } from './tone-mark'

describe('numToMark', () => {
  it('places the mark on the sole vowel', () => {
    expect(numToMark('wo3')).toBe('wǒ')
    expect(numToMark('ma1')).toBe('mā')
    expect(numToMark('ni3')).toBe('nǐ')
  })

  it('strips the digit for neutral tone', () => {
    expect(numToMark('de0')).toBe('de')
  })

  it('prefers a or e when present', () => {
    expect(numToMark('hao3')).toBe('hǎo')   // a, not o
    expect(numToMark('tian1')).toBe('tiān') // a, not i
    expect(numToMark('xie4')).toBe('xiè')   // e, not i
  })

  it('marks the o of ou', () => {
    expect(numToMark('zhou1')).toBe('zhōu')
  })

  it('marks the SECOND vowel otherwise', () => {
    // The standard rule: with no a/e/ou, the mark goes on the last vowel.
    expect(numToMark('liu2')).toBe('liú')
    expect(numToMark('gui4')).toBe('guì')
  })

  it('renders v as ü', () => {
    expect(numToMark('lv4')).toBe('lǜ')
    expect(numToMark('nv3')).toBe('nǚ')
  })

  it('handles the syllabic interjections with no standard vowel', () => {
    expect(numToMark('n2')).toBe('n2')   // unmarkable, passed through
    expect(numToMark('hm0')).toBe('hm')  // neutral: digit still dropped
  })

  it('passes through anything that is not a canonical key', () => {
    expect(numToMark('ngo5')).toBe('ngo5') // a Jyutping syllable, not ours
    expect(numToMark('')).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lang/tone-mark.test.ts`
Expected: FAIL — cannot resolve `./tone-mark`

- [ ] **Step 3: Write the implementation**

Create `src/lang/tone-mark.ts`:

```ts
// Tone-numbered pinyin (the canonical key, see pinyin-syllable.ts) rendered
// with diacritics for display: wo3 -> wǒ. This is the Mandarin analogue of
// romanize/yale.ts, and like it, it is display-only -- the numbered form
// remains the audio key and is never derived back from the marked form.
const MARKS: Record<string, string[]> = {
  //         tone: 1    2    3    4
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  v: ['ǜ', 'ǘ', 'ǚ', 'ǜ'], // placeholder row, replaced below
}
// ü's four marked forms don't follow the same table shape as the plain vowels,
// so they are spelled out rather than derived.
MARKS.v = ['ǖ', 'ǘ', 'ǚ', 'ǜ']

const CANONICAL = /^([a-z]+)([0-4])$/

/**
 * Which vowel carries the mark, per the standard rule:
 *   1. an `a` or `e` if present (never both in one syllable)
 *   2. otherwise the `o` of `ou`
 *   3. otherwise the LAST vowel
 * Returns -1 when the syllable has no vowel at all (syllabic n, hm, ng).
 */
function markIndex(letters: string): number {
  const a = letters.indexOf('a')
  if (a >= 0) return a
  const e = letters.indexOf('e')
  if (e >= 0) return e
  const ou = letters.indexOf('ou')
  if (ou >= 0) return ou
  for (let i = letters.length - 1; i >= 0; i--) {
    if ('aeiouv'.includes(letters[i])) return i
  }
  return -1
}

export function numToMark(syllable: string): string {
  const m = CANONICAL.exec(syllable)
  if (!m) return syllable

  const [, letters, tone] = m
  const plain = letters.replace(/v/g, 'ü')

  // Neutral tone carries no diacritic -- just drop the digit.
  if (tone === '0') return plain

  const i = markIndex(letters)
  if (i < 0) return syllable // nothing to mark; keep the digit rather than lie

  const marked = MARKS[letters[i]][Number(tone) - 1]
  return (letters.slice(0, i) + marked + letters.slice(i + 1)).replace(/v/g, 'ü')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lang/tone-mark.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lang/tone-mark.ts src/lang/tone-mark.test.ts
git commit -m "feat(lang): render tone-numbered pinyin with diacritics"
```

---

### Task 3: LanguagePack interfaces and the Cantonese pack

**Files:**
- Create: `src/lang/types.ts`, `src/lang/yue.ts`
- Test: `src/lang/yue.test.ts`

**Interfaces:**
- Consumes: `annotateLine`, `SegmentOptions` from `src/annotate`; `toYale` from `src/romanize/yale`; `Token`, `Syllable` from `src/types`
- Produces:
  - `type LangId = 'yue' | 'cmn'`
  - `interface RomanizationStyle { id: string; label: string; render(s: Syllable): string }`
  - `interface LanguagePack { id: LangId; label: string; annotate(line: string, opts: SegmentOptions): Token[]; romanizations: RomanizationStyle[]; audioDir: string; manifest: string }`
  - `yuePack: LanguagePack`

- [ ] **Step 1: Write the failing test**

Create `src/lang/yue.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { yuePack } from './yue'

const OPTS = { words: new Set<string>(['天空']), maxWordLength: 2 }

describe('yuePack', () => {
  it('identifies itself', () => {
    expect(yuePack.id).toBe('yue')
    expect(yuePack.audioDir).toBe('audio/syl')
    expect(yuePack.manifest).toBe('data/syllables.json')
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lang/yue.test.ts`
Expected: FAIL — cannot resolve `./yue`

- [ ] **Step 3: Write the interfaces**

Create `src/lang/types.ts`:

```ts
import type { SegmentOptions } from '../annotate'
import type { LangId, Syllable, Token } from '../types'

// LangId is DEFINED in src/types.ts, not here, and re-exported for
// convenience. Defining it here instead would make src/types.ts import from
// src/lang/types.ts while this file imports Token back from src/types.ts --
// a circular import. It would survive compilation (both sides are type-only
// and therefore erased) but it is a trap for the first person to add a
// runtime value to either file.
export type { LangId }

export interface RomanizationStyle {
  /** Persisted in Settings, so it must stay stable across releases. */
  id: string
  label: string
  render(syllable: Syllable): string
}

/**
 * Everything that differs between the two languages, in one object.
 *
 * The point of this boundary: LyricView, LyricLine, Transport and player/
 * depend ONLY on this interface and never learn which language they are
 * rendering. The per-song language toggle is therefore a swap of this object,
 * not a conditional threaded through five modules.
 *
 * Both languages happen to share some syllable spellings (`sin1` is valid
 * Jyutping AND valid pinyin), but they can never collide because each pack
 * carries its own audioDir and manifest.
 */
export interface LanguagePack {
  id: LangId
  /** Shown on the toggle: 粵語 / 普通話 */
  label: string
  /**
   * Annotate ONE WHOLE UNBROKEN SOURCE LINE. Never call with a wrapped
   * display fragment -- both engines are greedy longest-match, so a break
   * inside a word silently changes the reading.
   */
  annotate(line: string, opts: SegmentOptions): Token[]
  /** First entry is the default for a user who has never chosen. */
  romanizations: RomanizationStyle[]
  /** Relative to BASE_URL, no trailing slash. */
  audioDir: string
  /** Relative to BASE_URL. */
  manifest: string
  /**
   * Which script this pack's annotator REQUIRES. The caller converts the line
   * to this script before calling annotate().
   *
   * to-jyutping fails silently on Simplified mergers, so Cantonese needs
   * 'trad'. pinyin-pro's polyphone dictionary is Simplified-keyed and falls
   * back to default per-character readings on Traditional input (銀行 ->
   * yin2 xing2 instead of hang2; 音樂 -> yin1 le4 instead of yue4), so
   * Mandarin needs 'simp'. Accepted consequence: a Traditional lyric read as
   * Mandarin is DISPLAYED in Simplified.
   */
  script: 'trad' | 'simp'
}
```

- [ ] **Step 4: Write the Cantonese pack**

Create `src/lang/yue.ts`:

```ts
import { annotateLine } from '../annotate'
import { toYale } from '../romanize/yale'
import type { LanguagePack } from './types'

// A thin adapter over code that already existed and is deliberately NOT
// modified: annotate/index.ts and romanize/yale.ts stay exactly as they were,
// so this pack cannot regress Cantonese behaviour.
export const yuePack: LanguagePack = {
  id: 'yue',
  label: '粵語',
  annotate: annotateLine,
  romanizations: [
    { id: 'jyutping', label: 'Jyutping — tone numbers (ngo5)', render: (s) => s },
    { id: 'yale', label: 'Yale — tone marks (ngóh)', render: toYale },
  ],
  audioDir: 'audio/syl',
  manifest: 'data/syllables.json',
  script: 'trad',
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lang/yue.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lang/types.ts src/lang/yue.ts src/lang/yue.test.ts
git commit -m "feat(lang): LanguagePack interface and the Cantonese pack"
```

---

### Task 4: The Mandarin pack

**Files:**
- Create: `src/lang/cmn.ts`
- Test: `src/lang/cmn.test.ts`

**Interfaces:**
- Consumes: `normalizePinyinSyllable` (Task 1), `numToMark` (Task 2), `LanguagePack` (Task 3)
- Produces: `cmnPack: LanguagePack`

**Critical alignment requirement:** `annotate` must return one `Char` per input character, in order, including punctuation and Latin (with `syllables: []`) — because `LyricLine` indexes characters flatly and the player highlights by that index. Use pinyin-pro's `type: 'all'` mode, which yields one entry per input character carrying `origin` and `isZh`. **If Task 1's probe showed a different shape, adapt this step and say so in your report rather than forcing the code below.**

- [ ] **Step 1: Write the failing test**

Create `src/lang/cmn.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lang/cmn.test.ts`
Expected: FAIL — cannot resolve `./cmn`

- [ ] **Step 3: Write the implementation**

Create `src/lang/cmn.ts`:

```ts
import { pinyin } from 'pinyin-pro'
import type { SegmentOptions } from '../annotate'
import type { Char, Token } from '../types'
import { normalizePinyinSyllable } from './pinyin-syllable'
import { numToMark } from './tone-mark'
import type { LanguagePack } from './types'

// One entry per INPUT CHARACTER, in order. pinyin-pro's `type: 'all'` mode is
// the only one that guarantees this -- `type: 'array'` drops or merges
// non-Chinese runs depending on the nonZh option, which would desynchronise
// the flat character index that LyricLine and the player both rely on.
interface PinyinAll {
  origin: string
  pinyin: string
  isZh: boolean
}

function toChars(line: string): Char[] {
  const entries = pinyin(line, {
    type: 'all',
    toneType: 'num',
    nonZh: 'consecutive',
  }) as unknown as PinyinAll[]

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
  const chars = toChars(line)

  const tokens: Token[] = []
  let i = 0
  while (i < chars.length) {
    let len = 1
    for (let n = Math.min(opts.maxWordLength, chars.length - i); n >= 2; n--) {
      const candidate = chars.slice(i, i + n).map((c) => c.char).join('')
      if (opts.words.has(candidate)) {
        len = n
        break
      }
    }
    tokens.push({ chars: chars.slice(i, i + len) })
    i += len
  }
  return tokens
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lang/cmn.test.ts`
Expected: PASS (8 tests)

If the polyphone test fails because pinyin-pro returns the same reading for both, **do not delete the test** — report it. It means the engine is not resolving from context, which changes the value proposition and must be raised, not hidden.

- [ ] **Step 5: Commit**

```bash
git add src/lang/cmn.ts src/lang/cmn.test.ts
git commit -m "feat(lang): the Mandarin pack, pinyin via pinyin-pro"
```

---

### Task 5: Lazy pack loader

**Files:**
- Create: `src/lang/index.ts`
- Test: `src/lang/index.test.ts`

**Interfaces:**
- Consumes: `yuePack` (Task 3), `cmnPack` (Task 4), `LangId`/`LanguagePack` (Task 3)
- Produces:
  - `getPack(id: LangId): Promise<LanguagePack>` — `yue` resolves synchronously-ish from the static import; `cmn` is a lazy `import()` so pinyin-pro is a separate chunk.
  - `renderSyllable(pack: LanguagePack, styleId: string, s: Syllable): string` — falls back to the pack's first style when `styleId` is unknown.
  - Re-exports `LangId`, `LanguagePack`, `RomanizationStyle`, `yuePack`.

- [ ] **Step 1: Write the failing test**

Create `src/lang/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getPack, renderSyllable, yuePack } from './index'

describe('getPack', () => {
  it('returns the Cantonese pack', async () => {
    expect((await getPack('yue')).id).toBe('yue')
  })

  it('lazily returns the Mandarin pack', async () => {
    expect((await getPack('cmn')).id).toBe('cmn')
  })

  it('returns the same instance on repeat calls, so packs are not rebuilt', async () => {
    expect(await getPack('cmn')).toBe(await getPack('cmn'))
  })
})

describe('renderSyllable', () => {
  it('uses the named style', () => {
    expect(renderSyllable(yuePack, 'yale', 'ngo5')).toBe('ngóh')
    expect(renderSyllable(yuePack, 'jyutping', 'ngo5')).toBe('ngo5')
  })

  it('falls back to the first style for an unknown id', () => {
    // A stale Settings value (e.g. 'tonemark' persisted while Mandarin was
    // active, then read back under the Cantonese pack) must not crash.
    expect(renderSyllable(yuePack, 'tonemark', 'ngo5')).toBe('ngo5')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lang/index.test.ts`
Expected: FAIL — cannot resolve `./index`

- [ ] **Step 3: Write the implementation**

Create `src/lang/index.ts`:

```ts
import type { Syllable } from '../types'
import type { LangId, LanguagePack } from './types'
import { yuePack } from './yue'

export type { LangId, LanguagePack, RomanizationStyle } from './types'
export { yuePack }

// The Mandarin pack pulls in pinyin-pro, so it is a lazy chunk: a user who
// only ever opens Cantonese songs never downloads it. Same pattern opencc-js
// already uses in src/script/index.ts.
//
// Memoised on the PROMISE, not the resolved pack, so two concurrent callers
// share one import() instead of racing. Cleared on failure so a transient
// offline blip doesn't permanently strand the language toggle -- the same
// not-memoised-on-failure rule as src/dict/index.ts and the audio manifest.
let cmnPromise: Promise<LanguagePack> | null = null

export function getPack(id: LangId): Promise<LanguagePack> {
  if (id === 'yue') return Promise.resolve(yuePack)
  cmnPromise ??= import('./cmn')
    .then((m) => m.cmnPack)
    .catch((err) => {
      cmnPromise = null
      throw err
    })
  return cmnPromise
}

/**
 * Render one syllable in the user's chosen style for this pack.
 *
 * Settings persists a style id per language, but a stale or hand-edited value
 * can name a style the current pack doesn't have. Falling back to the pack's
 * first style keeps the lyric readable instead of throwing mid-render.
 */
export function renderSyllable(pack: LanguagePack, styleId: string, s: Syllable): string {
  const style = pack.romanizations.find((r) => r.id === styleId) ?? pack.romanizations[0]
  return style.render(s)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lang/index.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lang/index.ts src/lang/index.test.ts
git commit -m "feat(lang): lazy pack loader and style-aware syllable rendering"
```

---

### Task 6: Parameterize the audio engine

`src/audio/index.ts` hardcodes `data/syllables.json` (line 65) and `audio/syl/` (line 104). Both move into options so one engine implementation serves both languages.

**Files:**
- Modify: `src/audio/index.ts`
- Test: `src/audio/index.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new
- Produces: `createAudioEngine(ctx: BaseAudioContext, opts?: { dir?: string; manifest?: string; lruMax?: number }): AudioEngine`. Defaults are `'audio/syl'` and `'data/syllables.json'`, so every existing call site keeps working unchanged.

- [ ] **Step 1: Write the failing test**

Append to `src/audio/index.test.ts`:

```ts
describe('createAudioEngine directory and manifest options', () => {
  it('defaults to the Cantonese bank', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ['ngo5'] })
    vi.stubGlobal('fetch', fetchMock)

    const engine = createAudioEngine(new AudioContext())
    await engine.preloadManifest()

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('data/syllables.json'))
  })

  it('fetches the manifest named in options', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ['wo3'] })
    vi.stubGlobal('fetch', fetchMock)

    const engine = createAudioEngine(new AudioContext(), {
      dir: 'audio/pin',
      manifest: 'data/pinyin.json',
    })
    await engine.preloadManifest()

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('data/pinyin.json'))
    expect(engine.has('wo3')).toBe(true)
  })

  it('loads clips from the directory named in options', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      url.includes('.json')
        ? Promise.resolve({ ok: true, json: async () => ['wo3'] })
        : Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const ctx = new AudioContext()
    const engine = createAudioEngine(ctx, { dir: 'audio/pin', manifest: 'data/pinyin.json' })
    await engine.preloadManifest()
    await engine.load('wo3')

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('audio/pin/wo3.mp3'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/audio/index.test.ts`
Expected: FAIL — the second and third tests still request `data/syllables.json` / `audio/syl/`

- [ ] **Step 3: Modify the implementation**

In `src/audio/index.ts`, change the signature and the two hardcoded paths:

```ts
export function createAudioEngine(
  ctx: BaseAudioContext,
  opts: { dir?: string; manifest?: string; lruMax?: number } = {},
): AudioEngine {
  const base = import.meta.env.BASE_URL
  const lruMax = opts.lruMax ?? LRU_MAX
  // Defaulted to the Cantonese bank so every existing call site -- and every
  // existing test -- keeps working without opting in. The Mandarin pack
  // supplies its own pair via LanguagePack.audioDir / .manifest.
  const dir = opts.dir ?? 'audio/syl'
  const manifest = opts.manifest ?? 'data/syllables.json'
```

Then replace line 65's fetch URL:

```ts
    manifestPromise ??= fetch(`${base}${manifest}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${manifest} -> HTTP ${r.status}`)
```

And line 104's:

```ts
        p = fetch(`${base}${dir}/${s}.mp3`)
```

- [ ] **Step 4: Run the full audio suite**

Run: `npx vitest run src/audio/index.test.ts`
Expected: PASS — all pre-existing tests plus the 3 new ones

- [ ] **Step 5: Commit**

```bash
git add src/audio/index.ts src/audio/index.test.ts
git commit -m "feat(audio): parameterize clip directory and manifest path"
```

---

### Task 7: Genre → language lookup

**Files:**
- Create: `src/search/genre.ts`
- Modify: `src/types.ts`
- Test: `src/search/genre.test.ts`

**Interfaces:**
- Consumes: `LangId` (Task 3)
- Produces:
  - `guessLang(genre: string | undefined): LangId | undefined`
  - `SongCandidate` gains `genre?: string` and `langGuess?: LangId`

- [ ] **Step 1: Write the failing test**

Create `src/search/genre.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { guessLang } from './genre'

describe('guessLang', () => {
  it('recognises the HK storefront vocabulary', () => {
    expect(guessLang('廣東歌/香港流行樂')).toBe('yue')
    expect(guessLang('國語流行樂')).toBe('cmn')
  })

  it('recognises the TW storefront vocabulary', () => {
    expect(guessLang('粵語流行樂')).toBe('yue')
    expect(guessLang('華語流行樂')).toBe('cmn')
    expect(guessLang('華語音樂')).toBe('cmn')
  })

  it('returns undefined for genres that say nothing about language', () => {
    for (const g of ['流行樂', '世界音樂', '器樂', '演奏曲', '新世紀', 'Pop', 'K-Pop']) {
      expect(guessLang(g)).toBeUndefined()
    }
  })

  it('returns undefined for missing or empty input', () => {
    expect(guessLang(undefined)).toBeUndefined()
    expect(guessLang('')).toBeUndefined()
  })

  it('tolerates surrounding whitespace', () => {
    expect(guessLang('  粵語流行樂 ')).toBe('yue')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/search/genre.test.ts`
Expected: FAIL — cannot resolve `./genre`

- [ ] **Step 3: Write the implementation**

Create `src/search/genre.ts`:

```ts
// Imported from '../types', NOT from '../lang' -- importing the barrel would
// drag yuePack (and therefore to-jyutping) into the search module for the
// sake of one type.
import type { LangId } from '../types'

// Lyrics cannot reveal the language: Cantopop is written in 書面語 and is
// character-identical to Mandarin. Measured on four Cantopop songs -- ZERO
// Cantonese-specific characters (嘅 喺 唔 佢 咗 …) across 1,744 Han
// characters. So the guess has to come from metadata.
//
// Apple's primaryGenreName is the usable signal, and crucially it is
// PER-TRACK, which is what makes bilingual artists (陳奕迅, 鄧紫棋, 張學友)
// resolve correctly -- their Cantonese recordings come back 廣東歌 and their
// Mandarin ones 國語流行樂.
//
// The vocabulary is LOCALIZED PER STOREFRONT: HK and TW use different strings
// for the same concept, so both are listed. This is deliberately a data table
// and not logic -- adding a storefront later means extending the table only.
const GENRE_LANG: Record<string, LangId> = {
  // HK storefront
  '廣東歌/香港流行樂': 'yue',
  '國語流行樂': 'cmn',
  // TW storefront
  '粵語流行樂': 'yue',
  '華語流行樂': 'cmn',
  '華語音樂': 'cmn',
}

/**
 * Undefined means "this genre says nothing about language" -- 流行樂,
 * 世界音樂, 器樂 and friends. Returning undefined rather than defaulting here
 * keeps the fallback decision at the call site, where it belongs.
 */
export function guessLang(genre: string | undefined): LangId | undefined {
  if (!genre) return undefined
  return GENRE_LANG[genre.trim()]
}
```

- [ ] **Step 4: Extend `SongCandidate`**

In `src/types.ts`, define `LangId` at the top — it lives here, not in
`src/lang/types.ts`, so that nothing in `src/lang/` has to be imported by the
shared types module (see Task 3's note on the circular import):

```ts
/** The two supported reading systems. Defined here rather than in
 *  src/lang/types.ts so the shared types module has no dependency on the
 *  language packs; src/lang/types.ts re-exports it. */
export type LangId = 'yue' | 'cmn'
```

Then add two fields to `SongCandidate`:

```ts
export interface SongCandidate {
  title: string
  artist: string
  album?: string
  durationSec?: number
  /** iTunes primaryGenreName, verbatim and localized. Kept so the guess can
   *  be re-derived or debugged without another network call. */
  genre?: string
  /** Seeds the language toggle. Undefined when the genre is uninformative. */
  langGuess?: LangId
}
```

**Do NOT add `lang` to `Song` in this task.** Making it required here breaks
`tsc` immediately: `Song` is constructed at `src/App.tsx:196` and
`src/storage/index.test.ts:49`, and neither is rewritten until Tasks 10 and 13.

Deferred to **Task 13**, which rewrites `App.tsx`. By then Task 10 has replaced
the cached `Song` with `CachedLyric`, so Task 13 must first decide whether
`Song` still has any constructor at all — if nothing builds one, delete the
interface as dead code rather than adding a field to it.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/search/genre.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/search/genre.ts src/search/genre.test.ts src/types.ts
git commit -m "feat(search): derive a language guess from iTunes genre metadata"
```

---

### Task 8: HK + TW storefront fan-out

**Files:**
- Modify: `src/search/itunes.ts`, `src/search/index.ts`
- Test: `src/search/index.test.ts` (extend), `src/search/contract.live.test.ts` (extend)

**Interfaces:**
- Consumes: `guessLang` (Task 7)
- Produces: `searchItunes(term: string, country: string): Promise<SongCandidate[]>`; `searchSongs` unchanged in signature but results now carry `genre`/`langGuess`.

**Why US is dropped:** measured across seven titles, `HK ∪ TW` gave 165 distinct `title|artist` rows and US appeared to add 134 more — but those additions are the *same recordings* under romanized metadata (`浮誇 | Eason Chan` beside HK's `浮誇 | 陳奕迅`). `dedupeKey()` folds Traditional↔Simplified but cannot fold 陳奕迅↔Eason Chan, so US would add duplicate rows, not songs.

- [ ] **Step 1: Write the failing test**

Append to `src/search/index.test.ts`:

```ts
describe('storefront fan-out', () => {
  it('queries HK and TW for every script variant', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      seen.push(url)
      return { ok: true, json: async () => ({ results: [] }) }
    }))

    // 浮誇 is Traditional and HAS a distinct Simplified form (浮夸), so
    // scriptVariants yields TWO variants -- 2 variants x 2 storefronts = 4
    // requests. Do not "simplify" this to 1 each; that expectation is wrong.
    await searchSongs('浮誇')

    expect(seen.filter((u) => u.includes('country=HK'))).toHaveLength(2)
    expect(seen.filter((u) => u.includes('country=TW'))).toHaveLength(2)
    expect(seen.filter((u) => u.includes('country=US'))).toHaveLength(0)
  })

  it('carries the genre through and derives a guess', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [{ trackName: '浮誇', artistName: '陳奕迅', primaryGenreName: '廣東歌/香港流行樂' }],
      }),
    })))

    const [song] = await searchSongs('浮誇')

    expect(song.genre).toBe('廣東歌/香港流行樂')
    expect(song.langGuess).toBe('yue')
  })

  it('prefers a defined langGuess when merging duplicate rows', async () => {
    // HK labels it 廣東歌/香港流行樂; TW returns the same recording tagged with
    // an uninformative genre. The merged row must keep the resolved guess.
    let call = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      call++
      return {
        ok: true,
        json: async () => ({
          results: [{
            trackName: '浮誇',
            artistName: '陳奕迅',
            primaryGenreName: call === 1 ? '流行樂' : '廣東歌/香港流行樂',
          }],
        }),
      }
    }))

    const merged = await searchSongs('浮誇')

    expect(merged).toHaveLength(1)
    expect(merged[0].langGuess).toBe('yue')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/search/index.test.ts`
Expected: FAIL — no `country=` in any URL

- [ ] **Step 3: Add the country parameter to itunes.ts**

Replace the body of `src/search/itunes.ts`:

```ts
import type { SongCandidate } from '../types'
import { guessLang } from './genre'

// No API key, origin-reflected CORS. Undocumented SLA and roughly 20 req/min,
// so callers must debounce.
//
// `country` is REQUIRED, never defaulted. Apple's default is the US store,
// which returns English-TRANSLATED metadata for Chinese songs (晴天 comes back
// as "Sunny Day — Jay Chou"), and that degrades the downstream LRCLIB lookup
// badly: measured 4 hits for "Sunny Day / Jay Chou" against 20 for
// "晴天 / 周杰倫". Making the parameter mandatory means no call site can
// silently reintroduce that default.
export async function searchItunes(term: string, country: string): Promise<SongCandidate[]> {
  const url =
    `https://itunes.apple.com/search?media=music&limit=25&country=${encodeURIComponent(country)}` +
    `&term=${encodeURIComponent(term)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`itunes -> HTTP ${res.status}`)
  const data = await res.json()
  return (data.results ?? []).map((r: Record<string, unknown>) => {
    const genre = r.primaryGenreName ? String(r.primaryGenreName) : undefined
    return {
      title: String(r.trackName ?? ''),
      artist: String(r.artistName ?? ''),
      album: r.collectionName ? String(r.collectionName) : undefined,
      durationSec: r.trackTimeMillis ? Math.round(Number(r.trackTimeMillis) / 1000) : undefined,
      genre,
      langGuess: guessLang(genre),
    }
  })
}
```

- [ ] **Step 4: Fan out in search/index.ts**

In `src/search/index.ts`, add the constant above `searchSongs`:

```ts
// HK and TW only. Both return native Chinese metadata, and between them they
// cover the catalogue. US is deliberately excluded -- see the plan's Task 8
// note: its apparent extra results are the same recordings under romanized
// metadata that dedupeKey() cannot collapse, so including it would fill the
// picker with duplicate rows.
const STOREFRONTS = ['HK', 'TW'] as const
```

Replace the `batches` computation with a fan-out over both dimensions:

```ts
  const jobs = variants.flatMap((v) => STOREFRONTS.map((c) => ({ v, c })))

  // The LRCLIB fallback is keyed by SCRIPT VARIANT, not by job. Both the HK
  // and TW jobs for one variant would otherwise issue the identical
  // lrclibSearch(v) request -- and they fail together precisely when iTunes
  // is down as a whole, which is exactly when doubling load on LRCLIB is most
  // likely to trip its rate limiter. Sharing the promise makes the fallback
  // fire once per variant no matter how many storefronts fan out over it.
  const fallbacks = new Map<string, Promise<SongCandidate[]>>()
  const fallbackFor = (v: string) => {
    let p = fallbacks.get(v)
    if (!p) {
      p = lrclibSearch(v)
      fallbacks.set(v, p)
    }
    return p
  }

  const batches = await Promise.all(
    jobs.map(async ({ v, c }) => {
      try {
        return await searchItunes(v, c)
      } catch (err) {
        // Defensive: searchItunes never actually throws RateLimitError today
        // (it only talks to iTunes, never LRCLIB), but if that ever changes,
        // a rate limit must still surface rather than be treated as "iTunes
        // is down, fall back to LRCLIB".
        if (err instanceof RateLimitError) throw err
        try {
          return await fallbackFor(v) // tier-1 fallback, shared per variant
        } catch (fallbackErr) {
          // A 429 here is not an ordinary "this variant failed" -- there is
          // no server-side fallback beyond LRCLIB, so a rate limit must
          // reach the UI (which can tell the user to retry in N seconds)
          // instead of being swallowed into an empty, look-alike "no
          // results" response.
          if (fallbackErr instanceof RateLimitError) throw fallbackErr
          return []
        }
      }
    }),
  )
```

- [ ] **Step 5: Make the merge prefer a resolved guess**

Still in `src/search/index.ts`, replace the merge loop:

```ts
  const merged = new Map<string, SongCandidate>()
  for (const [k, c] of keyed) {
    const existing = merged.get(k)
    if (!existing) {
      merged.set(k, c)
      continue
    }
    // HK and TW label the same recording differently (廣東歌/香港流行樂 vs
    // 粵語流行樂), and one storefront may tag it with an uninformative genre
    // while the other is specific. Blind first-wins would throw away a
    // resolved guess purely because of request ordering.
    if (existing.langGuess === undefined && c.langGuess !== undefined) {
      merged.set(k, { ...existing, genre: c.genre, langGuess: c.langGuess })
    }
  }
  return [...merged.values()]
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/search/index.test.ts`
Expected: PASS — all pre-existing tests plus the 3 new ones. If a pre-existing test asserted a call count, update it to reflect 2 storefronts.

- [ ] **Step 7: Extend the live contract test**

Append to `src/search/contract.live.test.ts`:

```ts
it('the HK storefront returns Chinese metadata, not English', async () => {
  const results = await searchItunes('晴天', 'HK')
  const top = results.slice(0, 5)
  // The whole reason US is dropped: it returns "Sunny Day — Jay Chou" here.
  expect(top.some((r) => r.title.includes('晴天'))).toBe(true)
  expect(top.some((r) => r.artist.includes('周杰倫'))).toBe(true)
}, 20_000)

it('genre metadata still distinguishes the two languages', async () => {
  const cantonese = await searchItunes('富士山下', 'HK')
  const mandarin = await searchItunes('告白氣球', 'HK')
  expect(cantonese.some((r) => r.langGuess === 'yue')).toBe(true)
  expect(mandarin.some((r) => r.langGuess === 'cmn')).toBe(true)
}, 20_000)
```

- [ ] **Step 8: Run the live test and commit**

Run: `npm run test:live`
Expected: PASS. If Apple has changed the genre vocabulary, **report it** — the table in `genre.ts` needs updating, and that is a real finding, not a test to relax.

```bash
git add src/search/itunes.ts src/search/index.ts src/search/index.test.ts src/search/contract.live.test.ts
git commit -m "feat(search): fan out across HK and TW storefronts, carry genre through"
```

---

### Task 9: Per-language romanization settings, with migration

**Files:**
- Modify: `src/storage/index.ts`
- Test: `src/storage/index.test.ts` (extend)

**Interfaces:**
- Consumes: `LangId` (Task 3)
- Produces: `Settings.romanization: { yue: string; cmn: string }`; `DEFAULT_SETTINGS.romanization` is `{ yue: 'jyutping', cmn: 'tonemark' }`.

Existing users have `"romanization":"jyutping"` (a bare string) in localStorage. That must migrate, not reset.

- [ ] **Step 1: Write the failing test**

Append to `src/storage/index.test.ts`:

```ts
describe('romanization settings migration', () => {
  it('defaults to Jyutping and tone marks', () => {
    localStorage.clear()
    expect(loadSettings().romanization).toEqual({ yue: 'jyutping', cmn: 'tonemark' })
  })

  it('migrates a legacy flat string, preserving the choice', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ romanization: 'yale' }))
    expect(loadSettings().romanization).toEqual({ yue: 'yale', cmn: 'tonemark' })
  })

  it('migrates a legacy jyutping string', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ romanization: 'jyutping' }))
    expect(loadSettings().romanization).toEqual({ yue: 'jyutping', cmn: 'tonemark' })
  })

  it('reads the new shape back unchanged', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      romanization: { yue: 'yale', cmn: 'tonenum' },
    }))
    expect(loadSettings().romanization).toEqual({ yue: 'yale', cmn: 'tonenum' })
  })

  it('falls back per-language on an unrecognised style id', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      romanization: { yue: 'bogus', cmn: 'bogus' },
    }))
    expect(loadSettings().romanization).toEqual({ yue: 'jyutping', cmn: 'tonemark' })
  })

  it('survives a completely malformed value', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ romanization: 42 }))
    expect(loadSettings().romanization).toEqual({ yue: 'jyutping', cmn: 'tonemark' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/storage/index.test.ts`
Expected: FAIL — `romanization` is still a string

- [ ] **Step 3: Modify the implementation**

In `src/storage/index.ts`, replace the `Settings` interface, defaults, and the `romanization` line of `loadSettings`:

```ts
export interface RomanizationChoice {
  /** A RomanizationStyle id from the Cantonese pack: 'jyutping' | 'yale' */
  yue: string
  /** A RomanizationStyle id from the Mandarin pack: 'tonemark' | 'tonenum' */
  cmn: string
}

export interface Settings {
  interLineGapSec: number
  romanization: RomanizationChoice
  rubyPosition: 'over' | 'under'
  theme: Theme
}

const YUE_STYLES = ['jyutping', 'yale']
const CMN_STYLES = ['tonemark', 'tonenum']

export const DEFAULT_SETTINGS: Settings = {
  interLineGapSec: 1.0,
  romanization: { yue: 'jyutping', cmn: 'tonemark' },
  rubyPosition: 'over',
  // 'system' rather than 'light': a study tool gets used late at night, and
  // following the OS is the least surprising default.
  theme: 'system',
}

/**
 * Accepts three shapes and always yields a valid choice:
 *   - the CURRENT object form
 *   - the LEGACY flat string ('jyutping' | 'yale'), written by every release
 *     before Mandarin support -- migrated, never discarded, so a user who
 *     picked Yale keeps Yale
 *   - anything else -> defaults
 */
function readRomanization(raw: unknown): RomanizationChoice {
  const d = DEFAULT_SETTINGS.romanization

  if (typeof raw === 'string') {
    return { yue: YUE_STYLES.includes(raw) ? raw : d.yue, cmn: d.cmn }
  }
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const r = raw as Partial<RomanizationChoice>
    return {
      yue: typeof r.yue === 'string' && YUE_STYLES.includes(r.yue) ? r.yue : d.yue,
      cmn: typeof r.cmn === 'string' && CMN_STYLES.includes(r.cmn) ? r.cmn : d.cmn,
    }
  }
  return d
}
```

Then in `loadSettings`, replace the `romanization:` line with:

```ts
      romanization: readRomanization(p.romanization),
```

and change `const p = parsed as Partial<Settings>` to `const p = parsed as Record<string, unknown>`, adjusting the other reads to cast as before (`Number(p.interLineGapSec ?? …)` already works; `p.rubyPosition` and `p.theme` compare against string literals, which is still valid).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/storage/index.test.ts`
Expected: PASS — pre-existing tests plus the 6 new ones. Pre-existing tests that assert `romanization: 'jyutping'` must be updated to the object form.

- [ ] **Step 5: Commit**

```bash
git add src/storage/index.ts src/storage/index.test.ts
git commit -m "feat(storage): per-language romanization with legacy migration"
```

---

### Task 10: Cache raw lyrics, not annotations (IndexedDB v2)

The cache currently stores a fully annotated `Song` with Jyutping baked into every token, so flipping the language toggle would leave every cached syllable wrong. Store the raw lines instead and annotate at render.

**Files:**
- Modify: `src/storage/index.ts`
- Test: `src/storage/index.test.ts` (extend)

**Interfaces:**
- Consumes: `SourceLine` from `src/lyrics/parse`, `LangId` (Task 3)
- Produces:
  - `interface CachedLyric { lrclibId: number; title: string; artist: string; raw: SourceLine[]; langGuess?: LangId }`
  - `cacheLyric(rec: CachedLyric): Promise<void>`
  - `getCachedLyric(id: number): Promise<CachedLyric | null>`
  - `getCachedLyricByTitleArtist(title: string, artist: string): Promise<CachedLyric | null>`
  - `cacheSong`, `getCachedSong`, `getCachedSongByTitleArtist` are **removed**.

- [ ] **Step 1: Write the failing test**

Append to `src/storage/index.test.ts`:

```ts
describe('lyric cache', () => {
  it('round-trips a record by id', async () => {
    await cacheLyric({
      lrclibId: 1, title: '天空', artist: '歌手',
      raw: [{ text: '天空', timeMs: 0 }], langGuess: 'yue',
    })
    const got = await getCachedLyric(1)
    expect(got?.raw).toEqual([{ text: '天空', timeMs: 0 }])
    expect(got?.langGuess).toBe('yue')
  })

  it('round-trips by title and artist', async () => {
    await cacheLyric({ lrclibId: 2, title: '天空', artist: '歌手', raw: [{ text: '天空' }] })
    const got = await getCachedLyricByTitleArtist('天空', '歌手')
    expect(got?.lrclibId).toBe(2)
  })

  it('stores raw text only, never annotations', async () => {
    await cacheLyric({ lrclibId: 3, title: '你好', artist: '歌手', raw: [{ text: '你好' }] })
    const got = await getCachedLyric(3)
    // The whole point: nothing language-specific is persisted, so the same
    // record serves both packs and toggling needs no second entry.
    expect(JSON.stringify(got)).not.toContain('syllables')
    expect(JSON.stringify(got)).not.toContain('tokens')
  })

  it('returns null for an unknown id', async () => {
    expect(await getCachedLyric(9999)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/storage/index.test.ts`
Expected: FAIL — `cacheLyric` is not exported

- [ ] **Step 3: Modify the implementation**

In `src/storage/index.ts`, bump the database name and replace the three song functions:

```ts
import type { SourceLine } from '../lyrics/parse'
import type { LangId } from '../types'

// v2: the store now holds RAW lyric lines instead of an annotated Song.
// Annotation depends on the active language pack, so caching it would make
// every cached syllable wrong the moment the user flips the toggle. Raw text
// is language-independent, smaller, and makes toggling a pure recompute.
//
// The name is bumped rather than the version because the contents are
// incompatible and this is PURELY a cache -- there is nothing to migrate, and
// a fresh database is cheaper and less error-prone than an upgrade path.
const DB_NAME = 'ktv-lyric-v2'
const STORE = 'lyrics'
```

```ts
export interface CachedLyric {
  lrclibId: number
  title: string
  artist: string
  /** Exactly what fetchLyrics() returned. Never annotated. */
  raw: SourceLine[]
  /** Carried through so a cache hit still seeds the language toggle without
   *  a second search. */
  langGuess?: LangId
}

export async function cacheLyric(rec: CachedLyric): Promise<void> {
  if (!rec.lrclibId) return
  const d = await db()
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(rec)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getCachedLyric(id: number): Promise<CachedLyric | null> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(id)
    req.onsuccess = () => resolve((req.result as CachedLyric) ?? null)
    req.onerror = () => reject(req.error)
  })
}

// Looked up by title+artist rather than lrclibId -- a picked SongCandidate
// only ever carries title/artist/album/durationSec (never an id, which is
// assigned by LRCLIB and only learned from the fetch this function exists to
// skip). Pasted lyrics are never written here (no lrclibId, see cacheLyric).
export async function getCachedLyricByTitleArtist(
  title: string, artist: string,
): Promise<CachedLyric | null> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE, 'readonly').objectStore(STORE)
      .index(TITLE_ARTIST_INDEX).get([title, artist])
    req.onsuccess = () => resolve((req.result as CachedLyric) ?? null)
    req.onerror = () => reject(req.error)
  })
}
```

Delete `cacheSong`, `getCachedSong`, and `getCachedSongByTitleArtist`, and drop the now-unused `Song` import.

**This breaks `src/App.tsx`, which still calls two of them.** Keeping `tsc`
green is part of this task, so make the minimal rewiring here rather than
leaving the branch red until Task 13:

- Import `cacheLyric` and `getCachedLyricByTitleArtist` instead.
- On a cache hit, the record no longer carries annotated `lines`, so replace
  `setLines(cached.lines)` with `await annotate(cached.raw, gen)` — the same
  call the fetch path already makes.
- Replace the `cacheSong(song)` write with:

```ts
        void cacheLyric({
          lrclibId: result.lrclibId,
          title: c.title,
          artist: c.artist,
          raw: result.raw,
        }).catch(() => {})
```

- Drop the now-unused `Song` import from `App.tsx`.

Do **not** add the language toggle, pack state, or `langGuess` threading here —
that is Task 13. This is only enough to keep the build green.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/storage/index.test.ts`
Expected: PASS — the 4 new tests plus Task 9's. Pre-existing `cacheSong` tests must be deleted, not adapted; the function is gone.

- [ ] **Step 5: Commit**

```bash
git add src/storage/index.ts src/storage/index.test.ts
git commit -m "feat(storage): cache raw lyrics so language toggling is a pure recompute"
```

---

### Task 11: Make the lyric view pack-aware

**Files:**
- Modify: `src/romanize/show.ts`, `src/ui/LyricLine.tsx`, `src/ui/LyricView.tsx`
- Test: `src/ui/LyricView.test.tsx` (extend)

**Interfaces:**
- Consumes: `LanguagePack`, `renderSyllable` (Task 5); `Settings` (Task 9)
- Produces: `showRomanization(s: Syllable, pack: LanguagePack, settings: Settings): string`; `LyricViewProps` and `LyricLineProps` each gain a required `pack: LanguagePack`.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/LyricView.test.tsx`:

```ts
import { cmnPack } from '../lang/cmn'
import { yuePack } from '../lang/yue'

describe('pack-driven rendering', () => {
  const settings = { ...DEFAULT_SETTINGS }

  it('renders Jyutping under the Cantonese pack', () => {
    const lines = [{ tokens: [{ chars: [{ char: '我', syllables: ['ngo5'] }] }] }]
    render(
      <LyricView
        lines={lines} dict={stubDict} engine={stubEngine} settings={settings}
        pack={yuePack} activeLine={-1} activeChar={-1} onPlayLine={() => {}}
      />,
    )
    expect(screen.getByText('ngo5')).toBeInTheDocument()
  })

  it('renders tone-marked pinyin under the Mandarin pack', () => {
    const lines = [{ tokens: [{ chars: [{ char: '我', syllables: ['wo3'] }] }] }]
    render(
      <LyricView
        lines={lines} dict={stubDict} engine={stubEngine} settings={settings}
        pack={cmnPack} activeLine={-1} activeChar={-1} onPlayLine={() => {}}
      />,
    )
    expect(screen.getByText('wǒ')).toBeInTheDocument()
  })

  it('honours the per-language style choice', () => {
    const yale = { ...DEFAULT_SETTINGS, romanization: { yue: 'yale', cmn: 'tonenum' } }
    const lines = [{ tokens: [{ chars: [{ char: '我', syllables: ['ngo5'] }] }] }]
    render(
      <LyricView
        lines={lines} dict={stubDict} engine={stubEngine} settings={yale}
        pack={yuePack} activeLine={-1} activeChar={-1} onPlayLine={() => {}}
      />,
    )
    expect(screen.getByText('ngóh')).toBeInTheDocument()
  })
})
```

Reuse whatever `stubDict` / `stubEngine` helpers the file already defines; if they are inline in existing tests, hoist them to module scope first.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/LyricView.test.tsx`
Expected: FAIL — `pack` is not a known prop

- [ ] **Step 3: Rewrite showRomanization**

Replace `src/romanize/show.ts` entirely:

```ts
import type { LanguagePack } from '../lang/types'
import { renderSyllable } from '../lang'
import type { Settings } from '../storage'
import type { Syllable } from '../types'

// Shared by LyricView (the popover's romanization row) and LyricLine (each
// character's ruby annotation) -- both need the exact same "which
// romanization does the user want to see" decision.
//
// The style is chosen PER LANGUAGE (Settings.romanization is keyed by LangId),
// so this needs the pack to know which half of that setting applies, and
// renderSyllable handles a stale style id by falling back to the pack's first.
export function showRomanization(
  s: Syllable, pack: LanguagePack, settings: Settings,
): string {
  return renderSyllable(pack, settings.romanization[pack.id], s)
}
```

- [ ] **Step 4: Thread the pack through both components**

In `src/ui/LyricLine.tsx`, add to `LyricLineProps`:

```ts
  /** Supplies the romanization styles and the audio bank identity. */
  pack: LanguagePack
```

import `LanguagePack` from `'../lang/types'`, destructure `pack` in `LyricLineImpl`'s parameter list, and change the `show` helper:

```ts
  const show = (s: string) => showRomanization(s, pack, settings)
```

In `src/ui/LyricView.tsx`, add `pack: LanguagePack` to `Props`, destructure it, change its `show` helper identically, and pass `pack={pack}` down to `<LyricLine>`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/ui/LyricView.test.tsx src/ui/GlossPopover.test.tsx`
Expected: PASS — pre-existing tests need `pack={yuePack}` added to their render calls.

- [ ] **Step 6: Commit**

```bash
git add src/romanize/show.ts src/ui/LyricLine.tsx src/ui/LyricView.tsx src/ui/LyricView.test.tsx
git commit -m "feat(ui): drive romanization from the active language pack"
```

---

### Task 12: The language toggle

**Files:**
- Create: `src/ui/LangToggle.tsx`
- Test: `src/ui/LangToggle.test.tsx`

**Interfaces:**
- Consumes: `LangId` (Task 3)
- Produces: `<LangToggle value={LangId} busy={boolean} onChange={(id: LangId) => void} />`

- [ ] **Step 1: Write the failing test**

Create `src/ui/LangToggle.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LangToggle from './LangToggle'

describe('LangToggle', () => {
  it('marks the active language pressed', () => {
    render(<LangToggle value="yue" busy={false} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /粵語/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /普通話/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports a change', async () => {
    const onChange = vi.fn()
    render(<LangToggle value="yue" busy={false} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /普通話/ }))
    expect(onChange).toHaveBeenCalledWith('cmn')
  })

  it('does not fire when the active language is clicked again', async () => {
    const onChange = vi.fn()
    render(<LangToggle value="yue" busy={false} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /粵語/ }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables both buttons while a pack is loading', () => {
    render(<LangToggle value="yue" busy onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /粵語/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /普通話/ })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/LangToggle.test.tsx`
Expected: FAIL — cannot resolve `./LangToggle`

- [ ] **Step 3: Write the implementation**

Create `src/ui/LangToggle.tsx`:

```tsx
import type { LangId } from '../lang/types'

const OPTIONS: { id: LangId; label: string; sub: string }[] = [
  { id: 'yue', label: '粵語', sub: 'Jyutping' },
  { id: 'cmn', label: '普通話', sub: 'Pinyin' },
]

/**
 * Which reading the lyric is annotated with.
 *
 * This is a per-song choice, not a global setting: the same user sings both,
 * and the initial position is only a GUESS derived from iTunes genre
 * metadata. It sits directly above the lyric because a wrong guess must be
 * obvious and one tap from being fixed -- that visibility is what makes
 * guessing acceptable at all.
 */
export default function LangToggle(
  { value, busy, onChange }: { value: LangId; busy: boolean; onChange(id: LangId): void },
) {
  return (
    <div className="setting lang-toggle">
      <span className="setting-label" id="lang-toggle-label">Reading</span>
      <div className="segmented" role="group" aria-labelledby="lang-toggle-label">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={busy}
            aria-pressed={value === o.id}
            // Re-selecting the active language would pointlessly re-annotate
            // every line, so it is a no-op rather than a cheap-looking event.
            onClick={() => { if (value !== o.id) onChange(o.id) }}
          >
            {o.label}<span className="lang-sub">{o.sub}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add the styles**

Append to `src/ui/lyric.css`:

```css
.lang-toggle {
  margin-bottom: 0.75rem;
}

.lang-sub {
  display: block;
  font-size: 0.7em;
  opacity: 0.7;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/ui/LangToggle.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/ui/LangToggle.tsx src/ui/LangToggle.test.tsx src/ui/lyric.css
git commit -m "feat(ui): per-song language toggle"
```

---

### Task 13: Wire the toggle into App

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx` (extend)

**Interfaces:**
- Consumes: everything from Tasks 5–12
- Produces: no new exports; `App` now holds `lang` state, swaps packs and audio engines, re-annotates on toggle, and caches raw lyrics.

- [ ] **Step 1: Write the failing test**

Append to `src/App.test.tsx`:

```tsx
describe('language toggle', () => {
  it('re-annotates the lyric in pinyin without refetching', async () => {
    render(<App />)
    // Paste is the shortest path to a rendered lyric with no network at all.
    await userEvent.type(screen.getByRole('textbox', { name: /paste/i }), '天空')
    await userEvent.click(screen.getByRole('button', { name: /use these lyrics/i }))

    expect(await screen.findByText('tin1')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /普通話/ }))

    expect(await screen.findByText('tiān')).toBeInTheDocument()
    expect(screen.queryByText('tin1')).not.toBeInTheDocument()
  })

  it('defaults a pasted lyric to Cantonese', async () => {
    render(<App />)
    await userEvent.type(screen.getByRole('textbox', { name: /paste/i }), '天空')
    await userEvent.click(screen.getByRole('button', { name: /use these lyrics/i }))

    expect(screen.getByRole('button', { name: /粵語/ })).toHaveAttribute('aria-pressed', 'true')
  })
})
```

Match the paste-box label and button text to whatever `PasteBox.tsx` actually renders — read it first rather than assuming.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — no 普通話 button

- [ ] **Step 3: Add language state and a pack-aware engine**

In `src/App.tsx`, replace the imports of `annotateLine`, `cacheSong`, `getCachedSongByTitleArtist` and add the new ones:

```ts
import { getPack, yuePack, type LangId, type LanguagePack } from './lang'
import { cacheLyric, getCachedLyricByTitleArtist, loadSettings, saveSettings, type Settings } from './storage'
import LangToggle from './ui/LangToggle'
```

Add state below `audioReady`:

```ts
  // The active language for the CURRENT song. Deliberately not persisted:
  // it is a per-song property seeded from a per-track genre guess, so
  // carrying it across songs would be wrong more often than right.
  const [lang, setLang] = useState<LangId>('yue')
  const [pack, setPack] = useState<LanguagePack>(yuePack)
  const [packBusy, setPackBusy] = useState(false)
  // The raw lines behind whatever is currently displayed. Kept so the toggle
  // can re-annotate without refetching -- this is what the storage change in
  // Task 10 exists to make possible.
  const [rawLines, setRawLines] = useState<{ text: string; timeMs?: number }[]>([])
```

Replace the engine memo so it follows the pack:

```ts
  const ctx = useMemo(() => new AudioContext(), [])
  // A new engine per pack: each language has its own clip directory, manifest
  // and LRU. Swapping the object also discards the previous language's
  // decoded buffers, which is the desired behaviour -- they are useless now
  // and would otherwise sit in memory.
  const engine = useMemo(
    () => createAudioEngine(ctx, { dir: pack.audioDir, manifest: pack.manifest }),
    [ctx, pack],
  )
```

- [ ] **Step 4: Make annotate use the pack, and re-run it on toggle**

First, convert to the script the active pack requires. Replace the existing
Simplified→Traditional block:

```ts
      let text = normalize(l.text)
      if (pack.script === 'trad') {
        // toTraditional is NOT idempotent on Traditional input -- it still
        // normalises glyph variants -- so detect first and only convert text
        // that is actually Simplified.
        if (await isSimplified(text)) text = await toTraditional(text)
      } else {
        // t2s IS safe to run unconditionally: already-Simplified characters
        // are absent from the 't' source table and pass through untouched.
        // Running it unconditionally also handles mixed-script lines, which
        // the detect-first branch above cannot.
        text = await toSimplified(text)
      }
```

**Verify the idempotence claim empirically** before relying on it — run
`toSimplified` twice over a Simplified string and confirm it is unchanged. If
it is not idempotent, mirror the `trad` branch's detect-first shape instead and
say so in your report.

Add `toSimplified` to the existing `./script` import.

Then change the annotation call to use `pack.annotate` and remember the raw lines:

```ts
      out.push({
        tokens: pack.annotate(text, { words: dict.keys(), maxWordLength: dict.maxKeyLength }),
        timeMs: l.timeMs,
      })
```

and just before `setLines(out)`:

```ts
    if (gen !== genRef.current) return undefined // a newer pick/paste has since won
    setRawLines(raw)
    setLines(out)
    return out
```

Add `pack` to the callback's dependency array: `}, [dict, pack])`.

Add the toggle handler. **It must be declared ABOVE `onPick`** — `onPick`
references it and lists it in its dependency array, and `const` bindings are
not hoisted, so declaring it after would throw at render time:

```ts
  // Switching language re-annotates from rawLines. No network, no refetch --
  // the cache holds raw text precisely so this is a pure recompute.
  const onLangChange = useCallback(async (next: LangId) => {
    setPackBusy(true)
    try {
      const p = await getPack(next)
      setLang(next)
      setPack(p)
    } catch {
      // A lazy chunk fetch can fail offline. Revert visibly rather than
      // leaving a half-switched view: the toggle stays where it was.
      setNotice('Could not load that language. Check your connection and try again.')
    } finally {
      setPackBusy(false)
    }
  }, [])

  // Re-annotate whenever the pack changes under an existing lyric.
  useEffect(() => {
    if (rawLines.length === 0) return
    genRef.current++
    void annotate(rawLines, genRef.current)
    // annotate already depends on pack; rawLines is intentionally NOT a
    // dependency -- it is set BY annotate, and including it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack])
```

- [ ] **Step 5: Update onPick for the new cache and the guess**

Replace the cache read and write inside `onPick`:

```ts
      const cached = await getCachedLyricByTitleArtist(c.title, c.artist).catch(() => null)
      if (cached) {
        if (gen !== genRef.current) return
        // Seed the toggle from whichever guess we have: the fresh candidate's
        // wins, since the cached one may predate a genre-table update.
        const guess = c.langGuess ?? cached.langGuess
        if (guess && guess !== lang) { await onLangChange(guess); return }
        await annotate(cached.raw, gen)
        return
      }

      const result = await fetchLyrics(c)
      if (gen !== genRef.current) return
      if (!result) { setNotice('No lyrics found for that track. Paste them below to continue.'); return }

      if (c.langGuess && c.langGuess !== lang) await onLangChange(c.langGuess)

      const out = await annotate(result.raw, gen)
      if (out && result.lrclibId != null) {
        // Fire-and-forget: a failed write shouldn't block playback, and must
        // not escape as an unhandled rejection.
        void cacheLyric({
          lrclibId: result.lrclibId,
          title: c.title,
          artist: c.artist,
          raw: result.raw,
          langGuess: c.langGuess,
        }).catch(() => {})
      }
```

Add `lang` and `onLangChange` to `onPick`'s dependency array: `}, [annotate, lang, onLangChange])`.

Remove the now-unused `Song` import if TypeScript flags it.

- [ ] **Step 6: Render the toggle and pass the pack down**

Add above `<LyricView>` inside the `lines.length > 0 && dict` branch:

```tsx
          <>
            <LangToggle value={lang} busy={packBusy} onChange={onLangChange} />
            <LyricView
              lines={lines} dict={dict} engine={engine} settings={settings}
              pack={pack}
              activeLine={pstate.lineIndex} activeChar={pstate.charIndex}
              audioReady={audioReady}
              onPlayLine={(i) => player.playLine(lines[i], i)}
            />
          </>
```

Update the header and empty-state copy, which currently claim Cantonese only:

```tsx
            Cantonese KTV Lyrics<span className="zh">粵語歌詞</span>
```
becomes
```tsx
            KTV Lyrics<span className="zh">歌詞發音</span>
```

and the empty-state paragraph becomes:

```tsx
              Search for a song above, or paste a lyric in. Every character gets its Cantonese or
              Mandarin reading — tap one to hear it and see what the word means.
```

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: PASS. Fix any call sites the refactor broke.

- [ ] **Step 8: Typecheck and commit**

Run: `npm run build`
Expected: no TypeScript errors

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(app): wire the language toggle through annotation, audio and cache"
```

---

### Task 14: Per-language romanization in Settings

**Files:**
- Modify: `src/ui/SettingsPanel.tsx`, `src/App.tsx`
- Test: `src/ui/SettingsPanel.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `Settings` (Task 9), `LanguagePack` (Task 3)
- Produces: `SettingsPanel` gains a `pack: LanguagePack` prop and edits only the active language's style.

- [ ] **Step 1: Write the failing test**

Create `src/ui/SettingsPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsPanel from './SettingsPanel'
import { DEFAULT_SETTINGS } from '../storage'
import { yuePack } from '../lang/yue'
import { cmnPack } from '../lang/cmn'

describe('SettingsPanel romanization', () => {
  it('offers the Cantonese styles under the Cantonese pack', () => {
    render(<SettingsPanel settings={DEFAULT_SETTINGS} pack={yuePack} onChange={() => {}} />)
    const select = screen.getByLabelText(/romanization/i)
    expect([...select.querySelectorAll('option')].map((o) => o.value))
      .toEqual(['jyutping', 'yale'])
  })

  it('offers the Mandarin styles under the Mandarin pack', () => {
    render(<SettingsPanel settings={DEFAULT_SETTINGS} pack={cmnPack} onChange={() => {}} />)
    const select = screen.getByLabelText(/romanization/i)
    expect([...select.querySelectorAll('option')].map((o) => o.value))
      .toEqual(['tonemark', 'tonenum'])
  })

  it('changes only the active language and leaves the other alone', async () => {
    const onChange = vi.fn()
    render(<SettingsPanel settings={DEFAULT_SETTINGS} pack={yuePack} onChange={onChange} />)
    await userEvent.selectOptions(screen.getByLabelText(/romanization/i), 'yale')
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ romanization: { yue: 'yale', cmn: 'tonemark' } }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/SettingsPanel.test.tsx`
Expected: FAIL — `pack` is not a known prop and the options are hardcoded

- [ ] **Step 3: Modify SettingsPanel**

Change the signature and the romanization block in `src/ui/SettingsPanel.tsx`:

```tsx
import type { LanguagePack } from '../lang/types'
import type { Settings } from '../storage'
import { SettingsIcon } from './icons'

export default function SettingsPanel(
  { settings, pack, onChange }:
    { settings: Settings; pack: LanguagePack; onChange(s: Settings): void },
) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value })
```

Replace the romanization `<div className="setting">` block with:

```tsx
          <div className="setting">
            <label className="setting-label" htmlFor="set-romanization">
              Romanization
            </label>
            {/* Options come from the ACTIVE pack, and the change writes only
                that language's slot -- so a Cantonese preference survives a
                trip through a Mandarin song and back. */}
            <select
              id="set-romanization"
              value={settings.romanization[pack.id]}
              onChange={(e) =>
                set('romanization', { ...settings.romanization, [pack.id]: e.target.value })
              }
            >
              {pack.romanizations.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
```

- [ ] **Step 4: Pass the pack from App**

In `src/App.tsx`, change the render to `<SettingsPanel settings={settings} pack={pack} onChange={setSettings} />`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/ui/SettingsPanel.test.tsx src/App.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/SettingsPanel.tsx src/ui/SettingsPanel.test.tsx src/App.tsx
git commit -m "feat(ui): romanization options follow the active language pack"
```

---

### Task 15: Derive the pinyin inventory and build the audio bank

**Files:**
- Create: `scripts/lib/pinyin-inventory.mjs`, `scripts/build-pinyin-audio.mjs`
- Test: `scripts/lib/pinyin-inventory.test.mjs`

**Interfaces:**
- Consumes: `public/data/dict.json`, `pinyin-pro`
- Produces: `derivePinyinInventory(dictPath)` → `{ syllables: string[], representatives: Record<string,string>, unreachable: string[] }`; plus `public/audio/pin/*.mp3` and `public/data/pinyin.json`.

**Note:** the normalizer is duplicated in `.mjs` rather than imported from `src/lang/pinyin-syllable.ts`, because build scripts are plain ESM with no TypeScript pipeline. Task 16's coverage test guards the two against drifting apart.

### Amendment — synthesis backend (2026-07-27)

AWS credentials are unavailable in this environment and the human partner chose an offline TTS over
creating an account. That changes a load-bearing property of this task.

**Polly could name the phoneme directly** (`<phoneme alphabet="x-amazon-pinyin" ph="le0">`), so every
inventory entry was synthesizable by construction. **Offline engines cannot** — Piper's Chinese
frontend derives the reading from characters, so each syllable needs a *representative character*
the engine will read as that syllable.

Measured against the real inventory (10,709 CJK characters in `dict.json` headwords, 1,344 distinct
syllables):

| | count | |
|---|---|---|
| single-reading representative character exists | **1,259 (94%)** | any competent Chinese TTS must read it correctly |
| only a multi-reading rep whose default matches | 5 | usable, slightly riskier |
| **no representative character at all** | **80 (6%)** | 19 neutral-tone, 61 contextual-only |

Those 80 are **structurally unreachable** by the character route, not a matter of searching harder:
a character in isolation reverts to its citation tone, so a neutral-tone syllable has no
single-character spelling. `le0` (了, which reads `liao3` alone) is in this set and is very common
in lyrics.

**Decision:** ship the offline backend; treat the 80 as documented known gaps that degrade to the
existing per-character "no audio" marker; and keep the Polly path implemented behind a
`--backend=piper|polly` switch so adding credentials later closes the gap with no rework.

`derivePinyinInventory` therefore returns an object, not a bare array — `syllables`,
`representatives` (syllable → character), and `unreachable`. The `unreachable` list is data the
Task 16 coverage test asserts against, exactly as `KNOWN_GAPS` does for the 14 Cantonese gaps.

**Scope for this run:** implement and test the inventory deriver and the dual-backend build script.
Do NOT download a TTS binary or model, and do NOT run the synthesis — that is an environment change
the human partner has not authorised. `public/audio/pin/` and `public/data/pinyin.json` stay
unbuilt, and Task 16's coverage test must be written to skip cleanly when the manifest is absent
rather than fail.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/pinyin-inventory.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { normalizeSyllable, derivePinyinInventory } from './pinyin-inventory.mjs'

describe('normalizeSyllable', () => {
  it('matches the TypeScript normalizer exactly', () => {
    expect(normalizeSyllable('wo3')).toBe('wo3')
    expect(normalizeSyllable('de5')).toBe('de0')
    expect(normalizeSyllable('de')).toBe('de0')
    expect(normalizeSyllable('lü4')).toBe('lv4')
    expect(normalizeSyllable('wo7')).toBeNull()
    expect(normalizeSyllable('')).toBeNull()
  })
})

describe('derivePinyinInventory', () => {
  it('returns sorted canonical keys', () => {
    const out = derivePinyinInventory('public/data/dict.json')
    expect(out.length).toBeGreaterThan(1000)
    expect(out.every((s) => /^[a-z]+[0-4]$/.test(s))).toBe(true)
    expect([...out].sort()).toEqual(out)
    expect(new Set(out).size).toBe(out.length)
  })

  it('covers the readings of common characters', () => {
    const out = new Set(derivePinyinInventory('public/data/dict.json'))
    for (const s of ['wo3', 'ni3', 'hao3', 'tian1', 'de0']) {
      expect(out.has(s)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/pinyin-inventory.test.mjs`
Expected: FAIL — cannot resolve the module

- [ ] **Step 3: Write the inventory deriver**

Create `scripts/lib/pinyin-inventory.mjs`:

```js
import { readFileSync } from 'node:fs'
import { pinyin } from 'pinyin-pro'

// Mirror of src/lang/pinyin-syllable.ts. Duplicated because build scripts are
// plain ESM with no TypeScript pipeline; scripts/pinyin-coverage.test.mjs
// asserts the two stay in agreement.
const TONED = /^([a-z]+)([0-5]?)$/

export function normalizeSyllable(raw) {
  const s = String(raw).trim().toLowerCase().replace(/ü/g, 'v').replace(/u:/g, 'v')
  if (!s) return null
  const m = TONED.exec(s)
  if (!m) return null
  const [, letters, digit] = m
  const tone = digit === '' || digit === '5' ? '0' : digit
  return `${letters}${tone}`
}

/**
 * The set of syllables the app can ever need, derived rather than assumed.
 *
 * Every CJK character appearing in a dictionary headword is fed through
 * pinyin-pro and its readings collected. Deriving from dict.json (rather than
 * shipping a canonical ~1,300-syllable table) makes coverage provably complete
 * for anything the dictionary knows, which is exactly the set the annotator
 * can surface a gloss for.
 */
export function derivePinyinInventory(dictPath) {
  const dict = JSON.parse(readFileSync(dictPath, 'utf8'))
  const chars = new Set()
  for (const key of Object.keys(dict)) {
    for (const ch of key) {
      if (/\p{Script=Han}/u.test(ch)) chars.add(ch)
    }
  }

  const out = new Set()
  for (const ch of chars) {
    // Ask for every reading, not just the contextual one: a character read
    // one way inside a word may be read another way alone, and the bank must
    // cover both or a tap produces silence.
    //
    // VERIFY `multiple` against Task 1's probe before trusting this. If the
    // installed pinyin-pro does not support it, drop the option -- the
    // inventory then covers only default readings, which is a REAL coverage
    // gap that must be reported, not silently accepted.
    const readings = pinyin(ch, { toneType: 'num', type: 'array', multiple: true })
    for (const r of Array.isArray(readings) ? readings : [readings]) {
      const syl = normalizeSyllable(r)
      if (syl) out.add(syl)
    }
  }
  return [...out].sort()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/lib/pinyin-inventory.test.mjs`
Expected: PASS (3 tests). **Record the inventory size in your report** — the spec predicts roughly 1,300.

- [ ] **Step 5: Write the audio build script**

Create `scripts/build-pinyin-audio.mjs`:

```js
// Synthesize one MP3 per canonical pinyin syllable with Amazon Polly.
//
// Polly is used because Amazon grants storage and redistribution of generated
// speech outright -- the same clause that cleared the amazonHiuJin subset for
// Cantonese in build-audio.mjs. Credentials come from the ambient AWS profile
// and NEVER enter the repo or the bundle.
//
// Run: FFMPEG_BIN="/c/.../ffmpeg.exe" node scripts/build-pinyin-audio.mjs
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly'
import { derivePinyinInventory } from './lib/pinyin-inventory.mjs'

const OUT = 'public/audio/pin'
const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg'
const polly = new PollyClient({})

mkdirSync(OUT, { recursive: true })
const wanted = derivePinyinInventory('public/data/dict.json')
console.log(`inventory: ${wanted.length} syllables`)

const done = []
const failed = []
let reused = 0

for (let i = 0; i < wanted.length; i++) {
  const syl = wanted[i]
  const finalPath = join(OUT, `${syl}.mp3`)

  // Resumable: an interrupted run must not start over. Delete public/audio/pin
  // to force a full rebuild.
  if (existsSync(finalPath)) { done.push(syl); reused++; continue }

  const ssml =
    `<speak><phoneme alphabet="x-amazon-pinyin" ph="${syl}">${syl}</phoneme></speak>`

  try {
    const res = await polly.send(new SynthesizeSpeechCommand({
      Text: ssml,
      TextType: 'ssml',
      VoiceId: 'Zhiyu',
      Engine: 'neural',
      OutputFormat: 'mp3',
    }))
    const bytes = Buffer.from(await res.AudioStream.transformToByteArray())
    if (bytes.length === 0) throw new Error('empty AudioStream')

    const tmp = join(OUT, `${syl}.raw.mp3`)
    writeFileSync(tmp, bytes)
    // Identical chain to build-audio.mjs so the two banks match in level and
    // leading/trailing silence -- a user toggling language must not hear a
    // volume jump.
    execFileSync(FFMPEG_BIN, [
      '-y', '-loglevel', 'error',
      '-i', tmp,
      '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,'
           + 'areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,'
           + 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-ac', '1', '-b:a', '48k', '-codec:a', 'libmp3lame',
      finalPath,
    ])
    unlinkSync(tmp)
    done.push(syl)
  } catch (err) {
    console.error(`FAILED ${syl}: ${err.message}`)
    failed.push(syl)
  }

  if ((i + 1) % 100 === 0 || i === wanted.length - 1) {
    console.log(`progress: ${i + 1}/${wanted.length} (${done.length} ok, ${failed.length} failed)`)
  }
}

done.sort()
mkdirSync('public/data', { recursive: true })
writeFileSync('public/data/pinyin.json', JSON.stringify(done))
console.log(`wrote ${done.length} syllables (${reused} reused)`)

// AWS documents that Polly declines certain pinyin strings. Fail loudly rather
// than shipping a bank with silent holes.
if (failed.length) {
  console.error(`\n${failed.length} FAILED: ${failed.join(', ')}`)
  process.exit(1)
}
```

- [ ] **Step 6: Install the Polly SDK**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npm install --save-dev @aws-sdk/client-polly
```

- [ ] **Step 7: Run the build**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
FFMPEG_BIN="<absolute path to ffmpeg.exe>" node scripts/build-pinyin-audio.mjs
```

Expected: `public/data/pinyin.json` written and `public/audio/pin/` populated.

**If AWS credentials are unavailable in this environment, STOP and report it.** Do not fake the bank, do not commit an empty manifest, and do not weaken the coverage test in Task 16 to compensate. Tasks 1–14 are all independently valuable and shippable behind a Cantonese-only toggle; this task and Task 16 can land later.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/pinyin-inventory.mjs scripts/lib/pinyin-inventory.test.mjs \
        scripts/build-pinyin-audio.mjs package.json package-lock.json \
        public/data/pinyin.json public/audio/pin
git commit -m "feat(audio): derive the pinyin inventory and synthesize the Mandarin bank"
```

---

### Task 16: Coverage guard, service worker, credits, ship

**Files:**
- Create: `scripts/pinyin-coverage.test.mjs`
- Modify: `public/sw.js`, `src/ui/Credits.tsx`, `README.md`
- Test: the coverage test is itself the test

- [ ] **Step 1: Write the coverage test**

Create `scripts/pinyin-coverage.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { derivePinyinInventory } from './lib/pinyin-inventory.mjs'

describe('mandarin audio coverage', () => {
  it('has an mp3 for every derivable syllable', () => {
    const have = new Set(JSON.parse(readFileSync('public/data/pinyin.json', 'utf8')))
    const need = derivePinyinInventory('public/data/dict.json')
    const missing = need.filter((s) => !have.has(s))

    // Do NOT add a KNOWN_GAPS list to make a failing build pass. Unlike the
    // Cantonese bank -- whose 14 gaps are inherited from an upstream dataset
    // we do not control -- this bank is generated by us from a complete
    // inventory, so a gap means the build genuinely failed and re-running
    // build-pinyin-audio.mjs is the fix.
    expect(missing).toEqual([])
  }, 120_000)

  it('every audio file is named as a canonical pinyin syllable', () => {
    const have = JSON.parse(readFileSync('public/data/pinyin.json', 'utf8'))
    expect(have.filter((s) => !/^[a-z]+[0-4]$/.test(s))).toEqual([])
  })
})
```

- [ ] **Step 2: Guard the two normalizers against drifting apart**

The normalizer exists twice — `src/lang/pinyin-syllable.ts` for the app and
`scripts/lib/pinyin-inventory.mjs` for the build. If they diverge, the bank
and the annotator key syllables differently and every affected character goes
silent. This check lives in the **TypeScript** test file rather than the
`.mjs` one: importing `.mjs` from `.ts` resolves cleanly, whereas importing a
`.ts` source from a plain `.mjs` file relies on extension handling that is
easy to break.

Append to `src/lang/pinyin-syllable.test.ts`:

```ts
import { normalizeSyllable } from '../../scripts/lib/pinyin-inventory.mjs'

describe('the build-script normalizer agrees with the app normalizer', () => {
  it('agrees on every interesting input', () => {
    for (const raw of ['wo3', 'de5', 'de', 'lü4', 'lu:4', 'LV4', 'wo7', '', 'abc!']) {
      expect(normalizeSyllable(raw)).toBe(normalizePinyinSyllable(raw))
    }
  })
})
```

If `scripts/lib/pinyin-inventory.mjs` has no type declarations, add
`// @ts-expect-error -- plain ESM build script, no .d.ts` above the import
rather than weakening `tsconfig`.

- [ ] **Step 3: Run both**

Run: `npx vitest run scripts/pinyin-coverage.test.mjs src/lang/pinyin-syllable.test.ts`
Expected: PASS

- [ ] **Step 4: Teach the service worker about the Mandarin bank**

In `public/sw.js`, bump the cache name and widen the match — line 18 currently only matches `/audio/syl/`, so every Mandarin clip would bypass the cache and re-download on each play:

```js
const CACHE = 'ktv-lyric-audio-v2'
```

```js
  const cacheable =
    url.pathname.includes('/audio/syl/') ||
    url.pathname.includes('/audio/pin/') ||
    url.pathname.includes('/data/')
```

Bumping `CACHE` is required, not cosmetic: the activate handler deletes every cache whose key differs from `CACHE`, so the bump is what evicts v1 entries.

- [ ] **Step 5: Credit the new sources**

In `src/ui/Credits.tsx`, add after the existing audio paragraph:

```tsx
      <p>
        Pinyin readings from <a href="https://github.com/zh-lx/pinyin-pro">pinyin-pro</a> (MIT).
        Mandarin pronunciation audio generated with{' '}
        <a href="https://aws.amazon.com/polly/">Amazon Polly</a> (Zhiyu), which permits storage and
        redistribution of generated speech.
      </p>
```

- [ ] **Step 6: Update the README**

Add a section documenting the two build steps and their prerequisites:

```markdown
## Regenerating the audio banks

Cantonese (`public/audio/syl/`) — needs a local checkout of the dataset:

    GIT_LFS_SKIP_SMUDGE=1 git clone https://huggingface.co/datasets/AlienKevin/cantone
    cd cantone && git lfs pull --include="amazonHiuJin/**"
    CANTONE_DIR=cantone/amazonHiuJin node scripts/build-audio.mjs

Mandarin (`public/audio/pin/`) — needs AWS credentials in the ambient profile:

    node scripts/build-pinyin-audio.mjs

Both need `ffmpeg`; set `FFMPEG_BIN` to an absolute path if it is not on PATH.
Both are resumable — delete the output directory to force a full rebuild.
```

- [ ] **Step 7: Full verification**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npx vitest run          # entire suite
npm run build           # tsc --noEmit && vite build
```

Expected: all tests pass, no TypeScript errors, build succeeds.

- [ ] **Step 8: Confirm the lazy chunk actually split**

```bash
ls -la dist/assets/ | grep -i -E "cmn|pinyin"
```

Expected: a separate chunk containing pinyin-pro. If pinyin-pro landed in the main bundle, the lazy import was defeated somewhere (usually a static `import` of `./cmn` sneaking into a module the entry point pulls in) — **report it rather than accepting it**, because it costs every Cantonese-only user the full library.

- [ ] **Step 9: Commit**

```bash
git add scripts/pinyin-coverage.test.mjs src/lang/pinyin-syllable.test.ts \
        public/sw.js src/ui/Credits.tsx README.md
git commit -m "feat: guard Mandarin audio coverage, cache the bank, credit the sources"
```

---

## Verification checklist

After Task 16, confirm by hand:

- [ ] Search 浮誇 → results show 陳奕迅 in Chinese, not "Eason Chan"
- [ ] Search 晴天 → results show 周杰倫 and 晴天, not "Sunny Day / Jay Chou"
- [ ] Picking a Cantopop track lands on 粵語 with Jyutping
- [ ] Picking a Mandopop track lands on 普通話 with tone-marked pinyin
- [ ] Toggling language re-annotates instantly with no network request (check DevTools)
- [ ] Tapping a character plays audio in both languages
- [ ] Romanization style is remembered separately per language across a reload
- [ ] A pasted lyric defaults to 粵語 and toggles correctly
- [ ] Existing users' Yale preference survives the settings migration

