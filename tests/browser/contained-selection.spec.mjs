import { test, expect } from './fixtures.mjs'

async function open(page) {
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.model.remove(window.demo.model.getValue().scene.children.map(item => item.id)))
}
const scene = page => page.evaluate(() => window.demo.model.getValue().scene.children)
const selected = page => page.evaluate(() => window.demo.handle.getSelection().map(item => item.id))
async function seed(page) {
  return page.evaluate(async () => {
    const { makeDiagram, makeConnector, connectorLabel } = await import('/src/editor/runtime/thinking/scene.ts')
    const { Leafer } = await import('/node_modules/.vite/deps/leafer-ui.js')
    const source = makeDiagram('rounded', 300, 240, 'source', 160, 90)
    const target = makeDiagram('rounded', 720, 240, 'target', 160, 90)
    const line = makeConnector({ x: 460, y: 285 }, { x: 720, y: 285 }, 'straight', source.id, target.id)
    line.data = { ...line.data, sourceAnchor: { x: 1, y: .5 }, targetAnchor: { x: 0, y: .5 } }
    for (const item of [source, target, line]) { window.demo.handle.addElement(item.toJSON()); item.destroy() }
    const app = Leafer.list.list.find(item => item.isApp)
    const nativeLine = app.tree.children.find(item => item.id === line.id)
    const label = connectorLabel(app, nativeLine); label.text = 'keep label'
    window.demo.handle.flush(); window.demo.handle.select([])
    return { source: source.id, target: target.id, line: line.id, label: label.parent.id }
  })
}
async function marquee(page, from, to) {
  const host = await page.locator('.canvas-host').boundingBox()
  await page.mouse.move(host.x + from[0], host.y + from[1]); await page.mouse.down()
  await page.mouse.move(host.x + to[0], host.y + to[1], { steps: 12 }); await page.mouse.up()
}

test('marquee requires full containment and never adds a partly enclosed connected line', async ({ page }, info) => {
  await open(page); const ids = await seed(page)
  await marquee(page, [280, 210], [400, 350])
  expect(await selected(page)).toEqual([])
  await marquee(page, [280, 210], [480, 350])
  expect(await selected(page)).toEqual([ids.source])
  await page.screenshot({ path: info.outputPath('only-fully-contained-node.png') })
  await page.locator('.canvas-host').click({ position: { x: 1100, y: 600 } })
  await marquee(page, [480, 350], [280, 210])
  expect(await selected(page)).toEqual([ids.source])
  await page.locator('.canvas-host').click({ position: { x: 1100, y: 600 } })
  await page.evaluate(async () => {
    const { Leafer } = await import('/node_modules/.vite/deps/leafer-ui.js')
    Leafer.list.list.find(item => item.isApp).tree.set({ x: -100, y: -60, scaleX: 1.25, scaleY: 1.25 })
  })
  await marquee(page, [250, 202.5], [500, 377.5])
  expect(await selected(page)).toEqual([ids.source])
})

test('architecture template selects three services, then adds only fully enclosed outgoing routes', async ({ page }, info) => {
  await open(page)
  const ids = await page.evaluate(async () => {
    const { createTemplate } = await import('/src/editor/runtime/thinking/templates.ts')
    const { translate } = await import('/src/i18n/translate.ts')
    const template = createTemplate('architecture', 500, 320, key => translate('zh', key))
    const services = template.children.filter(item => item.data?.kind === 'diagram-node' && item.x === 180).map(item => item.id)
    const outgoing = template.children.filter(item => services.includes(item.data?.sourceId)).map(item => item.id)
    const edges = template.children.filter(item => item.data?.kind === 'template-edge').map(item => item.id)
    const result = { template: template.id, services, outgoing, edges }
    window.demo.handle.addElement(template.toJSON()); template.destroy(); window.demo.handle.select([]); window.demo.handle.flush(); return result
  })
  const before = await scene(page)
  await marquee(page, [660, 180], [920, 500])
  expect(new Set(await selected(page))).toEqual(new Set(ids.services))
  await page.screenshot({ path: info.outputPath('three-services-only.png') })
  await page.locator('.canvas-host').click({ position: { x: 1150, y: 600 } })
  await marquee(page, [660, 180], [950, 500])
  expect(new Set(await selected(page))).toEqual(new Set([...ids.services, ...ids.outgoing]))
  await page.screenshot({ path: info.outputPath('three-services-and-outgoing-routes.png') })
  await page.locator('.canvas-host').click({ position: { x: 1150, y: 600 } })
  await marquee(page, [660, 180], [920, 500])
  await page.keyboard.press('Delete'); await page.evaluate(() => window.demo.handle.flush())
  const after = (await scene(page)).find(item => item.id === ids.template)
  expect(after.children.filter(item => ids.services.includes(item.id))).toEqual([])
  expect(after.children.filter(item => ids.edges.includes(item.id)).map(item => item.id)).toEqual(before.find(item => item.id === ids.template).children.filter(item => ids.edges.includes(item.id)).map(item => item.id))
  await page.evaluate(() => window.demo.handle.undo()); expect(await scene(page)).toEqual(before)
  await marquee(page, [660, 180], [920, 500])
  expect(new Set(await selected(page))).toEqual(new Set(ids.services))
})

test('standalone template can be selected again after repeated marquee/delete/undo cycles', async ({ page }, info) => {
  await page.goto('/')
  await page.locator('.canvas-view canvas').first().waitFor()
  const ids = await page.evaluate(async () => {
    const { Leafer } = await import('/node_modules/.vite/deps/leafer-ui.js')
    const { createTemplate } = await import('/src/editor/runtime/thinking/templates.ts')
    const { translate } = await import('/src/i18n/translate.ts')
    const app = Leafer.list.list.find(item => item.isApp)
    const template = createTemplate('architecture', 500, 320, key => translate('zh', key))
    const services = template.children.filter(item => item.data?.kind === 'diagram-node' && item.x === 180).map(item => item.id)
    app.tree.add(template); return { template: template.id, services }
  })
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('aidcanvas.document') || '{}').scene?.children.length)).toBe(1)
  await page.reload(); await page.locator('.canvas-view canvas').first().waitFor()
  const native = () => page.evaluate(async () => {
    const { Leafer } = await import('/node_modules/.vite/deps/leafer-ui.js')
    const app = Leafer.list.list.find(item => item.isApp)
    return {
      selected: app.editor.list.map(item => item.id), scene: app.tree.toJSON().children,
      helper: { destroyed: Boolean(app.editor.simulateTarget.destroyed), transient: app.editor.simulateTarget.skipJSON, id: app.editor.simulateTarget.id },
    }
  })
  for (let cycle = 0; cycle < 3; cycle++) {
    // Keep the next blank click separate from the previous node click:
    // Leafer otherwise interprets these rapid test clicks as a double-click.
    await page.waitForTimeout(400)
    await page.locator('.canvas-host').click({ position: { x: 1150, y: 600 } })
    await marquee(page, [660, 180], [920, 500])
    expect(new Set((await native()).selected), `cycle ${cycle}`).toEqual(new Set(ids.services))
    if (cycle % 2) await page.getByRole('button', { name: '删除', exact: true }).click()
    else await page.keyboard.press('Delete')
    await expect.poll(async () => (await native()).scene[0].children.some(item => ids.services.includes(item.id))).toBe(false)
    await page.getByRole('button', { name: '撤销 (⌘Z)', exact: true }).click()
    await expect.poll(async () => (await native()).scene[0].children.filter(item => ids.services.includes(item.id)).length).toBe(3)
    await page.locator('.canvas-host').click({ position: { x: 750, y: 250 } })
    expect((await native()).selected).toEqual([ids.services[0]])
    expect((await native()).helper).toEqual({ destroyed: false, transient: true, id: '' })
    if (cycle === 2) {
      await page.getByRole('button', { name: '重做 (⇧⌘Z)', exact: true }).click()
      await expect.poll(async () => (await native()).scene[0].children.some(item => ids.services.includes(item.id))).toBe(false)
      await page.getByRole('button', { name: '撤销 (⌘Z)', exact: true }).click()
      await marquee(page, [660, 180], [920, 500])
      expect(new Set((await native()).selected)).toEqual(new Set(ids.services))
      await page.screenshot({ path: info.outputPath('reselect-after-undo-redo.png') })
    }
  }
})

for (const action of ['Delete', 'Backspace', 'toolbar']) test(`deleting a selected node via ${action} preserves unselected connectors and labels, with undo and peer convergence`, async ({ page, context }) => {
  await open(page); const ids = await seed(page), before = await scene(page)
  const peer = await context.newPage(); await peer.goto(await page.evaluate(() => window.demo.link)); await peer.waitForFunction(() => window.demo?.handle)
  await page.evaluate(id => window.demo.handle.select([id]), ids.source)
  if (action === 'toolbar') await page.locator('.selection-actions').getByRole('button', { name: '删除', exact: true }).click()
  else { await page.locator('.canvas-app').focus(); await page.keyboard.press(action) }
  await page.evaluate(() => window.demo.handle.flush())
  const after = await scene(page), line = after.find(item => item.id === ids.line)
  expect(after.some(item => item.id === ids.source)).toBe(false)
  expect(after.find(item => item.id === ids.target)).toEqual(before.find(item => item.id === ids.target))
  expect(line).toBeTruthy(); expect(line.data.sourceId).toBeFalsy()
  expect(line.path).toEqual(before.find(item => item.id === ids.line).path)
  expect(after.find(item => item.id === ids.label)).toEqual(before.find(item => item.id === ids.label))
  await expect.poll(() => scene(peer)).toEqual(after)
  await page.evaluate(() => window.demo.handle.undo())
  await expect.poll(() => scene(page)).toEqual(before)
  await expect.poll(() => scene(peer)).toEqual(before)
  await peer.close()
})

test('partly enclosed groups select only fully enclosed members; whole groups and Shift selection still work', async ({ page }) => {
  await open(page); const ids = await seed(page)
  const groupId = await page.evaluate(ids => {
    window.demo.handle.select(Object.values(ids)); window.demo.handle.groupSelection(); window.demo.handle.flush()
    const id = window.demo.handle.getSelection()[0].id; window.demo.handle.select([]); return id
  }, ids)
  const before = await scene(page)
  await marquee(page, [280, 210], [480, 350])
  expect(await selected(page)).toEqual([ids.source])
  await page.locator('.canvas-host').click({ position: { x: 1100, y: 600 } })
  await marquee(page, [280, 210], [900, 350])
  expect(await selected(page)).toEqual([groupId])
  await page.evaluate(id => window.demo.handle.select([id]), ids.target)
  await page.keyboard.down('Shift'); await marquee(page, [280, 210], [480, 350]); await page.keyboard.up('Shift')
  expect(new Set(await selected(page))).toEqual(new Set([ids.source, ids.target]))
  await page.evaluate(() => window.demo.handle.flush()); expect(await scene(page)).toEqual(before)
})

test('only explicitly selected lines and labels are removed', async ({ page }) => {
  await open(page); const ids = await seed(page), before = await scene(page)
  await page.evaluate(id => { window.demo.handle.select([id]); window.demo.handle.removeSelection(); window.demo.handle.flush() }, ids.line)
  let after = await scene(page)
  expect(after.some(item => item.id === ids.line)).toBe(false)
  expect(after.find(item => item.id === ids.label).children).toEqual(before.find(item => item.id === ids.label).children)
  expect(after.find(item => item.id === ids.label).data.ownerId).toBeFalsy()
  await page.evaluate(() => window.demo.handle.undo()); expect(await scene(page)).toEqual(before)
  await page.evaluate(id => { window.demo.handle.select([id]); window.demo.handle.removeSelection(); window.demo.handle.flush() }, ids.label)
  after = await scene(page)
  expect(after.some(item => item.id === ids.label)).toBe(false)
  expect(after.find(item => item.id === ids.line)).toBeTruthy()
  expect(after.find(item => item.id === ids.line).data.labelId).toBeFalsy()
})

test('deleting a mind parent removes its descendants but preserves siblings and external connectors', async ({ page }) => {
  await open(page)
  const ids = await page.evaluate(async () => {
    const { makeMindMap, addMindNode, mindNodes, makeConnector } = await import('/src/editor/runtime/thinking/scene.ts')
    const map = makeMindMap(450, 300, 'root', 'branch')
    const parent = mindNodes(map).find(item => !item.data.root), child = addMindNode(parent, 'child', 'child'), grandchild = addMindNode(child, 'child', 'grandchild')
    const line = makeConnector({ x: 100, y: 100 }, { x: 900, y: 500 }, 'straight', parent.id)
    const result = { map: map.id, parent: parent.id, child: child.id, grandchild: grandchild.id, line: line.id }
    for (const item of [map, line]) { window.demo.handle.addElement(item.toJSON()); item.destroy() }
    window.demo.handle.flush(); return result
  })
  const before = await scene(page), beforeMap = before.find(item => item.id === ids.map)
  await page.evaluate(id => window.demo.handle.select([id]), ids.parent)
  await page.locator('.canvas-app').focus(); await page.keyboard.press('Delete'); await page.evaluate(() => window.demo.handle.flush())
  const after = await scene(page), map = after.find(item => item.id === ids.map)
  for (const id of [ids.parent, ids.child, ids.grandchild]) expect(map.children.some(item => item.id === id)).toBe(false)
  for (const node of beforeMap.children.filter(item => item.data?.kind === 'mind-node' && ![ids.parent, ids.child, ids.grandchild].includes(item.id))) expect(map.children.some(item => item.id === node.id)).toBe(true)
  expect(after.find(item => item.id === ids.line)).toBeTruthy()
  expect(after.find(item => item.id === ids.line).data.sourceId).toBeFalsy()
  await page.evaluate(() => window.demo.handle.undo()); expect(await scene(page)).toEqual(before)
})

test('new native tables participate in full containment before reload', async ({ page }, info) => {
  await open(page)
  await page.getByRole('button', { name: '表格', exact: true }).click()
  await page.getByRole('button', { name: '3 × 3', exact: true }).click()
  const host = await page.locator('.canvas-host').boundingBox()
  await page.mouse.click(host.x + 650, host.y + 350)
  await expect.poll(async () => (await scene(page)).filter(item => item.data?.kind === 'table').length).toBe(1)
  await page.getByRole('button', { name: '选择 (V / 1)', exact: true }).click()
  await page.waitForTimeout(500)
  const before = await scene(page), table = before.find(item => item.data?.kind === 'table')
  const screen = (x, y) => page.evaluate(async ({ x, y }) => {
    const { Leafer } = await import('/node_modules/.vite/deps/leafer-ui.js')
    const app = Leafer.list.list.find(item => item.isApp)
    const p = app.tree.getClientPointByWorld(app.tree.getWorldPoint({ x, y }))
    return { x: p.x, y: p.y }
  }, { x, y })
  const drag = async (from, to) => {
    const a = await screen(...from), b = await screen(...to)
    await page.mouse.move(a.x, a.y); await page.mouse.down()
    await page.mouse.move(b.x, b.y, { steps: 15 }); await page.mouse.up()
  }
  await page.mouse.click(...Object.values(await screen(table.x - 90, table.y - 70)))
  await drag([table.x - 30, table.y - 30], [table.x + 280, table.y + 170])
  expect(await selected(page)).toEqual([])
  for (const reverse of [false, true]) {
    await page.mouse.click(...Object.values(await screen(table.x - 90, table.y - 70)))
    await page.waitForTimeout(400)
    const a = [table.x - 30, table.y - 30], b = [table.x + 450, table.y + 170]
    await drag(reverse ? b : a, reverse ? a : b)
    expect(await selected(page)).toEqual([table.id])
  }
  await page.evaluate(() => window.demo.handle.flush())
  expect(await scene(page)).toEqual(before)
  await page.screenshot({ path: info.outputPath('new-table-marquee.png') })
})
