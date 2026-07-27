# Bilingual (Cantonese + Mandarin) search and annotation — design

**Date:** 2026-07-27
**Status:** Approved, ready for planning
**Supersedes:** nothing. Extends `2026-07-26-ktv-cantonese-lyric-app-design.md`, which remains
authoritative for everything not restated here.

## 1. Purpose

Broaden the app from Cantonese-only to Cantonese **and** Mandarin:

1. Searching a title in Traditional or Simplified Chinese finds both Cantopop and Mandopop, with
   native Chinese metadata.
2. A Mandarin song is annotated with **pinyin** and plays **Mandarin** syllable audio; a Cantonese
   song keeps **Jyutping** and Cantonese audio.
3. Which of the two applies is chosen per song, defaulted from a guess, and always overridable by
   the user in one tap.

Everything in the original spec still holds: 100% static, no backend, no API key or secret in the
bundle or repo, never Git LFS, dictionary stays a separate `.json`, non-commercial, no lyric
fixtures anywhere including tests.

## 2. What already worked, and what actually didn't

The request was "broaden search to both languages in both scripts". Measurement showed the
dual-script half was already complete and the real defect was somewhere else.

**Already shipping.** `scriptVariants()` issues both Traditional and Simplified to every backend,
and `dedupeKey()` folds both fields to Simplified before merging, so 陳奕迅 and 陈奕迅 collapse to
one row. `search/` contains no Cantonese filter — a Mandarin title already returned Mandarin songs.

**The real defect: the storefront.** `itunes.ts` sent no `country`, so Apple defaulted to the **US**
store, which returns English-translated metadata:

| Query | US store | HK store |
|---|---|---|
| 晴天 | `Sunny Day — Jay Chou` | `晴天 — 周杰倫` |
| 告白氣球 | `Love Confession — Jay Chou` | `告白氣球 — 周杰倫` |
| 漂向北方 | `Stranger in the North — Namewee` | `漂向北方 — 黃明志` |
| 浮誇 | `浮誇 — Eason Chan` | `浮誇 — 陳奕迅` |

This hits Mandarin harder than Cantonese: Cantonese titles largely survive and only the artist is
romanized, while Mandarin titles are replaced outright. It also degrades the downstream lyric
lookup — `Sunny Day / Jay Chou` returns 4 LRCLIB hits against 20 for `晴天 / 周杰倫`.

**No data blocker for Mandarin.** LRCLIB coverage measured 11–20 synced hits for every Mandarin
song probed, beating Cantonese, where 喜帖街 / 謝安琪 returned zero.

## 3. Locked decisions

| Decision | Choice | Basis |
|---|---|---|
| One app or two | **One app, both languages live at once** | A per-song toggle requires both stacks loaded simultaneously |
| Language threading | **`LanguagePack` object per language** | The toggle is literally a swap of this object; avoids `if (lang === …)` across five modules |
| Mandarin syllable key | **Tone-numbered pinyin, `/^[a-z]+[0-4]$/`, neutral = 0** | Same string serves as audio filename, manifest entry, and Polly `ph`; matches Polly's own convention |
| Pinyin engine | **`pinyin-pro`** (MIT, 0 deps, lazy chunk) | Polyphone-aware; `tiny-pinyin` (41 KB) is character-level and mis-reads 得/行/長 |
| Mandarin audio | **Self-generated, Amazon Polly `Zhiyu`, neural** | Polly grants storage and redistribution of generated MP3 — the same clause that cleared `amazonHiuJin` for Cantonese |
| Storefronts | **HK + TW; US dropped** | See §4 — US contributes romanized duplicates the deduper cannot collapse |
| Language guess | **iTunes `primaryGenreName` lookup table** | Per-track, so bilingual artists resolve correctly; 10/10 on the sampled top hits |
| Glosses | **Reuse `dict.json` unchanged** | It is CC-CEDICT-derived and already Mandarin |
| Song cache | **Cache raw lyric lines, not the annotation** | Annotation is language-dependent; caching raw makes toggling a pure recompute |

## 4. Search fan-out

`searchItunes(term)` becomes `searchItunes(term, country)`, invoked across `['HK', 'TW']` × the
existing script variants: 4 requests worst case, 2 when the query is script-neutral, against
iTunes' roughly 20/min. LRCLIB remains the tier-1 fallback unchanged.

**Why US is dropped despite appearing to double the results.** Measured across seven titles,
`HK ∪ TW` returned 165 distinct `title|artist` rows and US appeared to add 134 more (+81%). But the
additions are overwhelmingly the *same recordings* under romanized metadata — `浮誇 | Eason Chan`
alongside HK's `浮誇 | 陳奕迅`. `dedupeKey()` folds Traditional↔Simplified but cannot fold
陳奕迅↔Eason Chan, so including US would spray duplicate rows into the picker rather than surface
new songs. The naive "more storefronts is better" reading is wrong here.

## 5. Language determination

Lyrics cannot reveal the language. Counting Cantonese-specific characters (嘅 喺 唔 佢 咗 啲 冇 …)
across four Cantopop songs found **zero markers in 1,744 Han characters** — Cantopop is written in
書面語, character-identical to Mandarin. Any "sniff the text" scheme is dead on arrival.

Apple's localized `primaryGenreName` is the usable signal, and it is per-track:

| Storefront | → `yue` | → `cmn` |
|---|---|---|
| HK | 廣東歌/香港流行樂 | 國語流行樂 |
| TW | 粵語流行樂 | 華語流行樂, 華語音樂 |

Uninformative values (流行樂, 世界音樂, 器樂, 演奏曲, 新世紀) map to `undefined` rather than a
guess. The mapping is **data, not logic** — adding a storefront later extends the table only.

`SongCandidate` gains:

```ts
genre?: string      // primaryGenreName, verbatim
langGuess?: LangId  // derived; undefined when the genre is uninformative
```

**Merge rule.** HK and TW label the same recording differently (廣東歌/香港流行樂 vs 粵語流行樂).
Both map to the same `LangId`, so the guess survives — but the merge in `searchSongs()` must prefer
a defined `langGuess` over an undefined one instead of blind first-wins.

When `langGuess` is `undefined`, and for pasted lyrics, the toggle defaults to **Cantonese**: this
remains a Cantonese app that also handles Mandarin.

## 6. Module boundaries

`Syllable` is documented in `types.ts` as "both the audio key and the romanization key". Cantonese
uses `ngo5`; Mandarin uses `wo3`. Display converts `wo3` → `wǒ` exactly as `toYale()` converts
Jyutping today. **`Char`, `Token`, `Line` and the whole player are therefore untouched** — the
language difference lives entirely inside the pack.

```ts
// src/lang/types.ts
export type LangId = 'yue' | 'cmn'

export interface RomanizationStyle {
  id: string                        // 'jyutping' | 'yale' | 'tonemark' | 'tonenum'
  label: string
  render(syllable: Syllable): string
}

export interface LanguagePack {
  id: LangId
  label: string                     // 粵語 / 普通話
  annotate(line: string, opts: SegmentOptions): Token[]
  romanizations: RomanizationStyle[]
  audioDir: string                  // 'audio/syl' | 'audio/pin'
  manifest: string                  // 'data/syllables.json' | 'data/pinyin.json'
}
```

Both languages share some syllable spellings (`sin1` is valid in each), but never collide: the pack
carries its own directory and manifest.

**New:** `src/lang/types.ts`, `src/lang/yue.ts` (wraps existing `annotateLine` + `toYale`),
`src/lang/cmn.ts` (pinyin-pro + `numToMark`), `src/lang/index.ts` (lazy pack loader).

**Changed:**

| File | Change |
|---|---|
| `audio/index.ts` | `createAudioEngine(ctx, { dir, manifest })` — currently hardcodes both |
| `romanize/show.ts` | Becomes `pack.romanizations.find(…)!.render(s)`; the `yale` branch moves into `lang/yue.ts` |
| `annotate/index.ts` | Unchanged; `lang/yue.ts` wraps it as-is |
| `storage/index.ts` | `Settings.romanization` → `{ yue, cmn }`, with migration; IndexedDB v1→v2 |
| `types.ts` | `Song` gains `lang: LangId`; `SongCandidate` gains `genre`, `langGuess` |
| `search/index.ts`, `itunes.ts` | HK+TW fan-out, genre capture, merge rule |

The Mandarin pack is a lazy chunk, so a Cantonese-only user never downloads pinyin-pro — the
pattern `opencc-js` already uses.

## 7. Cache restructuring

`cacheSong()` currently stores the fully *annotated* `Song`, with Jyutping baked into every token.
Flipping the toggle would make every cached syllable wrong. Rather than key by `[lrclibId, lang]`
and store each song twice, the cache stores **raw lyric lines** and annotation happens at render.
Annotation is a pure function over a few hundred characters, so the cost is negligible; the cache
becomes language-independent; toggling needs no network and no second entry.

The stored record is therefore no longer a `Song`. `Song` remains the in-memory, annotated view,
and its `lang` field records which pack produced the tokens currently held. What IndexedDB holds is:

```ts
export interface CachedLyric {
  lrclibId: number          // keyPath, unchanged
  title: string             // byTitleArtist index, unchanged
  artist: string
  raw: SourceLine[]         // exactly what fetchLyrics() returns
  langGuess?: LangId        // carried through so a cache hit still seeds the toggle
}
```

`getCachedSong*()` become `getCachedLyric*()` and return this record; the caller annotates with the
active pack. Keeping `lrclibId` as the keyPath and `['title','artist']` as the index means the
existing lookup-before-fetch behaviour is preserved exactly.

This is an IndexedDB bump to `ktv-lyric-v2`. Because the store is purely a cache, the upgrade drops
and recreates it rather than migrating records.

## 8. Mandarin audio pipeline

**Inventory is derived, not assumed.** Run pinyin-pro over every CJK character in `dict.json`'s
76,964 headwords and collect the distinct normalized syllables. Coverage is then provably complete
for anything the dictionary knows — stronger than shipping a canonical table and hoping it matches.
Expected output is roughly 1,300 keys.

**Normalizer.** A single pure function maps pinyin-pro's numeric output to `/^[a-z]+[0-4]$/`, shared
by the build script and the runtime pack, and unit-tested. Which digit pinyin-pro emits for neutral
tone (0 or 5) is **unverified** — the normalizer absorbs either, and the first implementation task
must confirm it empirically.

**`scripts/build-pinyin-audio.mjs`** mirrors `build-audio.mjs` so the two review side by side: same
resumability (skip when the mp3 exists), same ffmpeg chain (silence-trim →
`loudnorm=I=-16:TP=-1.5:LRA=11` → 48 kbps mono), same manifest write. It differs only at the
source — instead of reading WAVs from a dataset checkout, it calls Polly `SynthesizeSpeech` with
`VoiceId=Zhiyu`, `Engine=neural`, wrapping each key as:

```xml
<speak><phoneme alphabet="x-amazon-pinyin" ph="wo3">我</phoneme></speak>
```

Credentials come from the ambient AWS profile at build time; nothing enters the repo or the bundle,
exactly as `CANTONE_DIR` does today. Roughly 40k characters against a 5M/month free tier.

**Coverage is asserted.** AWS documents that Polly declines certain pinyin strings, so the build
fails loudly listing any key that produced no audio rather than shipping a bank with holes.
`scripts/coverage.test.mjs` gains the Mandarin equivalent of its existing check.

Size: ~6 MB on top of the existing 17 MB, against a 1 GB Pages cap.

## 9. Error handling

`audio/index.ts` already returns `null` for a syllable absent from the manifest, and
`playSequence()` skips it without advancing the clock, so missing Mandarin audio degrades to the
same "no audio" marker Cantonese shows today.

The genuinely new failure is the **lazy pack chunk failing to load** (offline, cache miss). That
surfaces as the toggle reverting to its previous position with a message — never a blank lyric view.

## 10. Accepted imperfections

- **Tone sandhi.** Display shows citation tones and audio plays isolated syllables, so 你好 renders
  *nǐ hǎo* and plays two third tones. Self-consistent, but not connected speech. Cantonese had no
  equivalent problem.
- **Polyphone grouping.** pinyin-pro selects readings using its own internal segmentation while
  `Token` grouping uses greedy longest-match over dictionary keys. A divergence is cosmetic and
  cannot produce a wrong reading — the same argument `annotate/index.ts` already makes for
  to-jyutping.
- **Guess misses.** A song whose genre is uninformative defaults to Cantonese and may be wrong. The
  toggle, not the guess, is what makes this acceptable.

## 11. Testing

The standing rule holds: **no lyric fixtures anywhere, including tests.** Synthetic phrases only
(你好, 一個蘋果).

New coverage:

- Syllable normalizer, including whichever neutral-tone digit pinyin-pro emits
- Genre → `LangId` table, including uninformative values and the merge-prefers-defined rule
- Pack selection, and lazy-load failure reverting the toggle
- `Settings` migration from the legacy flat `'jyutping' | 'yale'` string
- IndexedDB v1→v2 upgrade
- `search/contract.live.test.ts` gains HK/TW storefront assertions

## 12. Licensing

Unchanged obligations, plus:

- **pinyin-pro** — MIT. Bundled as a lazy chunk; attribution in `Credits.tsx`.
- **Mandarin audio** — generated by Amazon Polly, which grants storage and redistribution of
  generated speech. Credit Polly in `Credits.tsx` alongside the existing Cantonese audio credit.

The app stays non-commercial and un-monetised: words.hk and rime-cantonese upstream data prohibit
commercial use.

## 13. Out of scope

- Any third language. `LanguagePack` makes one a single new file, but none is planned.
- Tone sandhi in either display or audio.
- Re-annotating or migrating songs already in the v1 cache — it is dropped.
- Restoring the US storefront behind a setting.
