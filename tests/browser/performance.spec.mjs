import { test, expect } from './fixtures.mjs'
import { writeFile } from 'node:fs/promises'

test('large-board navigation reuses snapshots and never recomputes connector endpoints', async ({ page }) => {
  await page.goto('/examples/performance/?count=5000'); await page.waitForFunction(() => window.perf)
  const result = await page.evaluate(async () => {
    const { Leafer } = await import('/node_modules/.vite/deps/leafer-ui.js')
    const { makeDiagram, makeConnector } = await import('/src/editor/runtime/thinking/scene.ts')
    const app = Leafer.list.list.find(item => item.isApp), { handle, model, frame, updates } = window.perf
    const source = makeDiagram('rounded', 350, 200), target = makeDiagram('rounded', 700, 200)
    const line = makeConnector({ x: 510, y: 230 }, { x: 700, y: 230 }, 'elbow', source.id, target.id)
    app.tree.addMany([source, target, line]); await frame(); handle.flush(); await frame()
    const before = JSON.stringify(model.getValue()), writes = updates.length, from = { ...line.data.from }
    let serializations = 0, endpointReads = 0
    const json = app.tree.toJSON, bounds = source.getBounds
    app.tree.toJSON = function (...args) { serializations++; return json.apply(this, args) }
    source.getBounds = function (...args) { if (args[0] === 'box' && args[1] === 'page') endpointReads++; return bounds.apply(this, args) }
    for (let i = 0; i < 24; i++) { app.tree.x += 3; app.tree.y -= 2; await frame() }
    app.tree.zoom(1.1); await frame()
    await new Promise(resolve => setTimeout(resolve, 180)); handle.flush()
    const navigation = { serializations, endpointReads, writes: updates.length - writes, unchanged: before === JSON.stringify(model.getValue()) }
    source.x += 50; await frame(); handle.flush()
    const edit = { serializations, endpointReads, moved: Math.abs(line.data.from.x - from.x) > 1, persisted: model.getValue().scene.children.find(item => item.id === source.id).x === source.x }
    app.tree.toJSON = json; source.getBounds = bounds
    return { navigation, edit }
  })
  expect(result.navigation).toEqual({ serializations: 0, endpointReads: 0, writes: 0, unchanged: true })
  expect(result.edit.serializations).toBeGreaterThan(0); expect(result.edit.endpointReads).toBeGreaterThan(0)
  expect(result.edit.moved).toBe(true); expect(result.edit.persisted).toBe(true)
})

test('task controls follow navigation without inspecting unrelated offscreen rich text', async ({ page }) => {
  await page.goto('/examples/performance/?count=5000'); await page.waitForFunction(() => window.perf)
  await page.evaluate(async () => {
    const { Leafer, Text } = await import('/node_modules/.vite/deps/leafer-ui.js')
    const app = Leafer.list.list.find(item => item.isApp)
    app.tree.add(new Text({ id: 'pan-task', x: 400, y: 300, width: 300, height: 100, fontSize: 16, text: '待办', data: { richText: { version: 1, value: [{ type: 'paragraph', block: 'task', children: [{ text: '待办' }] }] } } }))
    const unrelated = app.tree.children.find(item => item.id === 'n-4995')
    unrelated.data = { richText: { version: 1, value: [{ type: 'paragraph', children: [{ text: unrelated.text, bold: true }] }] } }
    await window.perf.frame(); window.perf.handle.flush(); await window.perf.frame()
  })
  const checkbox = page.locator('.native-task-checkbox')
  await expect(checkbox).toHaveCount(1)
  const before = await checkbox.boundingBox()
  const reads = await page.evaluate(async () => {
    const { Leafer } = await import('/node_modules/.vite/deps/leafer-ui.js')
    const app = Leafer.list.list.find(item => item.isApp), payload = app.tree.children.find(item => item.id === 'n-4995').data.richText
    const value = payload.value; let reads = 0
    Object.defineProperty(payload, 'value', { configurable: true, enumerable: true, get() { reads++; return value } })
    for (let i = 0; i < 12; i++) { app.tree.x += 5; app.tree.y += 2; await window.perf.frame() }
    Object.defineProperty(payload, 'value', { configurable: true, enumerable: true, writable: true, value })
    return reads
  })
  expect(reads).toBe(0)
  await expect.poll(async () => (await checkbox.boundingBox()).x - before.x).toBeCloseTo(60)
  expect((await checkbox.boundingBox()).y - before.y).toBeCloseTo(24)
  await checkbox.click(); await expect(checkbox).toHaveAttribute('aria-checked', 'true')
  await page.evaluate(() => window.perf.handle.flush())
  expect(await page.evaluate(() => window.perf.model.getValue().scene.children.find(item => item.id === 'pan-task').data.richText.value[0].checked)).toBe(true)
  await page.evaluate(() => window.perf.model.patch('pan-task', { data: { richText: { version: 1, value: [{ type: 'paragraph', children: [{ text: '待办' }] }] } } }))
  await expect(checkbox).toHaveCount(0)
  await page.evaluate(() => window.perf.handle.undo())
  await expect(checkbox).toHaveCount(1)
  await page.evaluate(() => window.perf.model.remove(['pan-task']))
  await expect(checkbox).toHaveCount(0)
})

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
