import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const loadedEnv = loadEnv(mode, process.cwd(), '')

  return {
    test: {
      environment: 'node',
      include: ['server/test-integration/**/*.{test,spec}.ts'],
      testTimeout: 20_000,
      hookTimeout: 20_000,
      env: {
        DATABASE_URL: loadedEnv.DATABASE_URL ?? '',
        INDICA_DATABASE_IS_EXCLUSIVE: loadedEnv.INDICA_DATABASE_IS_EXCLUSIVE ?? '',
        INDICA_ALLOW_EXCLUSIVE_DB_TESTS: loadedEnv.INDICA_ALLOW_EXCLUSIVE_DB_TESTS ?? '',
      },
    },
  }
})
