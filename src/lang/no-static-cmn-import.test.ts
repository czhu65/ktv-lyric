import { describe, it, expect } from 'vitest'
// @ts-expect-error -- plain ESM build-script helper, no .d.ts (same pattern
// pinyin-syllable.test.ts uses for scripts/lib/pinyin-inventory.mjs)
import { findStaticImportsOf } from '../../scripts/lib/find-static-imports.mjs'

// cmn.ts pulls in pinyin-pro (~288 kB) and must be reachable ONLY through
// getPack's dynamic `import('./cmn')` in src/lang/index.ts -- that is what
// makes the Mandarin pack a lazy chunk a Cantonese-only user never
// downloads (see the comment atop index.ts). Nothing else enforces this:
// tsc doesn't care whether an import is static or dynamic, and the rest of
// the suite is just as green either way -- a future
// `import { cmnPack } from './cmn'` added to, say, index.ts would silently
// add 288 kB to the entry bundle. This reads every production source file
// under src/ (skipping tests) and fails if any of them statically imports
// cmn.ts. Verified to actually catch this: temporarily adding
// `import { cmnPack } from './cmn'` to src/lang/index.ts made this test
// fail, and removing it made it pass again.
describe('the Mandarin pack stays a lazy chunk', () => {
  it('is never statically imported by production code under src/', () => {
    const offenders = findStaticImportsOf('src', 'cmn')
    expect(offenders).toEqual([])
  })
})
