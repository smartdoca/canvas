import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/browser', timeout: 90000, workers: 1,
  use: { baseURL: process.env.AIDCANVAS_TEST_URL || 'http://127.0.0.1:4179', headless: true, launchOptions: { executablePath: process.env.CANVAS_BROWSER || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } },
  webServer: process.env.AIDCANVAS_TEST_URL ? undefined : { command: 'yarn dev --host 127.0.0.1 --port 4179', url: 'http://127.0.0.1:4179', reuseExistingServer: true },
})
