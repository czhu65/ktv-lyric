// Synthesize one MP3 per canonical pinyin syllable for the Mandarin audio
// bank (public/audio/pin/*.mp3 + public/data/pinyin.json), mirroring
// scripts/build-audio.mjs's resumability, ffmpeg chain, manifest, and loud
// failure reporting.
//
// Two backends, selected with --backend=piper|polly (default piper):
//
//   piper (default, offline): Piper's Chinese frontend derives the reading
//     from CHARACTERS, not phonemes -- unlike Polly, it cannot be told a
//     syllable directly. So instead of synthesizing the syllable string, we
//     synthesize each syllable's REPRESENTATIVE CHARACTER, chosen by
//     derivePinyinInventory (scripts/lib/pinyin-inventory.mjs) to be one a
//     competent Chinese TTS must read as that syllable. Requires a local
//     PIPER_BIN and a Mandarin PIPER_MODEL; this script does not download
//     either.
//
//   polly (original design, requires AWS credentials): Polly CAN be told the
//     phoneme directly via SSML (`x-amazon-pinyin`), so every syllable is
//     synthesizable by construction and the representative-character detour
//     is unnecessary. Kept behind this flag for when credentials become
//     available. @aws-sdk/client-polly is NOT a project dependency (it isn't
//     needed for the default piper path), so it is imported lazily here,
//     inside the polly branch only.
//
// Both backends skip the `unreachable` syllables (no representative
// character exists -- see the inventory module doc comment) and log the
// count explicitly rather than silently shrinking the manifest.
//
// Run (piper):
//   PIPER_BIN="/path/to/piper" PIPER_MODEL="/path/to/zh_CN-xxx.onnx" \
//     FFMPEG_BIN="/c/.../ffmpeg.exe" node scripts/build-pinyin-audio.mjs
// Run (polly):
//   FFMPEG_BIN="/c/.../ffmpeg.exe" node scripts/build-pinyin-audio.mjs --backend=polly
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { derivePinyinInventory } from './lib/pinyin-inventory.mjs'

const OUT = 'public/audio/pin'
const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg'

const backendArg = process.argv.find((a) => a.startsWith('--backend='))
const BACKEND = backendArg ? backendArg.slice('--backend='.length) : 'piper'
if (BACKEND !== 'piper' && BACKEND !== 'polly') {
  throw new Error(`Unknown --backend=${BACKEND}. Expected "piper" or "polly".`)
}

mkdirSync(OUT, { recursive: true })
const { syllables, representatives, unreachable } = derivePinyinInventory('public/data/dict.json')
console.log(`inventory: ${syllables.length} syllables (backend=${BACKEND})`)

// Never silently shrink the manifest: name the gap and its size every run.
if (unreachable.length) {
  console.log(
    `skipping ${unreachable.length} unreachable syllables (no representative character exists): ` +
      unreachable.join(', '),
  )
}

const wanted = syllables.filter((s) => !unreachable.includes(s))

// -- backend setup: produces a RAW audio file (not yet loudness-normalized
// or resampled) for a given syllable, returning its path. ------------------

let synthesizeRaw // (syl: string) => Promise<string> path to raw audio file

if (BACKEND === 'piper') {
  const PIPER_BIN = process.env.PIPER_BIN
  const PIPER_MODEL = process.env.PIPER_MODEL
  if (!PIPER_BIN || !PIPER_MODEL) {
    throw new Error(
      'piper backend requires PIPER_BIN and PIPER_MODEL environment variables.\n' +
        'Set them to a local Piper binary and a Mandarin (zh_CN) voice model, e.g.:\n' +
        '  PIPER_BIN="/path/to/piper" PIPER_MODEL="/path/to/zh_CN-xxx-medium.onnx" \\\n' +
        '    node scripts/build-pinyin-audio.mjs\n' +
        'This script does not download Piper or any model -- obtain and place them yourself.',
    )
  }

  synthesizeRaw = async (syl) => {
    const ch = representatives[syl]
    const tmp = join(OUT, `${syl}.raw.wav`)
    // Piper reads the text to synthesize from stdin and writes a WAV file.
    execFileSync(PIPER_BIN, ['--model', PIPER_MODEL, '--output_file', tmp], {
      input: ch,
    })
    return tmp
  }
} else {
  // polly backend: imported lazily so the piper (default) path never
  // requires @aws-sdk/client-polly to be installed.
  const { PollyClient, SynthesizeSpeechCommand } = await import('@aws-sdk/client-polly')
  const polly = new PollyClient({})

  synthesizeRaw = async (syl) => {
    const ssml = `<speak><phoneme alphabet="x-amazon-pinyin" ph="${syl}">${syl}</phoneme></speak>`
    const res = await polly.send(
      new SynthesizeSpeechCommand({
        Text: ssml,
        TextType: 'ssml',
        VoiceId: 'Zhiyu',
        Engine: 'neural',
        OutputFormat: 'mp3',
      }),
    )
    const bytes = Buffer.from(await res.AudioStream.transformToByteArray())
    if (bytes.length === 0) throw new Error('empty AudioStream')
    const tmp = join(OUT, `${syl}.raw.mp3`)
    writeFileSync(tmp, bytes)
    return tmp
  }
}

// -- main loop --------------------------------------------------------------

const done = []
const failed = []
let reused = 0

for (let i = 0; i < wanted.length; i++) {
  const syl = wanted[i]
  const finalPath = join(OUT, `${syl}.mp3`)

  // Resumable: an interrupted run must not start over. Delete
  // public/audio/pin to force a full rebuild.
  if (existsSync(finalPath)) {
    done.push(syl)
    reused++
    continue
  }

  let tmp
  try {
    tmp = await synthesizeRaw(syl)
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
    if (tmp && existsSync(tmp)) unlinkSync(tmp)
  }

  if ((i + 1) % 100 === 0 || i === wanted.length - 1) {
    console.log(`progress: ${i + 1}/${wanted.length} (${done.length} ok, ${failed.length} failed)`)
  }
}

done.sort()
mkdirSync('public/data', { recursive: true })
writeFileSync('public/data/pinyin.json', JSON.stringify(done))
console.log(`wrote ${done.length} syllables (${reused} reused, ${unreachable.length} skipped as unreachable)`)

// Fail loudly rather than shipping a bank with silent holes.
if (failed.length) {
  console.error(`\n${failed.length} FAILED: ${failed.join(', ')}`)
  process.exit(1)
}
