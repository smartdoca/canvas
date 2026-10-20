import { test, expect } from './fixtures.mjs'
test.setTimeout(30000)

const scene = page => page.evaluate(() => window.demo.model.getValue().scene)
async function open(page, query = '') {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/examples/doca/' + query); await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.model.remove(window.demo.model.getValue().scene.children.map(n => n.id)))
}
async function seed(page, type = 'diagram') {
  return page.evaluate(async type => {
    const { makeDiagram, makeTable } = await import('/src/editor/runtime/thinking/scene.ts')
    const node = type === 'table' ? makeTable(360, 260, 2, 2, ['projects']) : makeDiagram('rounded', 360, 260, '', 280, 160)
    if (type === 'note') { node.name = 'note'; node.data = { ...node.data, kind: 'note' }; node.children[1].verticalAlign = 'top' }
    const id = window.demo.handle.addElement(node.toJSON()).id; node.destroy(); window.demo.handle.flush(); window.demo.handle.select([id]); return id
  }, type)
}
async function drag(page, from, to) {
  const host = await page.locator('.canvas-host').boundingBox()
  await page.mouse.move(host.x + from.x, host.y + from.y); await page.mouse.down()
  await page.mouse.move(host.x + to.x, host.y + to.y, { steps: 12 }); await page.mouse.up()
}

test('quick diagram stroke styles change the visible body and survive undo, redo and reopen', async ({ page }) => {
  await open(page); const id = await seed(page)
  const bar = page.locator('.selection-actions')
  await bar.getByRole('combobox', { name: '线宽', exact: true }).click()
  await page.getByRole('option', { name: '6', exact: true }).click()
  await expect.poll(async () => (await scene(page)).children[0].children[0].strokeWidth).toBe(6)
  await bar.getByRole('button', { name: '线条样式', exact: true }).click()
  await page.getByRole('button', { name: '虚线', exact: true }).click()
  await expect.poll(async () => (await scene(page)).children[0].children[0].dashPattern).toEqual([8, 5])
  const saved = await scene(page)
  await page.evaluate(() => window.demo.handle.undo()); await page.evaluate(() => window.demo.handle.redo())
  expect(await scene(page)).toEqual(saved)
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  expect((await scene(page)).children.find(n => n.id === id).children[0]).toMatchObject({ strokeWidth: 6, dashPattern: [8, 5] })
})

test('wheel panning continues over connection ports and table controls without content writes', async ({ page }) => {
  await open(page); await seed(page)
  const saved = await scene(page), updates = await page.evaluate(() => window.demo.allUpdates.length)
  const position = () => page.evaluate(() => window.demo.handle.clientToScene({ x: 900, y: 600 }))
  for (const selector of ['.graph-port.is-selected', '.node-quick-create']) {
    const before = await position()
    await page.locator(selector).first().hover(); await page.mouse.wheel(80, 0)
    await expect.poll(async () => (await position()).x).toBeGreaterThan(before.x)
  }
  expect(await scene(page)).toEqual(saved); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
})

test('table move handle stays anchored to its top left outside the viewport', async ({ page }) => {
  await open(page); await seed(page, 'table')
  const handle = page.locator('.rich-object-move-handle')
  const before = await handle.boundingBox()
  await page.evaluate(() => window.demo.handle.updateSelection({ x: -240, y: -160 }))
  await expect.poll(() => handle.evaluate(el => [parseFloat(el.style.left), parseFloat(el.style.top)])).toEqual([-284, -204])
  await page.evaluate(() => window.demo.handle.updateSelection({ x: 360, y: 260 }))
  expect((await handle.boundingBox()).x).toBeCloseTo(before.x, 1)
})

for (const type of ['diagram', 'note', 'table']) test(`drag ${type}, undo and idle preserve redo`, async ({ page }) => {
  await open(page); const id = await seed(page, type), before = await scene(page)
  if (type === 'table') {
    const handle = await page.locator('.rich-object-move-handle').boundingBox()
    await page.mouse.move(handle.x + 12, handle.y + 12); await page.mouse.down(); await page.mouse.move(handle.x + 90, handle.y + 70, { steps: 12 }); await page.mouse.up()
  } else await drag(page, { x: 450, y: 330 }, { x: 550, y: 390 })
  await page.evaluate(() => window.demo.handle.flush())
  const moved = await scene(page); expect(moved).not.toEqual(before)
  await page.getByRole('button', { name: '撤销 (⌘Z)', exact: true }).click()
  await expect.poll(() => scene(page)).toEqual(before)
  await page.mouse.move(900, 550); await page.waitForTimeout(350)
  await expect(page.getByRole('button', { name: '重做 (⇧⌘Z)', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '重做 (⇧⌘Z)', exact: true }).click()
  expect(await scene(page)).toEqual(moved)
  await page.evaluate(id => window.demo.handle.select([id]), id)
})

test('mention insertion allows leaving text mode and deleting the whole note with undo', async ({ page }) => {
  await open(page); const id = await seed(page, 'note')
  const host = await page.locator('.canvas-host').boundingBox()
  await page.mouse.click(host.x + 410, host.y + 290)
  await expect(page.locator('[data-slate-editor]')).toBeFocused()
  await page.keyboard.insertText('@Canvas')
  await expect(page.getByRole('option', { name: 'Canvas QA' })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-rich-inline]')).toHaveText('@Canvas QA')
  await page.evaluate(() => window.demo.handle.removeSelection())
  await expect(page.locator('[data-slate-editor]')).toHaveCount(0)
  await page.evaluate(() => window.demo.handle.flush())
  expect((await scene(page)).children.find(n => n.id === id)).toBeUndefined()
  await page.evaluate(() => window.demo.handle.undo())
  expect((await scene(page)).children.find(n => n.id === id).children[1].data.richText.value[0].children.some(c => c.inline)).toBe(true)
})

for (const type of ['board', 'horizontal']) test(`drag a child in ${type}, undo and redo preserve layout`, async ({ page }) => {
  await open(page)
  const id = await page.evaluate(async type => {
    const { makeContainer } = await import('/src/editor/runtime/thinking/containers.ts')
    const frame = makeContainer(type, { x: 300, y: 200, width: 650, height: 420 }, key => key)
    frame.add({ id: 'first', tag: 'Rect', name: 'rect', x: 28, y: 56, width: 100, height: 70, fill: '#dce8ff', editable: true })
    frame.add({ id: 'second', tag: 'Rect', name: 'rect', x: 152, y: 56, width: 100, height: 70, fill: '#dce8ff', editable: true })
    const id = window.demo.handle.addElement(frame.toJSON()).id; frame.destroy(); window.demo.handle.flush(); return id
  }, type)
  await page.evaluate(() => window.demo.handle.select(['first']))
  const before = await scene(page)
  await drag(page, { x: 370, y: 290 }, { x: 630, y: 320 })
  await page.evaluate(() => window.demo.handle.flush())
  const moved = await scene(page); expect(moved).not.toEqual(before)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => scene(page)).toEqual(before)
  await page.waitForTimeout(350)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(() => scene(page)).toEqual(moved)
  expect((await scene(page)).children.find(n => n.id === id)).toBeTruthy()
})

test('view menu remains usable without the package header and in readonly without content writes', async ({ page }, info) => {
  await open(page, '?no-header'); await seed(page)
  await expect(page.locator('.app-header')).toHaveCount(0)
  const before = await scene(page), updates = await page.evaluate(() => window.demo.allUpdates.length)
  const menu = page.getByRole('button', { name: '主菜单', exact: true })
  await menu.click(); await page.getByRole('menuitemradio', { name: '点阵', exact: true }).click()
  await expect(page.locator('.canvas-stage')).toHaveClass(/has-grid/)
  await menu.click(); await page.getByRole('menuitemradio', { name: '背景色 #edf3ff', exact: true }).click()
  await expect(page.locator('.canvas-host')).toHaveCSS('background-color', 'rgb(237, 243, 255)')
  await menu.click(); await page.getByRole('menuitemcheckbox', { name: '小地图', exact: true }).click()
  await expect(page.locator('.board-minimap')).toBeVisible()
  await page.evaluate(() => window.demo.setMode('readonly'))
  await menu.click(); await page.getByRole('menuitemradio', { name: '网格', exact: true }).click()
  await expect(page.locator('.canvas-host')).toHaveCSS('background-image', /linear-gradient/)
  await menu.click(); await expect(page.getByRole('menu', { name: '主菜单', exact: true })).toHaveCSS('opacity', '1')
  await page.screenshot({ path: info.outputPath('embedded-view-menu.png') })
  expect(await scene(page)).toEqual(before); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
})

for (const action of ['move', 'resize']) test(`undo immediately after ${action} of a scaled custom path preserves redo after the final animation frame`, async ({ page }) => {
  await open(page)
  await page.evaluate(async () => {
    window.demo.handle.addElement({ id: 'custom-path', tag: 'Path', name: 'special-shape', x: 360, y: 260, path: 'M0 0 L200 0 L200 120 L0 120 Z', fill: '#eaf1ff', scaleX: 1.3, scaleY: 1.2, editable: true })
    window.demo.handle.select(['custom-path']); window.demo.handle.flush()
    const { Leafer, PointerEvent } = await import('/node_modules/.vite/deps/leafer-ui.js')
    Leafer.list.list.find(item => item.isApp).once(PointerEvent.UP, () => window.demo.handle.undo())
  })
  const before = await scene(page)
  await drag(page, action === 'move' ? { x: 450, y: 330 } : { x: 620, y: 404 }, action === 'move' ? { x: 550, y: 390 } : { x: 720, y: 464 })
  await page.waitForTimeout(350)
  expect(await scene(page)).toEqual(before)
  await expect(page.getByRole('button', { name: '重做 (⇧⌘Z)', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '重做 (⇧⌘Z)', exact: true }).click()
  expect(await scene(page)).not.toEqual(before)
})

test('mention menu opens during a slow lookup, ignores stale results and reuses a completed query', async ({ page }) => {
  await open(page); await seed(page, 'note')
  await page.evaluate(() => { window.demo.resourceControls.holdMention = true })
  const host = await page.locator('.canvas-host').boundingBox()
  await page.mouse.click(host.x + 410, host.y + 290)
  await page.keyboard.insertText('@')
  await expect(page.getByRole('listbox', { name: 'Mention' })).toBeVisible({ timeout: 500 })
  await expect(page.getByRole('status').filter({ hasText: '正在查找' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.demo.resourceControls.mentionRequests?.length)).toBe(1)
  await page.keyboard.insertText('Canvas')
  await expect.poll(() => page.evaluate(() => window.demo.resourceControls.mentionRequests?.length)).toBe(2)
  await page.evaluate(() => window.demo.resourceControls.mentionRequests[1].complete())
  await expect(page.getByRole('option', { name: 'Canvas QA' })).toBeVisible()
  await page.evaluate(() => window.demo.resourceControls.mentionRequests[0].complete())
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-rich-inline]')).toHaveText('@Canvas QA')
  await page.keyboard.insertText('@Canvas')
  await expect(page.getByRole('option', { name: 'Canvas QA' })).toBeVisible()
  expect(await page.evaluate(() => window.demo.resourceControls.mentionRequests.length)).toBe(2)
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
  await page.evaluate(() => window.demo.handle.removeSelection())
  await page.evaluate(() => window.demo.handle.flush())
  expect((await scene(page)).children).toHaveLength(0)
})
