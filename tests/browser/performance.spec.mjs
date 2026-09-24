import { test, expect } from './fixtures.mjs'

test('layers UI is removed without deleting scene content or native selection/delete/undo commands', async ({ page }) => {
  await page.goto('/examples/performance/?count=1000'); await page.waitForFunction(() => window.perf)
  await expect(page.locator('.layers-panel, .layer-row')).toHaveCount(0)
  expect(await page.evaluate(() => window.perf.model.getValue().scene.children.length)).toBe(1000)
  await page.evaluate(() => window.perf.handle.select(['n-0']))
  expect(await page.evaluate(() => window.perf.handle.getSelection().map(n => n.id))).toEqual(['n-0'])
  await page.evaluate(() => { window.perf.handle.updateSelection({ visible: false }); window.perf.handle.flush() })
  expect(await page.evaluate(() => window.perf.model.getValue().scene.children.find(n => n.id === 'n-0').visible)).toBe(false)
  await page.evaluate(() => { window.perf.handle.removeSelection(); window.perf.handle.flush() })
  expect(await page.evaluate(() => window.perf.model.getValue().scene.children.some(n => n.id === 'n-0'))).toBe(false)
  await page.evaluate(() => window.perf.handle.undo())
  expect(await page.evaluate(() => window.perf.model.getValue().scene.children.some(n => n.id === 'n-0'))).toBe(true)
  await page.evaluate(() => window.perf.model.setReadOnly(true))
  expect(await page.evaluate(() => { try { window.perf.model.patch('n-1', { x: 0 }); return false } catch { return true } })).toBe(true)
})

test('10000 element export stays bounded and read-only; regression guard against per-element full layout', async ({ page }) => {
  await page.goto('/examples/performance/?count=10000'); await page.waitForFunction(() => window.perf)
  await expect(page.locator('.layers-panel, .layer-row')).toHaveCount(0)
  const result = await page.evaluate(async () => {
    const { model, handle, updates } = window.perf
    const before = JSON.stringify(model.getValue()), count = updates.length, start = performance.now()
    const output = await handle.exportFile({ format: 'svg' })
    const ms = performance.now() - start, text = await output.blob.text()
    return { ms, paths: (text.match(/<path /g) || []).length, textNodes: (text.match(/<text /g) || []).length, unchanged: before === JSON.stringify(model.getValue()), writes: updates.length - count }
  })
  expect(result.paths).toBe(8000); expect(result.textNodes).toBe(2000)
  expect(result.ms).toBeLessThan(5000) // Coarse regression budget, not a cross-device SLA.
  expect(result.unchanged).toBe(true); expect(result.writes).toBe(0)
})
