import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 45000,
    environment: 'node',
    globals: true,
    setupFiles: ['./test/contracts/setup.js'],
    sequence: {
      concurrent: false,
      shuffle: false
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  }
})