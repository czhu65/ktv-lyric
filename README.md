# Cantonese & Mandarin KTV Lyrics

A free, non-commercial study tool for learning to sing Canto-pop and Mandopop.

Search a song by title in Traditional **or** Simplified Chinese, and get the lyric with Jyutping
(Cantonese) or pinyin (Mandarin) above every character, with a per-song toggle between the two.
Tap any character to hear it pronounced (Cantonese only for now — see
[Known limitations](#known-limitations)) and see what it means. Play a line, or the whole lyric,
with an adjustable gap between lines.

**Live:** https://czhu65.github.io/ktv-lyric/

## How it works

Entirely static — there is no backend. Song metadata comes from the iTunes Search API and lyrics
from [LRCLIB](https://lrclib.net/), both called directly from your browser. **This site stores no
lyrics.** Romanization, glossing and audio are all local: Jyutping from
[to-jyutping](https://github.com/CanCLID/to-jyutping) and pinyin from
[pinyin-pro](https://github.com/zh-lx/pinyin-pro), definitions from a CC-CEDICT + CC-Canto merge,
and one pre-recorded MP3 per Cantonese syllable.

- **Dictionary:** 76,964 entries, ~961 KB gzip. Built from CC-CEDICT plus CC-Canto, with headwords
  capped at two characters (see [Regenerating the data](#regenerating-the-data)).
- **Cantonese audio:** 3,884 syllable clips, ~17 MB, covering 99.2% of the syllables the annotator
  can emit. 14 syllables have no recording — see
  [`docs/known-audio-gaps.md`](docs/known-audio-gaps.md) for the full list; the one that matters in
  practice is the Cantonese negation particle (唔 `m4`), which is common in everyday speech and
  lyrics.
- **Mandarin audio:** not shipped yet. The build script and coverage test exist
  (see [Regenerating the audio banks](#regenerating-the-audio-banks)) but no synthesis has been run,
  so Mandarin lyrics currently show pinyin and glosses only, with no tap-to-hear playback. The app
  degrades quietly when the bank is absent — see [Known limitations](#known-limitations).

## Develop

```bash
npm install
npm run dev      # local dev server
npm test         # unit tests
npm run test:live  # live API contract checks (needs network; not part of CI gating)
npm run build    # production build
```

## Regenerating the data

Run manually, not in CI. Its output is committed. In some environments (e.g. where the `node` on
`PATH` is not a working Node 20+), invoke `node` by its absolute path instead.

```bash
# Dictionary — needs network. See the script header for the one-off CC-Canto unzip.
node scripts/build-dict.mjs
```

## Regenerating the audio banks

Both audio scripts are run manually, not in CI. Their output (`public/audio/*/`,
`public/data/{syllables,pinyin}.json`) is committed. Both need `ffmpeg` on `PATH` (or `FFMPEG_BIN`
set to an absolute path) and are resumable — an interrupted run can simply be re-run; delete the
output directory first to force a full rebuild instead.

**Cantonese** (`public/audio/syl/`, 3,884 clips, ~17 MB) — needs a local copy of the
[`AlienKevin/cantone`](https://huggingface.co/datasets/AlienKevin/cantone) dataset:

```bash
git lfs install
git clone https://huggingface.co/datasets/AlienKevin/cantone
CANTONE_DIR=cantone/amazonHiuJin node scripts/build-audio.mjs
```

Only the `amazonHiuJin` voice is used. It is Amazon Polly output, and Amazon is the only TTS vendor
with an explicit written grant permitting cached audio to be redistributed. Transcoding ~3,900
files takes 15–30 minutes.

**Mandarin** (`public/audio/pin/`) — **not yet run**; `public/data/pinyin.json` and
`public/audio/pin/` do not exist in this repo, so Mandarin lyrics currently show pinyin and glosses
with no tap-to-hear audio (the app degrades quietly — see
[Known limitations](#known-limitations)). Two backends, selected with `--backend=piper|polly`:

```bash
# piper (default): fully offline, but requires a local Piper binary and a
# Mandarin (zh_CN) voice model that THIS SCRIPT DOES NOT DOWNLOAD. Piper's
# Chinese frontend reads characters, not phonemes, so this synthesizes one
# representative character per syllable rather than the syllable itself.
PIPER_BIN="/path/to/piper" PIPER_MODEL="/path/to/zh_CN-xxx-medium.onnx" \
  node scripts/build-pinyin-audio.mjs

# polly: requires AWS credentials in the ambient profile (e.g. via
# `aws configure` or AWS_* env vars). Polly's x-amazon-pinyin phoneme
# alphabet can be told the syllable directly, so every syllable is
# synthesizable — no representative-character detour needed.
node scripts/build-pinyin-audio.mjs --backend=polly
```

`scripts/pinyin-coverage.test.mjs` asserts the built bank covers every derivable, reachable
syllable; it skips automatically (rather than failing) while `public/data/pinyin.json` is absent.

## Known limitations

- **Lyric coverage.** LRCLIB is community-contributed and misses roughly 20–40% of post-2015 Hong
  Kong indie material. When lookup fails, paste the lyrics in — everything else still works.
- **Romanization accuracy is roughly 95–99% of characters.** Cantonese tone sandhi is lexicalized
  rather than rule-based, so readings are correct only where a dictionary entry encodes them.
- **Playback is deliberate, not conversational.** Syllable clips are played in sequence, so a line
  sounds measured rather than natural. In exchange, every syllable matches the Jyutping shown above
  it — which a text-to-speech engine cannot guarantee.
- **Word grouping is approximate.** `to-jyutping` exposes no segmentation API, so grouping is
  derived from the dictionary. A mis-grouped word is cosmetic and never changes a pronunciation.
- **Cantonese audio coverage is 99.2%, not 100%.** The 14 syllables with no recording are listed in
  [`docs/known-audio-gaps.md`](docs/known-audio-gaps.md) and shown in the app with a dotted
  underline.
- **Mandarin pronunciation audio is not yet available.** The build script and coverage test are in
  place (see [Regenerating the audio banks](#regenerating-the-audio-banks)), but no synthesis has
  been run, so every Mandarin character currently shows the same dotted "no audio" underline. This
  is a missing bank, not a broken one — the app detects the absent manifest and degrades quietly,
  with no error notice.

## Deploying

This repo ships a GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds and deploys
to GitHub Pages on every push to `main`. To publish your own copy:

1. In the repo's Settings → Pages, set the source to "GitHub Actions".
2. Push (or merge) to `main`. The workflow runs `npm test`, `npm run build`, and publishes `dist/`.
3. The site will be served at `https://<user>.github.io/ktv-lyric/`.

## Credits and licences

Code: MIT. Generated dictionary (`public/data/dict.json`): CC BY-SA 4.0 — see
`public/data/ATTRIBUTION.md`. Full credits are in the app footer.

This is a non-commercial educational project. Lyrics are fetched at runtime from a third party and
are the property of their respective copyright holders.
