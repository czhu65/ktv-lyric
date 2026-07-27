# Cantonese KTV Lyrics

A free, non-commercial study tool for learning to sing Canto-pop.

Search a song by title in Traditional **or** Simplified Chinese, and get the lyric with Jyutping
above every character. Tap any character to hear it pronounced and see what it means. Play a line,
or the whole lyric, with an adjustable gap between lines.

**Live:** https://czhu65.github.io/ktv-lyric/

## How it works

Entirely static — there is no backend. Song metadata comes from the iTunes Search API and lyrics
from [LRCLIB](https://lrclib.net/), both called directly from your browser. **This site stores no
lyrics.** Romanization, glossing and audio are all local: Jyutping from
[to-jyutping](https://github.com/CanCLID/to-jyutping), definitions from a CC-CEDICT + CC-Canto
merge, and one pre-recorded MP3 per Cantonese syllable.

- **Dictionary:** 76,964 entries, ~961 KB gzip. Built from CC-CEDICT plus CC-Canto, with headwords
  capped at two characters (see [Regenerating the data](#regenerating-the-data)).
- **Audio:** 3,884 syllable clips, ~17 MB, covering 99.2% of the syllables the annotator can emit.
  14 syllables have no recording — see [`docs/known-audio-gaps.md`](docs/known-audio-gaps.md) for
  the full list; the one that matters in practice is the Cantonese negation particle (唔 `m4`),
  which is common in everyday speech and lyrics.

## Develop

```bash
npm install
npm run dev      # local dev server
npm test         # unit tests
npm run test:live  # live API contract checks (needs network; not part of CI gating)
npm run build    # production build
```

## Regenerating the data

Both scripts are run manually, not in CI. Their output is committed. In some environments (e.g.
where the `node` on `PATH` is not a working Node 20+), invoke `node` by its absolute path instead.

```bash
# Dictionary — needs network. See the script header for the one-off CC-Canto unzip.
node scripts/build-dict.mjs

# Audio — needs ffmpeg (set FFMPEG_BIN to an absolute path if it isn't on PATH)
# and a local copy of the dataset via CANTONE_DIR. Transcoding ~3,900 files takes
# 15-30 minutes; the script is resumable — an interrupted run can simply be re-run.
git lfs install
git clone https://huggingface.co/datasets/AlienKevin/cantone
CANTONE_DIR=cantone/amazonHiuJin node scripts/build-audio.mjs
```

Only the `amazonHiuJin` voice is used. It is Amazon Polly output, and Amazon is the only TTS vendor
with an explicit written grant permitting cached audio to be redistributed.

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
- **Audio coverage is 99.2%, not 100%.** The 14 syllables with no recording are listed in
  [`docs/known-audio-gaps.md`](docs/known-audio-gaps.md) and shown in the app with a dotted
  underline.

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
