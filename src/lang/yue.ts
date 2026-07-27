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
