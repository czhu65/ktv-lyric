# KTV Cantonese Lyric & Pronunciation App — Design

**Date:** 2026-07-26
**Status:** Design approved in brainstorming; awaiting spec review before implementation planning.
**Repo:** `ktv-lyric` (empty at time of writing)

---

## 1. Purpose

A web app that helps a **Cantonese language learner** study Canto-pop songs. The user searches for a
song by title, picks it from a list, and gets the full lyric with Cantonese romanization above every
Chinese character, a short English gloss on tap, and real audio pronunciation for every character.

The learner framing matters and shapes several decisions below: this is a study tool, not a
karaoke-night crammer. There is no backing track, no sing-along scrolling, and no attempt to
synchronise to a recording.

### Success criteria

1. Type a song title in **Traditional or Simplified Chinese** and get a usable list of songs + artists.
2. Pick one and see the full lyric annotated with Jyutping on every Chinese character.
3. Tap any character to hear its correct Cantonese pronunciation.
4. Tap any character or word to see a short English meaning.
5. Play a whole line, or the whole lyric, with a configurable gap between lines.
6. Toggle between Jyutping and Yale romanization.
7. All of the above works as a **100% static site on GitHub Pages** — no backend, no serverless
   function, no secret in the bundle.

### Non-goals (explicitly out of scope)

- **Spaced-repetition vocabulary review.** Considered and rejected by the user.
- **A staccato character-by-character drill mode.** Superseded by tap-to-hear.
- **Synchronising to an audio recording.** No backing track is played, ever.
- **Word-level or character-level karaoke timing.** No source provides it (see §11).
- **Monetisation.** Several data licences in use are non-commercial-friendly but not
  commercial-friendly. See §10.
- **Offline-first.** Offline *works* as a consequence of caching, but is not a design driver.

---

## 2. Locked decisions

These were settled during brainstorming and are inputs to the design, not open questions.

| Decision | Choice | Rationale |
|---|---|---|
| Audience | Cantonese learner | Drives glosses + tones over karaoke timing |
| Lyric sourcing | Automatic lookup, **paste-in fallback required** | LRCLIB misses 20–40% of post-2015 HK material |
| Search input script | **Traditional AND Simplified both accepted** | Explicit user requirement; see §5 for why this is expensive |
| Romanization | Jyutping (tone numbers) default, **Yale via toggle** | Jyutping is the native format of every library and dataset used |
| Extras in scope | Meaning on tap; word-level grouping | Word grouping also improves reading accuracy |
| Extras out of scope | SRS review; staccato drill mode | YAGNI |
| Character audio | **On click only** | User changed this mid-brainstorm from auto-advance |
| Line / lyric playback | **Concatenated own clips**, tight in-line gap, configurable inter-line gap | "Natural pace" is undeliverable — see §7 |
| Target | Responsive, phone-online-first, desktop supported | |
| Stack | **Vite + React + TypeScript** | Framework size is rounding error next to 14 MB of audio |
| Host | **GitHub Pages** | Hard constraint from the user |
| Audio source | `AlienKevin/cantone`, **`amazonHiuJin` subset only** | Only voice whose upstream vendor permits redistribution |

---

## 3. Architecture

Architecture **B** of three considered: a static shell that calls CORS-clean public APIs at runtime.

```
  ┌─ user types a title (Traditional OR Simplified) ──┐
  │                                                   │
  │  opencc fold → issue BOTH script variants         │
  ▼                                                   │
 iTunes Search API ──(fails)──► LRCLIB /api/search    │   tier 1: pick a song
  │   trackName · artistName · trackTimeMillis        │
  ▼                                                   │
 LRCLIB /api/get?…&duration=trackTimeMillis/1000      │   tier 2: get the lyric
  │                                                   │
  └──(miss)───────────────────────────────────────────┘
                    ▼
              paste your own                              tier 3: REQUIRED, not optional
                    ▼
  ══════════ everything below is local & deterministic ══════════
   NFC normalize → detect script → (lazy opencc → Traditional)
                    ▼
   to-jyutping over FULL UNBROKEN LINES → Token[]
                    ▼
   render <ruby> · gloss lookup · resolve syllables → audio files
                    ▼
   Web Audio: tap character · ▶ line · ▶ whole lyric
```

### Why not the alternatives

**A — bundle everything, zero runtime network.** Rejected. The full LRCLIB dump is 31.7 GB gzipped
against a 1 GB Pages cap, so this degrades "any song you type" to "any song I pre-picked." The
decisive objection is not technical: GitHub Pages' free tier requires a **public** repo, so a curated
lyric corpus becomes a public, search-indexable, git-history-permanent copy of copyrighted lyrics
under the author's name. Architecture B hosts zero lyrics.

**C — add a Cloudflare Worker CORS proxy.** Rejected. It would unlock NetEase/QQ's deeper catalogue
in ~30 lines, but it is deployed server-side code with its own account, deploy pipeline and failure
mode — it violates the stated constraint. It also does not buy word-level timing, since QQ's QRC and
NetEase's YRC are encrypted as well as CORS-less. **Recorded as a documented escape hatch, not built.**

---

## 4. Module boundaries

Each module is independently testable and knows nothing of the others' internals.

| Module | Responsibility | Depends on |
|---|---|---|
| `script/` | NFC normalize; detect Simplified; lazy-load opencc; convert to Traditional | opencc-js (lazy chunk) |
| `search/` | Dual-script query fan-out, merge + dedupe, debounce, backoff | `script/`, fetch |
| `lyrics/` | LRCLIB fetch, LRC `[mm:ss.xx]` parsing, paste parsing → canonical `Song` | `script/` |
| `annotate/` | Full source line → `Token[]`. Readings from to-jyutping; grouping by longest-match over an **injected** key set | to-jyutping |
| `dict/` | Gloss lookup with per-character decomposition fallback; supplies the key set to `annotate/` | the generated JSON |
| `romanize/` | Jyutping → Yale (pure table, ~40 lines) | nothing |
| `audio/` | Syllable → `AudioBuffer`; fetch, decode, LRU cache | Web Audio |
| `player/` | Playback state machine + scheduling. **No DOM knowledge.** | `audio/` |
| `storage/` | Namespaced settings + IndexedDB song cache | nothing |
| `ui/` | React components; subscribes to `player/` | all of the above |

`player/` having no DOM knowledge is deliberate: it makes the scheduler unit-testable against a fake
clock, which is where timing bugs actually live.

### Core data model

```ts
type Syllable = string            // e.g. "ngo5" — the audio key AND the romanization key

interface Char {
  char: string                    // one Chinese character, or punctuation/Latin
  syllables: Syllable[]           // [] for non-Han. May have LENGTH > 1 — see §6.
}

interface Token {                 // a word as segmented by the to-jyutping trie
  chars: Char[]
  gloss?: string
}

interface Line {
  tokens: Token[]
  timeMs?: number                 // from LRC when available; display/ordering only
}

interface Song {
  title: string
  artist: string
  lines: Line[]
  source: 'lrclib' | 'pasted'
  lrclibId?: number               // cache key
}
```

---

## 5. Script handling

The user requires Simplified input. This is not a checkbox; it is load-bearing.

**LRCLIB performs no query-time script folding whatsoever.** Measured: 浮誇 vs 浮夸 → **0 shared
results out of 20**. 陳奕迅 vs 陈奕迅 → **0 shared of 20**. 囍帖街 vs 喜帖街 → **0 shared of 20/18**.
A user typing the "wrong" script does not get degraded results; they get a completely different,
silently wrong result set.

Therefore:

1. **Every search issues both script variants** to both iTunes and LRCLIB, then merges and dedupes.
2. `opencc-js` moves onto the critical path — lazy-loaded on first search (~440 KB gzip for `cn2t`),
   not at boot.
3. **Simplified text must never reach the Jyutping engine.** It fails *silently and confidently* on
   merger characters: 萝卜 → `buk1` instead of `baak6`; 忧郁 → `juk1` instead of `wat1`; 干部 →
   `gon1` instead of `gon3`. Roughly 6 of 20 tested merger cases fail. Convert to Traditional first.
4. Lyric bodies themselves are clean: measured across 117 real bodies, **112 pure Traditional,
   5 pure Simplified, 0 mixed**. The 5 Simplified ones are Mandarin cover recordings. So body
   conversion is a clean one-shot decision, not per-character repair.
5. Artist-name **metadata** mixing is severe by contrast — one 20-row result set contained 8
   Traditional + 8 Simplified + 4 Latin artist strings. Fold before deduping search results.
6. Call `.normalize('NFC')` on all input. This is sufficient for compatibility ideographs — NFC
   *removes* them (460 of 512 code points have singleton canonical decompositions); the 12
   NFC-resistant ones are Japan-only rare glyphs.

---

## 6. Annotation pipeline

**Library:** `to-jyutping@3.1.1` (CanCLID, BSD-2-Clause, zero dependencies). One self-contained file,
389 KB raw / 273 KB gzip, embedding a 48,262-entry trie (30,206 single characters + 18,056 words up
to 6 characters).

`getJyutpingList(text)` returns `[char, jyutping | null][]` — **flat, one pair per character.**

### Word boundaries are not available from the library

**Verified against the README, and it corrects an earlier assumption in this document.** The trie
performs multi-character matching *internally* to choose the right reading, but **no exported function
exposes the resulting segmentation.** There is no `segment()`, `tokenize()`, or word-list API. The full
exported surface is `getJyutpingList`, `getJyutpingText`, `getJyutpingCandidates`, `customize`, and
`jyutpingToIPA` — all of which are per-character or whole-string. Word grouping therefore is **not**
free and needs its own mechanism.

**Mechanism: greedy longest-match against the gloss dictionary's own keys**, trying lengths 6 → 2 and
falling back to a single character. This needs no extra asset, because §8 already ships that keyed map,
and it has a useful property: **every multi-character group is guaranteed to have a gloss**, so grouping
and tap-to-define never disagree.

Segmentation is injected into `annotate/` as a plain key-set parameter rather than imported, so the
module stays decoupled from `dict/` and testable against a five-word fixture.

**Readings are unaffected by segmentation.** They always come from `getJyutpingList` over the full
line. If our grouping ever diverges from the trie's internal matching, the consequence is cosmetic —
a word rendered as two groups — never a wrong pronunciation. That asymmetry is why this approach is
safe despite reimplementing part of the library's behaviour.

### Three traps, each of which silently corrupts output

**1. Annotate whole source lines; never re-annotate display fragments.** The trie is a greedy
longest-match matcher with no context model. Verified: 仙女 annotates correctly as one word, but with
a line break between the two characters, 女 flips from `neoi2` to `neoi5`. Similarly 初生 vs 初生蛋
changes the reading of 生 itself. The pipeline annotates the full unbroken source line, and handles
visual wrapping by **mapping readings back onto display units** — never by re-annotating the wrapped
fragment.

**2. Split every reading on whitespace.** A single character can carry more than one syllable
(瓩 → `cin1 ngaa5`). This is why `Char.syllables` is an array. A naive one-clip-per-character
scheduler silently drops the second syllable.

**3. Tone sandhi (變調) is lexicalized, not productive.** 女 is `neoi2` only where a dictionary entry
encodes it (仙女, 仔女, 傻女, 契女) and `neoi5` everywhere else (女人, 女生). Likewise 文白異讀:
生日 `saang1` vs 生命 `sang1` — entry by entry, no rule. The library's `customize()` **cannot override
a longer built-in entry**, so some sandhi cannot be patched at all.

**Expected accuracy: 95–99% of characters on Traditional lyrics.** The library README claims a flat
"99%" with no stated corpus or methodology; do not repeat that number. This residual error rate is
the justification for tap-to-correct in v2.

### Rejected alternatives

`cantonese-romanisation` returns candidate arrays with no disambiguation; `hanzi-tools` needs the
native `nodejieba` addon and targets Mandarin; `jyutping` and `jyutping-parser` are 404 on npm;
Unihan `kCantonese` is character-only with no word context. There is no credible second choice.

---

## 7. Audio and playback

### Source

`AlienKevin/cantone` on Hugging Face (MIT, 34,489 recordings, 3,904 syllables, 10 voices, 422 MB WAV).
**Take the `amazonHiuJin` subset only** (3,885 syllables) — it is Amazon Polly Hiujin output, and
Amazon is the only vendor with an explicit written grant to cache, store and redistribute generated
speech. Leave the Apple and Microsoft subsets alone; the dataset's blanket MIT tag was applied by a
redistributor and plausibly does not clear those vendors' terms.

Transcode to 48 kbps mono MP3 with ffmpeg (`silenceremove`, `loudnorm` to ≈ −16 LUFS). **Not Opus** —
macOS Safari support is still only partial; MP3 and AAC-LC are universal.

**Upgrade path recorded:** generating the sprite from our own AWS account (~US$1.82, or free under
Polly's 1M-character tier) using `<phoneme alphabet="x-amazon-jyutping" ph="sing2">` makes provenance
unambiguously ours. It is a drop-in asset swap and changes no code.

### Packaging: one file per syllable, not a sprite

**This diverges from the research recommendation, deliberately.** The research proposed a single
~9 MB sprite, fetched once and decoded once. That optimises the wrong resource: 3,885 syllables at
~0.4 s each is ~1,554 s of audio, which decoded to Float32 PCM at 22 kHz mono is **~137 MB resident**.
iOS Safari will kill that tab, and the target is phone-first.

Instead: `audio/syl/{syllable}.mp3` — ~3,885 files, ~3–4 KB each, ~14 MB total in the repo.

| | Sprite | Per-syllable files |
|---|---|---|
| Peak RAM | ~137 MB decoded | ~10 MB (LRU-bounded) |
| First-song cost | 9 MB, all of it | ~300 distinct syllables ≈ 1 MB |
| Offset map | Required, plus a build step | **None — the filename is the key** |
| Repeat songs | — | Syllables overlap heavily; cache warms fast |
| Missing syllable | Silent failure | Impossible — a 404 is loud |

On song load, prefetch that song's distinct syllable set in parallel over HTTP/2 with a small progress
indicator. Decoded `AudioBuffer`s live in a bounded LRU (~600 entries).

**Caching is MVP scope, not a later addition** — the per-file strategy depends on it. The Service
Worker caches the app shell and every syllable file on demand, and `storage/` keeps fetched songs in
IndexedDB keyed by LRCLIB `id`. Together these make a practised song fully offline on second visit and
neutralise the `max-age=600` ceiling described in §12. Bulk-precaching all ~14 MB in one action is v2.

### Scheduling — two separate paths

- **Tap a character** — no scheduling at all. One `source.start()`. This is the dominant interaction
  and should have zero machinery behind it.
- **▶ line / ▶ whole lyric** — lookahead scheduler: a `setTimeout` tick every 25 ms over a 100 ms
  window, issuing `start(when)` in `AudioContext` time. **`setTimeout`, not `setInterval`.**

```
next = ctx.currentTime + lead
for each syllable in line:
    source.start(next)
    next += clipDuration + IN_LINE_GAP      // IN_LINE_GAP fixed, ~120 ms
next += interLineGap - IN_LINE_GAP          // interLineGap = user setting
```

**`requestAnimationFrame` is used only for the visual highlight**, reading `currentTime`. It is
actively wrong as a scheduler tick because it drops to 0 Hz in background tabs.

The commonly-cited justification for lookahead — "`setTimeout` is throttled to ≥1 s in background
tabs" — does **not** apply here: the clamp is waived for pages with an active `AudioContext`, and
Firefox does not throttle such tabs at all. The real reason for lookahead is main-thread jitter from
GC and layout. Moving the tick into a Web Worker is a v2 fix if it ever bites.

`AudioContext` starts **suspended on Chrome desktop too**, not only on mobile, so `resume()` goes
inside the first user gesture. `decodeAudioData` sniffs bytes rather than trusting `Content-Type`,
which makes GitHub Pages' idiosyncratic `audio/mp3` MIME mapping a non-issue.

### Why "natural pace" line playback was rejected

Arbitrary lyric text cannot be pre-generated, so natural prosody would require runtime TTS. The Web
Speech API with `lang="zh-HK"` has **no Cantonese voice on default Windows Chrome/Edge, desktop
Linux, or Firefox**; Apple's Sin-ji exists but iOS 18+ has a documented bug where Settings → Spoken
Content overrides the requested voice; Android over-reports available voices. Worse for a learner:
feeding a bare character to any TTS engine returns the engine's *default* reading — 行 as `hang4`
when the song wants `hong4` — and Web Speech honours no `<phoneme>` escape hatch to force the reading
we computed. Concatenating our own clips is staccato but **guaranteed to match the Jyutping shown
directly above the character**, which is the property that matters for study.

---

## 8. Definitions dictionary

**Source: CC-CEDICT + CC-Canto, merged at build time. Both, not either.**
**Packaging: one plain, eagerly-loaded, gzipped JSON. No sharding, no IndexedDB, no WASM.**

Restrict the merged gloss map to `to-jyutping`'s own 48,262-word vocabulary — the segmenter can never
emit anything outside it — and cap each gloss at ~40 characters:

| | entries | raw | gzip |
|---|---|---|---|
| CC-CEDICT source | 124,733 | 9,824,344 B | — |
| Merged ∩ to-jyutping, ≤40-char gloss | 18,932 | 572,279 B | **245,397 B** |

**~0.25 MB gzip, measured** on the actual built artifact. **98.8% coverage of token instances**,
measured against a 63,346-character Canto-pop corpus. For context, `to-jyutping` itself is 273 KB
gzip — the dictionary is smaller than the library it annotates.

### Neither source works alone

CC-CEDICT contains every colloquial headword but with Mandarin senses that are actively wrong for
Cantonese: it glosses 諗 as "to reprimand", 嚟 as "used in transliteration", 睇 as "to cast a sidelong
glance". CC-Canto corrects those (諗 `nam2` "to think"; 嚟 "to come") but **lacks 攰 entirely** and
carries its own errors (睇 "(verb) to catch"; 哋 "quite; somewhat"; 嘅 mis-paired with Simplified 慨).
Merged, the colloquial test set scores **14/14 characters, 14/15 words**.

Budget ~4 KB gzip (**estimated**) for a hand-curated override list covering the top ~200 colloquial
characters. There is no correct global merge order, so some hand-editing is unavoidable — and this is
the highest quality-per-byte item in the entire app.

### Build step

1. Fetch `cedict_1_0_ts_utf-8_mdbg.txt.gz` and `cccanto-170202.zip`; parse the shared
   `TRAD SIMP [pinyin] {jyutping}? /gloss/` format.
2. **Do not collapse CC-Canto rows onto CC-CEDICT headwords.** Merge only on
   `(trad, simp, normalized-pinyin)` *and* absent jyutping; otherwise append as a separate entry.
   Matching on `(trad, simp)` alone resolves only 4 of 2,456 collisions (0.2%).
3. **Ignore CC-Canto's jyutping entirely** — `to-jyutping` is the single reading authority. Two
   sources of readings would produce visible contradictions between the ruby text and the popover.
4. Handle the 65 lines with slashes inside `{}` and the one known malformed entry.
5. Apply the hand-curated override list last; truncate to ≤40 chars; strip `CL:` and
   `Mandarin equivalent:` noise.
6. Intersect with `to-jyutping`'s vocabulary; emit one gzipped JSON plus a `LICENSE-ATTRIBUTION` file.
7. Runtime: per-character decomposition fallback for the ~1.2% of tapped tokens with no entry.

### Rejected alternatives

- **Sharding by first character** — one 201-character lyric touches 58 of 64 shards (94.3% of the
  corpus). 58 round trips to fetch nearly everything.
- **SQLite over HTTP Range (`sql.js-httpvfs`)** — 599 KB gzip of WASM runtime to avoid shipping
  245 KB of data, *and it is currently broken on GitHub Pages*: Fastly gzips `application/octet-stream`
  and ranges the **compressed** stream, returning 416s. Verified against the canonical live demo.
  Note this is a Fastly behaviour, not a COOP/COEP issue.
- **Prebuilt IndexedDB** — correct for Yomitan's 36 MB install-time import; absurd for a 245 KB `Map`.
- **words.hk** — the best Cantonese data, but OAuth-gated (no CI automation), its public mirror 404s,
  and its Non-Commercial Open Data License 1.0 is share-alike-incompatible with CC BY-SA. **Deferred
  to v2** as the escalation path if colloquial coverage disappoints.
- **Unihan / Kaifangcidian / Wiktextract / CantoDict** — characters-only and etymological;
  Chinese-to-Chinese rather than English; 1.1–23 GB; and an unauthorised scrape, respectively.

---

## 9. Error handling and degradation

Design principle: **every failure degrades exactly one tier, never to a blank screen.**

| Failure | Behaviour |
|---|---|
| iTunes down or rate-limited | Fall back to LRCLIB `/api/search` as the picker |
| iTunes rate ceiling (~20 req/min) | Debounce 400 ms; cache query → results in localStorage |
| LRCLIB `/api/get` miss | Retry via `/api/search`, both script variants |
| Both miss (20–40% of modern HK indie) | **Paste box** — tolerant of `[mm:ss.xx]` tags, blank lines, full-width punctuation |
| LRCLIB **429** | Respect `Retry-After`, exponential backoff, and surface *"rate limited, retry in Ns"* explicitly |
| Character has no reading (`null`) | Punctuation, Latin, rare Han. Rendered plain, not a button, skipped in playback. **Not an error.** |
| Syllable has no audio file | Dotted underline; tap explains. The build-time guard (§11) should make this unreachable |
| Token has no gloss (~1.2%) | Per-character decomposition fallback, then "no definition" |
| Offline | Cached app shell, songs and syllables all work. Search disabled with a stated reason, not a spinner |

**Protocol detail:** LRCLIB asks clients to identify themselves, but `User-Agent` is a *forbidden
header* in browsers. Their CORS preflight explicitly allows `Lrclib-Client`, so send
`Lrclib-Client: ktv-lyric/<version> (<site url>)`. It is the only way to comply from a browser.

**Single point of failure, stated plainly:** there is no server-side fallback. If LRCLIB bans this
app's IP range, tiers 1 and 2 vanish and only the paste box remains. That is the accepted cost of the
no-backend constraint, and it is why the 429 path is worth getting right rather than treating as an
edge case.

---

## 10. Licensing and credits

*This section records research findings. It is not legal advice.*

**Lyrics.** Lyrics are separately copyrightable literary works; displaying them is a reproduction
regardless of scale. LRCLIB is community-uploaded with no publisher licensing — its MIT licence
covers the software, not the content. Architecture B is materially safer in one narrow but real
sense: **this repo and its Pages deployment host no lyric corpus**, so there is nothing hosted to take
down. It does not make display licensed. Keep the app non-commercial and un-monetised. GitHub Pages'
ToS separately forbids using it as free hosting for an online business.

**TTS output.** Amazon Polly is the only vendor with an unambiguous grant ("You can cache and replay
Amazon Polly's generated speech at no additional cost"). Microsoft has **no public position** on
redistributing Azure Speech output, and informal guidance is not to redistribute outside your
application — which is why Azure's HK-accented voices were rejected despite sounding more native for
Canto-pop than Polly's Guangzhou-standard Hiujin.

**Dictionary data.** ShareAlike binds the *data file*, not the app code — so the generated dictionary
ships as a **separate `.json`, never inlined into a JS bundle**, released under CC BY-SA 4.0.
CC BY-SA 3.0 §4(b) permits relicensing CC-Canto into 4.0.

**Credits (in-app, not merely in the repo):**

- CC-CEDICT — MDBG, CC BY-SA 4.0
- CC-Canto — © 2015–17 Pleco Inc., CC BY-SA 3.0
- CEDICT — © 1997–98 Paul Andrew Denisowski
- `to-jyutping` — CanCLID, BSD-2-Clause
- `rime-cantonese` — CC BY 4.0
- LSHK `jyutping-table` — CC BY 4.0
- `AlienKevin/cantone` — MIT
- LRCLIB

**Note for any future commercialisation:** `to-jyutping` ships with no data-source attribution
anywhere, and its sibling `rime-cantonese` credits words.hk, whose licence prohibits commercial use
under a broad definition. Fine for a free educational tool; open an issue with CanCLID before ever
monetising.

**Code licences to avoid copying from:** `rzru/nightingale` is GPL-3.0-or-later and
`meetqy/lyrics-pinyin` is AGPL-3.0. `CanCLID/inject-jyutping` is BSD-2-Clause and *is* freely
reusable — read its content-script CSS for ruby-layout workarounds.

---

## 11. Testing

TDD with Vitest. The module boundaries in §4 were chosen so the risky parts are pure functions.

- **Unit tests** — script detection; LRC parsing; Jyutping → Yale; reading-to-display-unit mapping
  across line wraps; and scheduler timeline arithmetic against a **fake clock**. Timing bugs live in
  the scheduler and a fake clock is the only way to test them deterministically.
- **Golden fixtures for annotation** — a table of known polyphone and sandhi cases: 行 `hang4`/`hong4`,
  生 `saang1`/`sang1`, 女 `neoi2`/`neoi5`, 重 `cung4`/`zung6`, 長 `coeng4`/`zoeng2`, plus the
  line-break case (仙女 split across lines) and the multi-syllable character case (瓩). This is the
  regression net for any `to-jyutping` upgrade and the only defence against a *silent* accuracy
  regression.
- **Contract tests** against LRCLIB and iTunes — run in CI but **non-blocking**. They are a canary for
  upstream breakage, not a gate; a volunteer API being down must not fail the build.
- **Build-time assertions:**
  - every syllable the `to-jyutping` trie can emit has a corresponding audio file;
  - the generated dictionary gzips under a hard budget (fail the build above 400 KB).
  The first has an unknown outcome until measured — the trie's syllable set and the `amazonHiuJin`
  set (3,885) are not guaranteed to match. Whatever the gap turns out to be, it must be enumerated
  at build time rather than discovered by a user tapping a silent character.
- **No lyric fixtures in the repo.** Tests use short synthetic phrases. This keeps the "we host zero
  lyrics" property true of the test suite as well as the app.

---

## 12. UI and deployment

**Rendering.** `<ruby>`/`<rt>`, 96.89% global support — the "partial" caveat covers only nested ruby
and vertical writing modes, neither of which is used. Emit ruby markup with **no whitespace between
elements**, or browsers insert stray spaces. Every character is a real `<button>`, giving keyboard
navigation and screen-reader semantics for free, padded to ≥44 px on mobile. Yale is a pure display
transform over the same `Token` model. Jyutping-above vs jyutping-below is a toggle — below is a
legitimate Chinese convention and keeps the lyric line visually dominant.

**Word grouping** (derived per §6, not from the library) is rendered as *spacing*, not decoration:
characters within a `Token` sit tight, and a small gap separates tokens. No boxes, no underlines, no
colour — the lyric must still read as a lyric. Multi-character tokens get a subtle hover/focus
affordance on desktop only.

**The tap gesture does two things at once, by design.** Tapping a character both plays that
character's audio *and* opens the gloss popover for the **token containing it** — one gesture, two
outcomes, no modes to switch between. This is the resolution of an ambiguity in the success criteria,
which list per-character audio and per-character/word meaning as separate items: they are separate
*outputs*, not separate *interactions*. The popover shows the token's characters, their Jyutping (and
Yale when toggled), and the gloss; it dismisses on the next tap elsewhere. Audio fires immediately and
is never gated on the popover rendering.

**Deployment.** Vite `base: '/ktv-lyric/'`; `HashRouter` (Pages returns a real HTTP 404 on deep links,
so this avoids the `404.html` hack entirely); all asset URLs derived from `import.meta.env.BASE_URL`.
Official Actions workflow — `configure-pages@v6` / `upload-pages-artifact@v5` / `deploy-pages@v5` —
which also exempts the project from the 10-builds-per-hour cap.

**Two traps worth naming:**

- Everything under `username.github.io/*` shares **one browser origin**. Namespace every key:
  `ktvlyric:interval`, DB `ktv-lyric-v1`, cache `ktv-lyric-audio-v1`. A bare `settings` key *will*
  collide with the author's other Pages projects.
- Pages hard-codes `Cache-Control: max-age=600` with no override. Neutralising that is a primary
  reason for the Service Worker, not an afterthought.

**Never Git LFS.** Pages serves the pointer stub, and GitHub staff have stated there are no plans to
change this. The ~3,885 audio files go in the repo as ordinary files.

**Pages serves gzip only, never brotli** (measured). Size budgets assume gzip.

---

## 13. Roadmap beyond the MVP

**v2**

- Tap-to-correct Jyutping via `getJyutpingCandidates()` + `customize()`, persisted per song. Turns the
  residual 1–5% error rate into a learning feature. Note the `customize()` limitation in §6.
- Real LRC line timestamps driving whole-line and auto-advance playback.
- A "make available offline" action that precaches the full ~14 MB syllable set in one go, rather
  than warming the cache song by song.
- Own Polly-generated audio, replacing the `cantone` subset and removing the provenance caveat.
- words.hk glosses, if CC-Canto's 2017-frozen coverage proves inadequate.

**v3 — only if the tool earns it**

- Chiron Hei HK (OFL-1.1) with HK glyph forms. Caveat: build-time subsetting requires knowing the
  character set at build time, which runtime-fetched lyrics defeat — fall back to `unicode-range`
  slicing or a system stack, and **measure transferred bytes empirically** (every published CJK
  webfont size found in research traced to secondary sources).
- Research spike: `sherpa-onnx` WASM + `csukuangfj/vits-cantonese-hf-xiaomaiiwn` for fully in-browser
  Cantonese TTS, eliminating the audio bank. Entirely unverified — quality, model size, and
  per-syllable phoneme control are all unknown.

---

## 14. Known risks and unmeasured numbers

Stated plainly rather than papered over.

| Item | Status |
|---|---|
| LRCLIB is a single volunteer project with no fallback | **Accepted risk.** Mitigated by the paste box and IndexedDB caching |
| iTunes Search is an undocumented-SLA legacy endpoint | **Accepted risk.** Mitigated by falling back to LRCLIB search |
| `cantone`'s MIT tag over vendor-synthesized audio | **Accepted with mitigation** — `amazonHiuJin` only; Polly self-generation is the clean upgrade |
| Overlap between the trie's syllable set and `amazonHiuJin`'s 3,885 | **Unmeasured.** Build-time assertion will enumerate the gap |
| Our longest-match grouping vs the trie's internal segmentation | **Will diverge somewhere; unmeasured how often.** Accepted: the divergence is cosmetic only, never a wrong reading (§6) |
| How sparse word grouping looks with an 18,932-key dictionary | **Unmeasured.** If too sparse, the fallback is extracting the full 48,262-entry word list from `to-jyutping`'s `src/trie.txt` at build time |
| Hand-curated colloquial override list (~4 KB) | **Estimated.** The list does not exist yet |
| Dual-keying the dictionary for Simplified (~+270 KB gzip) | **Estimated, not remeasured post-intersection.** Traditional-only keying left 86 of 1,322 lyric characters unglossed, all Simplified — so opencc-js is load-bearing either way |
| GitHub Pages/Fastly gzip level vs local `gzip -9` | **Unmeasured.** Expect a few percent worse |
| CC-Canto frozen at 2017-02-02 (9.5 years stale) | **Accepted.** words.hk is the v2 escalation |
| CJK webfont sizes | **Unmeasured.** All published figures traced to secondary sources. Measure empirically before adopting |
| Real Jyutping accuracy on lyrics | **95–99% estimated.** No published corpus-based measurement exists |
