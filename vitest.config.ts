import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    env: { BASE_URL: '/ktv-lyric/' },
    // Extend Vitest's built-in excludes rather than replacing them — a bare
    // `exclude: [...]` here would drop the default node_modules/dist/etc
    // patterns and let vitest walk into things like node_modules.
    exclude: [...configDefaults.exclude, '**/*.live.test.ts'],
  },
})
