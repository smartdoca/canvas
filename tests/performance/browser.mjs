import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
const browser = await chromium.launch({ executablePath: process.env.CANVAS_BROWSER || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const results = []
try {
  for (const count of [100, 1000, 5000, 10000]) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    const errors = []; page.on('pageerror', e => errors.push(e.message))
    await page.goto(`${process.env.AIDCANVAS_TEST_URL || 'http://127.0.0.1:4179'}/examples/performance/?count=${count}`)
    await page.waitForFunction(() => window.perf, { timeout: 120000 })
    const result = await page.evaluate(async () => {
      const { model, handle, frame, initMs, mountMs, updates } = window.perf
      const measure = async fn => { const start = performance.now(); await fn(); return performance.now() - start }
      const selectionMs = await measure(async () => { handle.select(['n-1']); await frame() })
      const nativeEditMs = await measure(async () => { handle.updateSelection({ x: 21 }); handle.flush(); await frame() })
      const modelEditMs = await measure(async () => { model.patch('n-2', { x: 65 }); await frame() })
      const before = updates.length
      const svgMs = await measure(() => handle.exportFile({ format: 'svg' }))
      const pngMs = await measure(() => handle.exportFile({ format: 'png' }))
      if (updates.length !== before) throw new Error('EXPORT_WROTE_CONTENT')
      return { initMs, mountMs, selectionMs, nativeEditMs, modelEditMs, svgMs, pngMs, layerRows: document.querySelectorAll('.layer-row').length, domNodes: document.querySelectorAll('*').length }
    })
    if (errors.length) throw new Error(errors.join('\n'))
    results.push({ count, ...result }); console.log(JSON.stringify(results.at(-1)))
    await page.close()
  }
  if (process.env.PERF_OUTPUT) await writeFile(process.env.PERF_OUTPUT, JSON.stringify(results, null, 2))
} finally { await browser.close() }
