import { test, expect } from './fixtures.mjs'
test.setTimeout(30000)
async function open(page) {
  await page.context().route('**/examples/doca/main.jsx', async route => { const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()).replaceAll('/dist/index.js', '/src/index.ts').replaceAll('/dist/model.js', '/src/model/index.ts').replaceAll('/dist/io.js', '/src/io/index.ts').replaceAll('/dist/index.css', '/src/index.css') }) })
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.model.remove(window.demo.model.getValue().scene.children.map(node => node.id)))
}
const hostPoint = async (page, x, y) => { const b = await page.locator('.canvas-host').boundingBox(); return { x: b.x + x, y: b.y + y } }
const scene = page => page.evaluate(() => window.demo.model.getValue().scene.children)
async function drag(page, locator, dx, dy) { const b = await locator.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 12 }); await page.mouse.up() }
async function seedTable(page) { return page.evaluate(async () => { const { makeTable } = await import('/src/editor/runtime/thinking/scene.ts'); const item = makeTable(360, 280); const id = window.demo.handle.addElement(item.toJSON()).id; item.destroy(); window.demo.handle.flush(); return id }) }

test('empty cell remains a usable miniature Slate through real typing and toolbar focus', async ({ page }, info) => {
  await open(page); const id = await seedTable(page)
  await page.locator('.canvas-host').click({ position: { x: 390, y: 302 } })
  const input = page.locator('[data-slate-editor]'); await expect(input).toBeFocused()
  await expect(input).toHaveCSS('outline-style', 'none'); await expect(page.locator('.table-cell-selection')).toHaveCount(0)
  await page.keyboard.type('hello world'); await expect(input).toHaveText('hello world')
  await page.keyboard.press('Enter'); await page.keyboard.type('second line')
  await page.keyboard.press('Meta+Shift+ArrowLeft'); await expect(page.locator('.slate-format-toolbar')).toBeVisible()
  await page.getByRole('button', { name: '选中文字加粗', exact: true }).click(); await page.keyboard.press('ArrowRight')
  await page.keyboard.type(' bold'); await expect(input).toHaveText('hello worldsecond line bold')
  await input.click({ position: { x: 20, y: 10 } }); await page.keyboard.press('End'); await page.keyboard.type('!')
  await expect(input).toBeFocused()
  await page.screenshot({ path: info.outputPath('mini-slate.png') })
  await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  const table = (await scene(page)).find(node => node.id === id)
  expect(table.children[0].children[0].text).toContain('hello world')
  expect(table.children[0].children[0].data.richText.value).toHaveLength(2)
})

test('template connectors can be selected across the full visible route', async ({ page }) => {
  await open(page)
  await page.evaluate(async () => { const { createTemplate } = await import('/src/editor/runtime/thinking/templates.ts'); const item = createTemplate('architecture', 520, 350, key => key); window.demo.handle.addElement(item.toJSON()); item.destroy(); window.demo.handle.flush() })
  const group = (await scene(page))[0], edge = group.children.find(node => node.data?.kind === 'template-edge' && node.data.to.y < node.data.from.y)
  const saved = await scene(page), updates = await page.evaluate(() => window.demo.allUpdates.length)
  const a = edge.data.from, b = edge.data.to
  for (const p of [{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, { x: (a.x * 3 + b.x) / 4, y: a.y }]) {
    const client = await hostPoint(page, group.x + p.x, group.y + p.y + 4)
    await page.mouse.click(client.x, client.y)
    await expect.poll(() => page.evaluate(() => window.demo.handle.getSelection().map(node => node.id))).toContain(edge.id)
    await expect(page.getByRole('button', { name: '拖动终点', exact: true })).toBeVisible()
  }
  expect(await scene(page)).toEqual(saved); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
})

test('choosing a shape carries its preview until the canvas placement click', async ({ page }, info) => {
  await open(page)
  await page.getByRole('button', { name: '图形 (M)', exact: true }).click()
  await page.screenshot({ path: info.outputPath('placement-start.png') })
  const p = await hostPoint(page, 600, 360); await page.mouse.move(p.x, p.y)
  await expect(page.locator('.tool-placement-preview')).toBeVisible()
  expect(await scene(page)).toHaveLength(0)
  await page.screenshot({ path: info.outputPath('placement-middle.png') })
  await page.mouse.click(p.x, p.y)
  await expect.poll(async () => (await scene(page)).length).toBe(1)
  await expect(page.locator('.tool-placement-preview')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('placement-end.png') })
})

test('repeated segment edits converge, preserve endpoints, reset and undo', async ({ page }, info) => {
  await open(page)
  const id = await page.evaluate(async () => { const { makeDiagram, makeConnector } = await import('/src/editor/runtime/thinking/scene.ts'); const a = makeDiagram('rounded', 280, 250), b = makeDiagram('rounded', 800, 450); for (const item of [a, b]) window.demo.handle.addElement(item.toJSON()); const edge = makeConnector({ x: 440, y: 290 }, { x: 800, y: 490 }, 'elbow', a.id, b.id); edge.data = { ...edge.data, sourceAnchor: { x: 1, y: .5 }, targetAnchor: { x: 0, y: .5 } }; const id = window.demo.handle.addElement(edge.toJSON()).id; for (const item of [a, b, edge]) item.destroy(); window.demo.handle.flush(); window.demo.handle.select([id]); return id })
  const before = (await scene(page)).find(node => node.id === id)
  await expect(page.locator('.graph-vertex')).toHaveCount(2)
  for (let index = 0; index < 12; index++) {
    const previous = (await scene(page)).find(node => node.id === id).path
    await drag(page, page.getByRole('button', { name: '调整连线路径', exact: true }), index % 2 ? -22 : 22, 0)
    const edge = (await scene(page)).find(node => node.id === id)
    expect(edge.path).not.toBe(previous)
    expect(edge.data.vertices.length).toBeLessThanOrEqual(2); expect(edge.data.from).toEqual(before.data.from); expect(edge.data.to).toEqual(before.data.to)
  }
  const line = await page.getByRole('button', { name: '调整连线路径', exact: true }).boundingBox(), snapshot = await scene(page)
  await page.mouse.move(line.x + 10, line.y + 10); await page.mouse.down(); await page.mouse.move(line.x + 70, line.y + 10); await page.evaluate(() => window.demo.handle.flush()); expect(await scene(page)).toEqual(snapshot); await page.keyboard.press('Escape'); await page.mouse.up(); expect(await scene(page)).toEqual(snapshot)
  await page.screenshot({ path: info.outputPath('converged-route.png') })
  await page.getByRole('button', { name: '重置连线路径', exact: true }).click()
  expect((await scene(page)).find(node => node.id === id).data.vertices).toBeUndefined()
  await page.evaluate(() => window.demo.handle.undo()); expect((await scene(page)).find(node => node.id === id).data.vertices).toBeTruthy()
})

test('entering text editing dismisses the quick-create card and does not add a stray line', async ({ page }) => {
  await open(page)
  const id = await page.evaluate(async () => { const { makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts'); const node = makeDiagram('rounded', 300, 300, '内容'); const id = window.demo.handle.addElement(node.toJSON()).id; node.destroy(); window.demo.handle.flush(); window.demo.handle.select([id]); return id })
  const port = await page.getByRole('button', { name: '从右侧创建连线', exact: true }).boundingBox(), end = await hostPoint(page, 700, 450)
  await page.mouse.move(port.x + 11, port.y + 11); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 14 }); await page.mouse.up()
  await expect(page.locator('.graph-create-picker')).toBeVisible()
  await page.locator('.canvas-host').dblclick({ position: { x: 380, y: 340 } })
  await expect(page.locator('.canvas-plain-text-editor')).toBeVisible(); await expect(page.locator('[data-slate-editor]')).toHaveCount(0); await expect(page.locator('.graph-create-picker')).toHaveCount(0)
  await page.keyboard.type('hello world'); await page.keyboard.press('Escape')
  await expect(page.locator('.graph-create-picker')).toHaveCount(0)
  expect((await scene(page)).filter(node => node.data?.kind === 'connector')).toHaveLength(1)
  expect((await scene(page)).find(node => node.id === id).children[1].text).toContain('hello world')
})

test('cell clicks show a caret, text drags select text, and crossing cells selects only the range', async ({ page }, info) => {
  await open(page); await seedTable(page)
  await page.locator('.canvas-host').click({ position: { x: 390, y: 302 } }); const input = page.locator('[data-slate-editor]')
  await page.keyboard.type('alpha beta'); await page.keyboard.press('Enter'); await page.keyboard.type('second line')
  await expect(input).toHaveCSS('outline-style', 'none'); await expect(page.locator('.table-cell-selection')).toHaveCount(0)
  // The first paragraph is now scrolled out of the bounded cell; drag the visible line.
  const b = await input.locator('[data-slate-string]').last().boundingBox()
  await page.mouse.move(b.x + 1, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + 38, b.y + b.height / 2, { steps: 10 }); await page.mouse.up()
  await expect.poll(() => page.evaluate(() => window.getSelection().toString().length)).toBeGreaterThan(1)
  await expect(page.locator('.table-cell-selection')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('cell-text-selection.png') })
  await page.mouse.move(b.x + 1, b.y + b.height / 2); await page.mouse.down(); const end = await hostPoint(page, 610, 370); await page.mouse.move(end.x, end.y, { steps: 14 }); await page.mouse.up()
  await expect(input).toHaveCount(0); await expect(page.locator('.table-cell-selection')).toHaveCount(1); await expect(page.locator('.table-range-indicator')).toHaveText('2 × 2')
  await page.locator('.canvas-host').click({ position: { x: 700, y: 400 } }); await expect(input).toBeFocused(); await expect(page.locator('.table-cell-selection')).toHaveCount(0)
})

test('notes, tables and sections carry a ghost, cancel without writes, then place on click', async ({ page }, info) => {
  await open(page)
  for (const name of ['便笺 (N)', '表格', '分区 (F)']) {
    const previous = await scene(page), count = previous.length, updates = await page.evaluate(() => window.demo.allUpdates.length)
    await page.getByRole('button', { name, exact: true }).click(); const p = await hostPoint(page, 640, 420); await page.mouse.move(p.x, p.y)
    await expect(page.locator('.tool-placement-preview')).toBeVisible(); expect((await scene(page)).length).toBe(count)
    await page.keyboard.press('Escape'); await expect(page.locator('.tool-placement-preview')).toHaveCount(0); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
    await page.getByRole('button', { name, exact: true }).click(); await page.mouse.move(p.x + 20, p.y + 20)
    if (name === '表格') await page.screenshot({ path: info.outputPath('table-placement-ghost.png') })
    await page.mouse.click(p.x + 20, p.y + 20)
    if (name === '分区 (F)') {
      // A new container adopts the existing note and table underneath it.
      const ids = previous.map(node => node.id).sort()
      await expect.poll(async () => (await scene(page)).find(node => node.name === 'frame')?.children.filter(node => ids.includes(node.id)).map(node => node.id).sort()).toEqual(ids)
    } else await expect.poll(async () => (await scene(page)).length).toBe(count + 1)
    await page.keyboard.press('Escape')
  }
})

test('dragged mind branches retain left and up directions when adding multiline children and reopening', async ({ page }, info) => {
  await open(page)
  const ids = await page.evaluate(async () => { const { makeMindMap } = await import('/src/editor/runtime/thinking/scene.ts'); const group = makeMindMap(650, 420, '中心', '分支'); const branch = group.children.find(node => node.data?.parentId); window.demo.handle.addElement(group.toJSON()); const ids = { group: group.id, branch: branch.id }; group.destroy(); window.demo.handle.flush(); return ids })
  let map = (await scene(page)).find(node => node.id === ids.group), branch = map.children.find(node => node.id === ids.branch)
  const from = await hostPoint(page, map.x + branch.x + branch.width / 2, map.y + branch.y + branch.height / 2), to = await hostPoint(page, 390, 450)
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 20 }); await page.mouse.up(); await page.evaluate(() => window.demo.handle.flush())
  map = (await scene(page)).find(node => node.id === ids.group); branch = map.children.find(node => node.id === ids.branch); expect(branch.data.mindDirection).toBe('left'); const position = { x: branch.x, y: branch.y }
  await page.evaluate(id => window.demo.handle.select([id]), ids.branch); await page.locator('.canvas-app').focus(); await page.keyboard.press('Tab'); await page.keyboard.type('left child'); await page.keyboard.press('Enter'); await page.keyboard.type('line two'); await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  map = (await scene(page)).find(node => node.id === ids.group); branch = map.children.find(node => node.id === ids.branch)
  expect({ x: branch.x, y: branch.y }).toEqual(position)
  const child = map.children.find(node => node.data?.parentId === branch.id); expect(child.x + child.width).toBeLessThan(branch.x); expect(child.children[0].text).toBe('left child\nline two')
  const start = await hostPoint(page, map.x + child.x + child.width / 2, map.y + child.y + child.height / 2), target = await hostPoint(page, map.x + branch.x + branch.width / 2, 260)
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(target.x, target.y, { steps: 20 }); await page.mouse.up(); await page.evaluate(() => window.demo.handle.flush())
  await page.evaluate(id => window.demo.handle.select([id]), child.id); await page.locator('.canvas-app').focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  map = (await scene(page)).find(node => node.id === ids.group); const moved = map.children.find(node => node.id === child.id), grandchild = map.children.find(node => node.data?.parentId === child.id)
  expect(moved.data.mindDirection).toBe('up'); expect(grandchild.y + grandchild.height).toBeLessThan(moved.y)
  await page.screenshot({ path: info.outputPath('mind-branch-directions.png') })
  const saved = await scene(page); await page.evaluate(() => { const reopen = window.demo.openDocument, value = window.demo.closeDocument(); reopen(value) }); await page.waitForFunction(() => window.demo?.handle); expect(await scene(page)).toEqual(saved)
})

test('route picking keeps a screen-space hit area at different zoom levels and respects readonly', async ({ page }) => {
  await open(page)
  const id = await page.evaluate(async () => { const { makeConnector } = await import('/src/editor/runtime/thinking/scene.ts'); const edge = makeConnector({ x: 330, y: 300 }, { x: 850, y: 500 }); const id = window.demo.handle.addElement(edge.toJSON()).id; edge.destroy(); window.demo.handle.flush(); return id })
  const updates = await page.evaluate(() => window.demo.allUpdates.length), before = await scene(page)
  for (const [button, count] of [['缩小', 0], ['缩小', 3], ['放大', 6]]) {
    for (let index = 0; index < count; index++) await page.getByRole('button', { name: button, exact: true }).click()
    await page.evaluate(id => window.demo.handle.select([id]), id); await expect(page.locator('.graph-segment').first()).toBeVisible()
    const b = await page.locator('.graph-segment').first().boundingBox(); await page.evaluate(() => window.demo.handle.select([])); await expect(page.locator('.graph-segment')).toHaveCount(0)
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2 + 6)
    await expect.poll(() => page.evaluate(() => window.demo.handle.getSelection().map(node => node.id))).toEqual([id])
  }
  expect(await scene(page)).toEqual(before); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
  await page.evaluate(() => window.demo.setMode('readonly')); await expect(page.locator('.graph-handle')).toHaveCount(0)
})
