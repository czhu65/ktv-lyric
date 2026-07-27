// Transcode the amazonHiuJin subset of AlienKevin/cantone to 48kbps mono MP3.
// ONLY amazonHiuJin: it is Amazon Polly output, and Amazon is the only vendor
// with an explicit written grant to cache and redistribute generated speech.
// The apple*/microsoft* subsets are NOT cleared by the dataset's MIT tag.
//
// Run: CANTONE_DIR=<path> node scripts/build-audio.mjs
//
// ffmpeg binary: this environment does not have ffmpeg on PATH. Set FFMPEG_BIN
// to an absolute path (defaults to 'ffmpeg', which works once it is on PATH).
//   FFMPEG_BIN="/c/.../ffmpeg.exe" CANTONE_DIR=<path> node scripts/build-audio.mjs
import { execFileSync } from 'node:child_process'
import { readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, basename, extname } from 'node:path'

const SRC = process.env.CANTONE_DIR // local checkout of the amazonHiuJin WAV dir
const OUT = 'public/audio/syl'
const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg'

if (!SRC || !existsSync(SRC)) {
  throw new Error(
    'Set CANTONE_DIR to the amazonHiuJin directory. Obtain it with:\n' +
      '  GIT_LFS_SKIP_SMUDGE=1 git clone https://huggingface.co/datasets/AlienKevin/cantone\n' +
      '  cd cantone && git lfs pull --include="amazonHiuJin/**"\n' +
      '  export CANTONE_DIR=cantone/amazonHiuJin',
  )
}

mkdirSync(OUT, { recursive: true })
const syllables = []
const skipped = []
const failed = []

const files = readdirSync(SRC).filter((f) => extname(f) === '.wav')
console.log(`found ${files.length} .wav files in ${SRC}`)

let i = 0
let reused = 0
for (const f of files) {
  i++
  const syl = basename(f, '.wav')
  if (!/^[a-z]+[1-6]$/.test(syl)) {
    console.warn(`skipping unexpected filename: ${f}`)
    skipped.push(f)
    continue
  }
  // Resumable: ~3,900 ffmpeg invocations take 15-30 minutes, so an interrupted
  // run must not start over. Delete public/audio/syl to force a full rebuild.
  if (existsSync(join(OUT, `${syl}.mp3`))) {
    syllables.push(syl)
    reused++
    continue
  }
  try {
    execFileSync(FFMPEG_BIN, [
      '-y', '-loglevel', 'error',
      '-i', join(SRC, f),
      '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,'
           + 'areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,'
           + 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-ac', '1', '-b:a', '48k', '-codec:a', 'libmp3lame',
      join(OUT, `${syl}.mp3`),
    ])
    syllables.push(syl)
  } catch (err) {
    console.error(`FAILED to transcode ${f}: ${err.message}`)
    failed.push(f)
  }
  if (i % 200 === 0 || i === files.length) {
    console.log(`progress: ${i}/${files.length} (${syllables.length} ok, ${failed.length} failed, ${skipped.length} skipped)`)
  }
}

syllables.sort()
mkdirSync('public/data', { recursive: true })
writeFileSync('public/data/syllables.json', JSON.stringify(syllables))
console.log(`transcoded ${syllables.length} syllables`)
if (skipped.length) console.log(`skipped ${skipped.length}: ${skipped.join(', ')}`)
if (failed.length) console.log(`failed ${failed.length}: ${failed.join(', ')}`)
