import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    env: { BASE_URL: '/ktv-lyric/' },
    exclude: ['**/node_modules/**', '**/*.live.test.ts'],
  },
})
