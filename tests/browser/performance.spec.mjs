import { test, expect } from './fixtures.mjs'
import { writeFile } from 'node:fs/promises'

test('10000 element selection, navigation, resize and 60 seconds idle create zero content or storage writes', async ({ page }) => {
  await page.addInitScript(() => {
    window.largeStorageWrites = 0
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (...args) { window.largeStorageWrites++; return setItem.apply(this, args) }
  })
  await page.goto('/examples/performance/?count=10000'); await page.waitForFunction(() => window.perf)
  await page.evaluate(() => window.perf.handle.select(['n-1', 'n-2']))
  await page.getByRole('button', { name: '放大', exact: true }).click()
  await page.mouse.move(800, 500); await page.mouse.wheel(60, 90)
  await page.setViewportSize({ width: 1200, height: 750 })
  await page.waitForTimeout(60000)
  expect(await page.evaluate(() => window.perf.updates.length)).toBe(0)
  expect(await page.evaluate(() => window.largeStorageWrites)).toBe(0)
  expect(await page.evaluate(() => window.perf.model.getValue().scene.children.length)).toBe(10000)
})

test('10000 elements can be marquee selected, deleted, undone and selected again without a long selection stall', async ({ page }, info) => {
  await page.goto('/examples/performance/?count=10000'); await page.waitForFunction(() => window.perf)
  await page.locator('.canvas-app').focus(); await page.keyboard.press('Shift+1')
  const drag = async () => {
    const box = await page.locator('.canvas-host').boundingBox()
    const start = Date.now()
    await page.mouse.move(box.x + 300, box.y + 65); await page.mouse.down()
    await page.mouse.move(box.x + 980, box.y + 650, { steps: 12 }); await page.mouse.up()
    return Date.now() - start
  }
  const firstMs = await drag()
  expect(await page.evaluate(() => window.perf.handle.getSelection().length)).toBe(10000)
  await page.keyboard.press('Delete')
  await expect.poll(() => page.evaluate(() => window.perf.model.getValue().scene.children.length)).toBe(0)
  await page.getByRole('button', { name: '撤销 (⌘Z)', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.perf.model.getValue().scene.children.length)).toBe(10000)
  await page.locator('.canvas-host').click({ position: { x: 1050, y: 600 } })
  const secondMs = await drag()
  expect(await page.evaluate(() => window.perf.handle.getSelection().length)).toBe(10000)
  expect(Math.max(firstMs, secondMs)).toBeLessThan(10000) // Gross stall guard, not a frame-rate SLA.
  await info.attach('large-selection-timing', { body: JSON.stringify({ firstMs, secondMs }), contentType: 'application/json' })
  await writeFile(info.outputPath('selection-timing.json'), JSON.stringify({ firstMs, secondMs }))
  await page.screenshot({ path: info.outputPath('10000-delete-undo-reselect.png') })
})

test('repeated host flushes reuse an unchanged large snapshot and invalidate it on native edits and undo', async ({ page }) => {
  await page.goto('/examples/performance/?count=5000'); await page.waitForFunction(() => window.perf)
  const result = await page.evaluate(async () => {
    const { Leafer } = await import('/node_modules/.vite/deps/leafer-ui.js')
    const app = Leafer.list.list.find(item => item.isApp), original = app.tree.toJSON, item = app.tree.children.find(item => item.id === 'n-1')
    window.perf.handle.flush()
    let serializations = 0
    app.tree.toJSON = function (...args) { serializations++; return original.apply(this, args) }
    for (let i = 0; i < 10; i++) window.perf.handle.flush()
    const idleSerializations = serializations, before = item.x
    item.x = 777; window.perf.handle.flush()
    const after = window.perf.handle.getValue().scene.children.find(node => node.id === 'n-1').x
    window.perf.handle.undo()
    const undone = window.perf.handle.getValue().scene.children.find(node => node.id === 'n-1').x
    app.tree.toJSON = original
    return { idleSerializations, before, after, undone }
  })
  expect(result).toEqual({ idleSerializations: 0, before: 30, after: 777, undone: 30 })
})

test('10000 element collaboration projection changes only the affected native object and retains the App', async ({ page }) => {
  await page.goto('/examples/performance/?count=10000'); await page.waitForFunction(() => window.perf)
  const result = await page.evaluate(async () => {
    const { Leafer, PropertyEvent } = await import('/node_modules/.vite/deps/leafer-ui.js')
    const app = Leafer.list.list.find(item => item.isApp), item = app.tree.children.find(item => item.id === 'n-1')
    const touched = new Set(), updates = window.perf.updates.length
    const listener = app.tree.on_(PropertyEvent.CHANGE, event => { if (event.target?.id) touched.add(event.target.id) })
    for (let i = 0; i < 12; i++) { window.perf.model.patch('n-1', { x: 100 + i }); await window.perf.frame() }
    app.tree.off_(listener)
    return { touched: [...touched], sameApp: Leafer.list.list.find(node => node.isApp) === app, sameItem: app.tree.children.find(node => node.id === 'n-1') === item, x: item.x, writes: window.perf.updates.length - updates }
  })
  expect(result).toEqual({ touched: ['n-1'], sameApp: true, sameItem: true, x: 111, writes: 12 })
})

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
