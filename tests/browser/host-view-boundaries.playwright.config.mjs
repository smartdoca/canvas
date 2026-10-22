import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import base from '../../playwright.config.mjs'

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: '*.spec.mjs',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4299' },
  webServer: {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    command: 'node node_modules/vite/bin/vite.js --config tests/browser/phone-projection.vite.config.mjs --host 127.0.0.1 --port 4299 --strictPort',
    url: 'http://127.0.0.1:4299/examples/doca/',
    reuseExistingServer: false,
  },
})
