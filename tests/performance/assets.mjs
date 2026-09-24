import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
const browser = await chromium.launch({ executablePath: process.env.CANVAS_BROWSER || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  const page = await browser.newPage()
  await page.goto(`${process.env.AIDCANVAS_TEST_URL || 'http://127.0.0.1:4179'}/examples/performance/?count=100`)
  await page.waitForFunction(() => window.perf)
  const results = await page.evaluate(async () => {
    const { io } = window.perf, results = []
    for (const side of [1024, 2048, 4096]) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = side
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#88aacc'; ctx.fillRect(0, 0, side, side)
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')), start = performance.now()
      await io.parseCanvasFile(blob)
      const parseMs = performance.now() - start
      // Force pixels: Image.onload alone may only parse headers in Chromium.
      const bitmap = await createImageBitmap(blob); ctx.drawImage(bitmap, 0, 0); ctx.getImageData(0, 0, 1, 1); bitmap.close()
      results.push({ kind: 'png-parse-and-pixels', side, pixels: side * side, fileBytes: blob.size, parseMs, ms: performance.now() - start })
      canvas.width = canvas.height = 0
    }
    for (const count of [100, 500]) {
      const scene = { children: Array.from({ length: count }, (_, i) => ({ id: `rough-${i}`, tag: 'Rect', name: 'rect', x: i % 25 * 40, y: Math.floor(i / 25) * 40, width: 32, height: 32, fill: '#ffc9c9', data: { roughMode: true, roughSeed: 1 + i, roughOriginalFill: '#ffc9c9', roughFillStyle: 'hachure' } })) }
      const start = performance.now(), result = await io.exportCanvasFile({ scene }, { format: 'svg' })
      results.push({ kind: 'rough-svg', count, ms: performance.now() - start, bytes: result.blob.size })
    }
    return results
  })
  console.log(JSON.stringify(results, null, 2))
  if (process.env.PERF_OUTPUT) await writeFile(process.env.PERF_OUTPUT, JSON.stringify(results, null, 2))
} finally { await browser.close() }
