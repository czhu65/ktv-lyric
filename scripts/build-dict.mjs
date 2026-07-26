// Build the gloss dictionary. Run: node scripts/build-dict.mjs
// Sources are downloaded, never committed.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
import { parseLine, cleanGloss } from './lib/cedict.mjs'

const CEDICT = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz'
// CC-Canto source: https://cantonese.org/cccanto-170202.zip
// Not fetched here — pre-extracted to scripts/.cache/cccanto.txt (see Step 5 note below).
// Headwords are capped at 2 characters. Most Chinese compounds are two chars, so
// the cap costs almost nothing in grouping quality and halves the payload — and it
// stops greedy longest-match collapsing 愛情故事 into one opaque unit when 愛情 · 故事
// is the better unit for a learner. Measured 2026-07-26: 77,122 entries, 981 KB gzip.
const MAX_WORD = 2
const BUDGET_GZIP = 1_200_000

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  return url.endsWith('.gz') ? gunzipSync(buf).toString('utf8') : buf
}

const parseAll = (text) => text.split('\n').map(parseLine).filter(Boolean)

// CC-Canto ships as a zip; Step 5 extracted it to scripts/.cache/cccanto.txt.
const cantoRows = parseAll(readFileSync('scripts/.cache/cccanto.txt', 'utf8'))
const cedictRows = parseAll(await fetchText(CEDICT))
console.log(`CC-Canto rows: ${cantoRows.length}  CC-CEDICT rows: ${cedictRows.length}`)

// CC-Canto FIRST. The map below is first-write-wins, so load order is what gives
// CC-Canto's Cantonese senses priority over CC-CEDICT's Mandarin ones. CC-CEDICT
// glosses 諗 as "to reprimand" and 睇 as "to cast a sidelong glance", which are
// wrong for Cantonese; CC-Canto has "to think" and "to look at".
const dict = {}
for (const r of [...cantoRows, ...cedictRows]) {
  if (r.trad.length > MAX_WORD) continue
  if (dict[r.trad]) continue
  const g = cleanGloss(r.glosses)
  if (g) dict[r.trad] = g
}

Object.assign(dict, JSON.parse(readFileSync('scripts/lib/overrides.json', 'utf8')))

const json = JSON.stringify(dict)
const gz = gzipSync(Buffer.from(json), { level: 9 }).length
console.log(`entries=${Object.keys(dict).length} raw=${json.length}B gzip=${gz}B`)
if (gz > BUDGET_GZIP) throw new Error(`dictionary ${gz}B exceeds ${BUDGET_GZIP}B budget`)

mkdirSync('public/data', { recursive: true })
writeFileSync('public/data/dict.json', json)
writeFileSync(
  'public/data/ATTRIBUTION.md',
  [
    '# Dictionary attribution',
    '',
    'This file (`dict.json`) is a derivative work released under CC BY-SA 4.0.',
    '',
    '- CC-CEDICT — MDBG, CC BY-SA 4.0',
    '- CC-Canto — (c) 2015-17 Pleco Inc., CC BY-SA 3.0 (relicensed to 4.0 under s.4(b))',
    '- CEDICT — (c) 1997-98 Paul Andrew Denisowski',
    '',
    'Cantonese readings are NOT from these sources; they come from to-jyutping (BSD-2-Clause).',
  ].join('\n'),
)
