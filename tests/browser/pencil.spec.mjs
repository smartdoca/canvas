import { test, expect } from './fixtures.mjs'

async function open(page) {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.model.remove(window.demo.model.getValue().scene.children.map(node => node.id)))
}
const scene = page => page.evaluate(() => window.demo.model.getValue().scene.children)
const updates = page => page.evaluate(() => window.demo.allUpdates.length)
const pencil = page => page.locator('[data-tool="pen"] > button')
async function reopen(page) {
  const ready = await page.evaluate(() => { const ready = window.demo.readyCount, open = window.demo.openDocument, checkpoint = window.demo.closeDocument(); open(checkpoint); return ready })
  await page.waitForFunction(ready => window.demo?.readyCount > ready, ready)
}
async function draw(page, y, steps = 30) {
  const host = await page.locator('.canvas-host').boundingBox()
  await page.mouse.move(host.x + 360, host.y + y)
  await page.mouse.down()
  await page.mouse.move(host.x + 460, host.y + y + 35, { steps })
  await page.mouse.move(host.x + 560, host.y + y, { steps })
}

async function inkPoints(page, preview = false) {
  return page.evaluate(async preview => {
    const { Leafer } = await import('/node_modules/.vite/deps/leafer-ui.js')
    const app = Leafer.list.list.find(item => item.isApp)
    const all = items => items.flatMap(item => [item, ...all(item.children || [])])
    const path = preview ? app.sky.children.find(item => item.tag === 'Path') : all(app.tree.children).find(item => item.name === 'path')
    const data = path.getPath()
    return Array.from({ length: data.length / 3 }, (_, index) => path.getWorldPoint({ x: data[index * 3 + 1], y: data[index * 3 + 2] }))
  }, preview)
}
function expectSameInk(actual, expected) {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((point, index) => {
    expect(point.x).toBeCloseTo(expected[index].x, 6)
    expect(point.y).toBeCloseTo(expected[index].y, 6)
  })
}

test('unlabelled connectors do not reposition a new element without an assigned ID', async ({ page }) => {
  await open(page)
  const result = await page.evaluate(async () => {
    const { Leafer, Path, Rect } = await import('/node_modules/.vite/deps/leafer-ui.js')
    const { makeConnector, refreshConnectors, connectorLabel } = await import('/src/editor/runtime/thinking/scene.ts')
    const app = Leafer.list.list.find(item => item.isApp)
    const connectors = [makeConnector({ x: 200, y: 180 }, { x: 700, y: 180 }, 'elbow'), makeConnector({ x: 300, y: 500 }, { x: 800, y: 500 }, 'straight')]
    connectors.forEach(connector => app.tree.add(connector))
    const ink = new Path({ name: 'path', stroke: '#646a73', path: 'M360 280L560 320' })
    app.tree.add(ink)
    refreshConnectors(app)
    const inkPosition = { x: Number(ink.x || 0), y: Number(ink.y || 0) }
    // Assign immediately so even the broken implementation cannot queue an
    // endless refresh loop while this regression reports its coordinates.
    ink.id = 'fresh-ink'
    const shape = new Rect({ name: 'rect', x: 400, y: 250, width: 100, height: 80, fill: '#fff' })
    app.tree.add(shape)
    refreshConnectors(app)
    const shapePosition = { x: shape.x, y: shape.y }
    shape.id = 'fresh-shape'
    const label = connectorLabel(app, connectors[0])
    refreshConnectors(app)
    return { inkPosition, shapePosition, labelName: label.parent.name, ownerId: label.parent.data.ownerId, connectorId: connectors[0].id }
  })
  expect(result.inkPosition).toEqual({ x: 0, y: 0 })
  expect(result.shapePosition).toEqual({ x: 400, y: 250 })
  expect(result.labelName).toBe('connector-label')
  expect(result.ownerId).toBe(result.connectorId)
})

test('pencil points stay fixed among unlabelled connectors after release and undo/redo', async ({ page }) => {
  await open(page)
  await page.evaluate(async () => {
    const { makeConnector } = await import('/src/editor/runtime/thinking/scene.ts')
    for (const y of [180, 500]) {
      const connector = makeConnector({ x: 250, y }, { x: 720, y }, 'elbow')
      window.demo.handle.addElement(connector.toJSON()); connector.destroy()
    }
    window.demo.handle.flush()
  })
  const before = await scene(page)
  await pencil(page).click()
  await draw(page, 330)
  const points = await inkPoints(page, true)
  await page.mouse.up()
  expectSameInk(await inkPoints(page), points)
  await page.getByRole('button', { name: '撤销 (⌘Z)', exact: true }).click()
  expect(await scene(page)).toEqual(before)
  await page.getByRole('button', { name: '重做 (⇧⌘Z)', exact: true }).click()
  expectSameInk(await inkPoints(page), points)
})

test('the first pencil stroke previews without document writes, then commits once and leaves tools responsive', async ({ page }, info) => {
  await open(page)
  const baseline = await scene(page), beforeUpdates = await updates(page)
  await pencil(page).click()
  await draw(page, 270, 80)
  // A host may flush at any time; an unfinished stroke must remain local.
  await page.evaluate(() => window.demo.handle.flush())
  expect(await scene(page)).toEqual(baseline)
  expect(await updates(page)).toBe(beforeUpdates)
  await page.screenshot({ path: info.outputPath('pencil-preview.png') })
  await page.mouse.up()
  await expect.poll(() => updates(page)).toBe(beforeUpdates + 1)
  const first = (await scene(page)).find(node => node.name === 'path')
  expect(first.path.length).toBeGreaterThan(300)
  expect(first.path[0]).toBe(1)
  expect(Math.abs(first.path[1] - 360)).toBeLessThanOrEqual(1)
  expect(Math.abs(first.path[2] - 270)).toBeLessThanOrEqual(1)
  expect(first.path.slice(-3)).toEqual([2, 560, 270])
  expect(first.path.every(Number.isFinite)).toBe(true)
  await expect(page.locator('.canvas-stage')).toHaveAttribute('data-active-tool', 'path')
  await draw(page, 360)
  await page.mouse.up()
  await expect.poll(async () => (await scene(page)).filter(node => node.name === 'path').length).toBe(2)
  await page.getByRole('button', { name: '选择 (V / 1)', exact: true }).click()
  await expect(page.locator('.canvas-stage')).toHaveAttribute('data-active-tool', 'init')
  await page.getByRole('button', { name: '撤销 (⌘Z)', exact: true }).click()
  expect((await scene(page)).filter(node => node.name === 'path')).toEqual([first])
  await page.getByRole('button', { name: '重做 (⇧⌘Z)', exact: true }).click()
  expect((await scene(page)).filter(node => node.name === 'path')).toHaveLength(2)
  const beforeReopen = await scene(page)
  await reopen(page)
  expect(await scene(page)).toEqual(beforeReopen)
})

test('six pencil width presets apply to new strokes and remain selected when the menu reopens', async ({ page }, info) => {
  await open(page)
  for (const [index, width] of [1.5, 3, 5, 8, 12, 20].entries()) {
    await pencil(page).click()
    const picker = page.getByRole('group', { name: '线宽', exact: true })
    await expect(picker.getByRole('button')).toHaveCount(6)
    await picker.getByRole('button', { name: `线宽 ${width} px`, exact: true }).click()
    await draw(page, 200 + index * 75, 12)
    await page.mouse.up()
    await expect.poll(async () => (await scene(page)).filter(node => node.name === 'path').length).toBe(index + 1)
    expect((await scene(page)).filter(node => node.name === 'path').at(-1).strokeWidth).toBe(width)
  }
  await pencil(page).hover()
  await expect(page.getByRole('button', { name: '线宽 20 px', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('menu', { name: '铅笔 (P)', exact: true }).evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)))
  await page.screenshot({ path: info.outputPath('pencil-width-presets.png') })
  await page.keyboard.press('Escape')
  const saved = await scene(page)
  await reopen(page)
  expect(await scene(page)).toEqual(saved)
})

test('Escape discards a live stroke and zoomed drawing preserves its preview and final position', async ({ page }, info) => {
  await open(page)
  await pencil(page).click()
  const baseline = await scene(page), beforeUpdates = await updates(page)
  await draw(page, 300)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.evaluate(() => window.demo.handle.flush())
  expect(await scene(page)).toEqual(baseline)
  expect(await updates(page)).toBe(beforeUpdates)
  await page.getByRole('button', { name: '放大', exact: true }).click()
  await expect(page.locator('.zoom-value')).toHaveText('120%')
  await pencil(page).click()
  await draw(page, 380)
  await page.screenshot({ path: info.outputPath('pencil-zoomed-preview.png') })
  const previewPoints = await inkPoints(page, true)
  await page.mouse.up()
  const stroke = (await scene(page)).find(node => node.name === 'path')
  expect(stroke.path[stroke.path.length - 2] - stroke.path[1]).toBeCloseTo(200 / 1.2)
  expect(stroke.path[stroke.path.length - 1]).toBeCloseTo(stroke.path[2])
  expectSameInk(await inkPoints(page), previewPoints)
  await page.screenshot({ path: info.outputPath('pencil-zoomed-committed.png') })
  await page.getByRole('button', { name: '选择 (V / 1)', exact: true }).click()
  const host = await page.locator('.canvas-host').boundingBox()
  await page.mouse.click(host.x + 460, host.y + 415)
  await expect(page.locator('.selection-actions')).toBeVisible()
  expect(await page.evaluate(() => window.demo.handle.getSelection()[0]?.id)).toBe(stroke.id)
})

test('a stroke drawn inside an existing frame is saved and undone as one change', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    window.demo.handle.addElement({ tag: 'Frame', id: 'pencil-frame', name: 'frame', editable: true, x: 300, y: 180, width: 340, height: 300, stroke: '#646a73', fill: '#fff' })
    window.demo.handle.flush()
  })
  const baseline = await scene(page), beforeUpdates = await updates(page)
  await pencil(page).click()
  await draw(page, 280)
  expect(await scene(page)).toEqual(baseline)
  const previewPoints = await inkPoints(page, true)
  await page.mouse.up()
  await expect.poll(() => updates(page)).toBe(beforeUpdates + 1)
  const frame = (await scene(page)).find(node => node.id === 'pencil-frame')
  expect(frame.children.filter(node => node.name === 'path')).toHaveLength(1)
  expectSameInk(await inkPoints(page), previewPoints)
  await page.getByRole('button', { name: '撤销 (⌘Z)', exact: true }).click()
  expect(await scene(page)).toEqual(baseline)
})

for (const type of ['horizontal', 'vertical']) test(`pencil ink in a ${type} layout keeps every preview point after release, layout and reopen`, async ({ page }, info) => {
  await open(page)
  await page.evaluate(async type => {
    const { makeContainer } = await import('/src/editor/runtime/thinking/containers.ts')
    const { translate } = await import('/src/i18n/translate.ts')
    const frame = makeContainer(type, { x: 280, y: 150, width: 600, height: 500 }, (key, params) => translate('zh', key, params))
    frame.add({ tag: 'Rect', id: 'layout-content', name: 'rect', x: 28, y: 56, width: 120, height: 90, fill: '#dce8ff', editable: true })
    window.demo.handle.addElement(frame.toJSON()); frame.destroy(); window.demo.handle.flush()
    const { Leafer } = await import('/node_modules/.vite/deps/leafer-ui.js')
    Leafer.list.list.find(item => item.isApp).tree.set({ x: -100, y: -60, scaleX: 1.2, scaleY: 1.2 })
  }, type)
  const baseline = await scene(page)
  await pencil(page).click()
  await draw(page, 330)
  const previewPoints = await inkPoints(page, true)
  await page.screenshot({ path: info.outputPath(`${type}-preview.png`) })
  await page.mouse.up()
  expectSameInk(await inkPoints(page), previewPoints)
  await page.evaluate(() => window.demo.handle.flush())
  expectSameInk(await inkPoints(page), previewPoints)
  const savedFrame = (await scene(page)).find(node => node.name === 'frame')
  expect(savedFrame.children.find(node => node.id === 'layout-content')).toEqual(baseline[0].children.find(node => node.id === 'layout-content'))
  expect(savedFrame.children.some(node => node.name === 'path')).toBe(true)
  await page.screenshot({ path: info.outputPath(`${type}-committed.png`) })
  await page.getByRole('button', { name: '撤销 (⌘Z)', exact: true }).click()
  expect(await scene(page)).toEqual(baseline)
  await page.getByRole('button', { name: '重做 (⇧⌘Z)', exact: true }).click()
  expectSameInk(await inkPoints(page), previewPoints)
  await page.evaluate(() => { window.demo.handle.select(['layout-content']); window.demo.handle.updateSelection({ width: 180, height: 110 }); window.demo.handle.flush() })
  expectSameInk(await inkPoints(page), previewPoints)
  await page.evaluate(id => { window.demo.handle.select([id]); window.demo.handle.updateSelection({ x: 320, y: 175 }); window.demo.handle.flush() }, savedFrame.id)
  expectSameInk(await inkPoints(page), previewPoints.map(point => ({ x: point.x + 40 * 1.2, y: point.y + 25 * 1.2 })))
  const saved = await scene(page)
  await reopen(page)
  expect(await scene(page)).toEqual(saved)
})

test('a standalone pencil stroke survives autosave and a page reload', async ({ page }) => {
  await page.goto('/')
  await page.locator('.canvas-view canvas').first().waitFor()
  await pencil(page).click()
  await page.getByRole('button', { name: '线宽 8 px', exact: true }).click()
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('aidcanvas.document') || '{"scene":{"children":[]}}').scene.children)
  await draw(page, 270)
  await page.mouse.up()
  await expect.poll(async () => (await saved()).length).toBe(1)
  const before = await saved()
  expect(before[0]).toMatchObject({ name: 'path', strokeWidth: 8 })
  await page.reload()
  await page.locator('.canvas-view canvas').first().waitFor()
  expect(await saved()).toEqual(before)
  await page.getByRole('button', { name: '选择 (V / 1)', exact: true }).click()
  const host = await page.locator('.canvas-host').boundingBox()
  await page.mouse.click(host.x + 460, host.y + 305)
  await expect(page.locator('.selection-actions')).toBeVisible()
})

test('standalone undo/redo stays atomic after navigation and selection events', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('aidcanvas.document', JSON.stringify({ version: 1, scene: { tag: 'Leafer', children: [
    { id: 'source', tag: 'Rect', name: 'rect', x: 320, y: 180, width: 120, height: 80, fill: '#fff', editable: true },
    { id: 'target', tag: 'Rect', name: 'rect', x: 560, y: 260, width: 140, height: 90, fill: '#fff', editable: true },
    { id: 'route', tag: 'Path', name: 'connector', stroke: '#646a73', editable: true, data: { kind: 'connector', mode: 'elbow', from: { x: 440, y: 220 }, to: { x: 560, y: 305 }, sourceId: 'source', targetId: 'target', sourceAnchor: { x: 1, y: .5 }, targetAnchor: { x: 0, y: .5 } } },
  ] } })))
  await page.goto('/')
  await page.locator('.canvas-view canvas').first().waitFor()
  const paths = () => page.evaluate(async () => {
    const { Leafer } = await import('/node_modules/.vite/deps/leafer-ui.js')
    return Leafer.list.list.find(item => item.isApp).tree.children.filter(item => item.name === 'path').length
  })
  await pencil(page).click()
  await draw(page, 270)
  await page.mouse.up()
  await expect.poll(paths).toBe(1)
  await page.getByRole('button', { name: '撤销 (⌘Z)', exact: true }).click()
  await expect.poll(paths).toBe(0)
  await page.getByRole('button', { name: '放大', exact: true }).click()
  // Navigation emits native property events; allow the content debounce to run.
  await page.waitForTimeout(250)
  await expect(page.getByRole('button', { name: '重做 (⇧⌘Z)', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: '撤销 (⌘Z)', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '重做 (⇧⌘Z)', exact: true }).click()
  await page.getByRole('button', { name: '选择 (V / 1)', exact: true }).click()
  await page.waitForTimeout(250)
  await expect.poll(paths).toBe(1)
  await page.getByRole('button', { name: '撤销 (⌘Z)', exact: true }).click()
  await expect.poll(paths).toBe(0)
  await expect(page.getByRole('button', { name: '撤销 (⌘Z)', exact: true })).toBeDisabled()
})
