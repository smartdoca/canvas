import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import base from '../../playwright.config.mjs'

const consumer = process.env.CANVAS_PHONE_CONSUMER_DIR
const origin = `http://127.0.0.1:${consumer ? 4200 : 4199}`
export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: '*.spec.mjs',
  use: { ...base.use, baseURL: origin },
  webServer: {
    cwd: consumer || fileURLToPath(new URL('../..', import.meta.url)),
    command: consumer
      ? 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4200 --strictPort'
      : 'node node_modules/vite/bin/vite.js --config tests/browser/phone-projection.vite.config.mjs --host 127.0.0.1 --port 4199 --strictPort',
    // The production consumer builds the example entry, without a root index.
    url: `${origin}/examples/doca/`,
    reuseExistingServer: false,
  },
})
