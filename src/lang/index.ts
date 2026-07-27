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
