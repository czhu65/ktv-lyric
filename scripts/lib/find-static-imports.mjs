import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Plain ESM (see the comment atop pinyin-inventory.mjs for why): this is
// where fs/path-touching helpers live so the TypeScript project (which has
// no @types/node) doesn't need them. src/lang/no-static-cmn-import.test.ts
// imports this with a @ts-expect-error, the same pattern
// src/lang/pinyin-syllable.test.ts already uses for pinyin-inventory.mjs.

function listSourceFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full))
    } else if (/\.(ts|tsx)$/.test(name) && !name.includes('.test.')) {
      out.push(full)
    }
  }
  return out
}

/**
 * Returns the (repo-relative-ish) paths of every non-test .ts/.tsx file
 * under `srcDir` that contains a STATIC import of a module whose path ends
 * in `/<moduleBasename>` (optionally with a `.ts`/`.tsx` extension).
 *
 * Deliberately does not match `import(...)` (a call, i.e. a dynamic
 * import) -- only `import ... from '...'` / `import '...'` declarations.
 */
export function findStaticImportsOf(srcDir, moduleBasename) {
  const pattern = new RegExp(
    `^\\s*import\\b(?!\\().*['"][^'"]*\\/${moduleBasename}(?:\\.tsx?)?['"]`,
    'm',
  )
  const files = listSourceFiles(srcDir)
  return files.filter((file) => pattern.test(readFileSync(file, 'utf8')))
}
