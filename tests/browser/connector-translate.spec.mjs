import { test, expect } from './fixtures.mjs'

test.setTimeout(30000)
const scene = page => page.evaluate(() => window.demo.model.getValue().scene)
const nodes = value => value.children.flatMap(function flatten(node) { return [node, ...(node.children || []).flatMap(flatten)] })
async function open(page) {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.model.remove(window.demo.model.getValue().scene.children.map(node => node.id)))
}
async function seed(page, route, nested = false) {
  return page.evaluate(async ({ route, nested }) => {
    const { makeConnector } = await import('/src/editor/runtime/thinking/scene.ts')
    const line = makeConnector({ x: 300, y: 240 }, { x: 700, y: 420 }, route.mode)
    line.data = { ...line.data, ...route }
    const value = line.toJSON(), id = line.id; line.destroy()
    window.demo.handle.addElement(nested ? { id: 'translation-group', tag: 'Group', x: 80, y: 60, scaleX: 1.25, scaleY: 1.25, editable: true, children: [value] } : value)
    window.demo.handle.flush(); window.demo.handle.select([]); return id
  }, { route, nested })
}
// Pick the line body away from the endpoint, bend and segment handles.
async function bodyPoint(page, id) {
  return page.evaluate(async id => {
    const { allItems, connectorGeometry, connectorPagePoint } = await import('/src/editor/runtime/thinking/scene.ts')
    const { Leafer } = await import('/node_modules/.vite/deps/leafer-ui.js')
    const app = Leafer.list.list.find(item => item.isApp), line = allItems(app).find(item => item.id === id)
    const geometry = connectorGeometry(line.data.from, line.data.to, line.data), points = geometry.hitPoints
    const index = line.data.mode === 'curve' ? 8 : points.slice(1).reduce((best, point, at) => Math.hypot(point.x - points[at].x, point.y - points[at].y) > best.length ? { index: at, length: Math.hypot(point.x - points[at].x, point.y - points[at].y) } : best, { index: 0, length: 0 }).index
    const a = points[index], b = points[index + 1], point = { x: a.x + (b.x - a.x) * .3, y: a.y + (b.y - a.y) * .3 }
    const client = app.tree.getClientPointByWorld(app.tree.getWorldPoint(connectorPagePoint(app, line, point)))
    const { connectorLocalPoint } = await import('/src/editor/runtime/thinking/scene.ts')
    const convert = p => connectorLocalPoint(app, line, app.tree.getInnerPoint(app.tree.getWorldPointByClient({ clientX: p.x, clientY: p.y })))
    const from = convert(client), to = convert({ x: client.x + 96, y: client.y - 48 })
    return { x: client.x, y: client.y, delta: { x: to.x - from.x, y: to.y - from.y }, points }
  }, id)
}
async function dragBody(page, start) {
  await page.mouse.move(start.x, start.y); await page.mouse.down()
  await page.mouse.move(start.x + 96, start.y - 48, { steps: 12 })
}

for (const [name, route] of [
  ['straight', { mode: 'straight' }],
  ['automatic elbow', { mode: 'elbow' }],
  ['manual elbow', { mode: 'elbow', vertices: [{ x: 480, y: 240 }, { x: 480, y: 420 }] }],
  ['elbow with bend', { mode: 'elbow', axis: 'y', bend: 310 }],
  ['elbow with offset', { mode: 'elbow', axis: 'x', offset: 170 }],
  ['curve with bend and offset', { mode: 'curve', bend: 530, curveOffset: { x: 30, y: -45 } }],
]) test(`unbound ${name} translates from its body as one undoable operation`, async ({ page }, info) => {
  await open(page); const id = await seed(page, route), before = await scene(page), initial = nodes(before).find(node => node.id === id)
  const start = await bodyPoint(page, id), updates = await page.evaluate(() => window.demo.allUpdates.length)
  await dragBody(page, start)
  await expect.poll(() => page.evaluate(async () => { const { Leafer } = await import('/node_modules/.vite/deps/leafer-ui.js'); return Leafer.list.list.find(item => item.isApp).tree.children.filter(item => item.skipJSON && item.name === 'connector-drag-preview').length })).toBe(1)
  expect(await scene(page)).toEqual(before); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
  if (name === 'straight') await page.screenshot({ path: info.outputPath('straight-translation-preview.png') })
  await page.mouse.up()
  const after = await scene(page), moved = nodes(after).find(node => node.id === id)
  for (const end of ['from', 'to']) {
    expect(moved.data[end].x).toBeCloseTo(initial.data[end].x + start.delta.x)
    expect(moved.data[end].y).toBeCloseTo(initial.data[end].y + start.delta.y)
  }
  const points = await page.evaluate(async data => (await import('/src/editor/runtime/thinking/scene.ts')).connectorGeometry(data.from, data.to, data).hitPoints, moved.data)
  expect(points).toHaveLength(start.points.length)
  points.forEach((point, at) => { expect(point.x).toBeCloseTo(start.points[at].x + start.delta.x); expect(point.y).toBeCloseTo(start.points[at].y + start.delta.y) })
  expect(moved.data.sourceId).toBeFalsy(); expect(moved.data.targetId).toBeFalsy()
  expect(moved.data.curveOffset).toEqual(initial.data.curveOffset)
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates + 1)
  await page.evaluate(() => window.demo.handle.undo()); expect(await scene(page)).toEqual(before)
  await page.mouse.move(1100, 700); await page.waitForTimeout(150)
  await page.evaluate(() => window.demo.handle.redo()); expect(await scene(page)).toEqual(after)
  await page.evaluate(id => window.demo.handle.select([id]), id)
  const selectedStart = await bodyPoint(page, id)
  await dragBody(page, selectedStart); await page.keyboard.press('Escape'); await page.mouse.up()
  expect(await scene(page)).toEqual(after)
  await dragBody(page, selectedStart); await page.mouse.move(selectedStart.x, selectedStart.y, { steps: 12 }); await page.mouse.up()
  expect(await scene(page)).toEqual(after)
})

test('zoomed nested connector translation moves its label, converges with a peer and survives reopening', async ({ page, context }) => {
  await open(page); const id = await seed(page, { mode: 'straight' }, true)
  await page.evaluate(async id => {
    const { Leafer } = await import('/node_modules/.vite/deps/leafer-ui.js')
    const { allItems, connectorLabel, refreshConnectors } = await import('/src/editor/runtime/thinking/scene.ts')
    const app = Leafer.list.list.find(item => item.isApp), line = allItems(app).find(item => item.id === id), text = connectorLabel(app, line)
    text.text = '平移说明'; text.parent.data = { ...text.parent.data, offset: { x: 20, y: 65 } }
    refreshConnectors(app); window.demo.handle.flush(); window.demo.handle.revealElements([id], { maxZoom: 2 }); window.demo.handle.select([])
  }, id)
  await expect(page.locator('.zoom-value')).toHaveText('200%')
  const peer = await context.newPage(); await peer.goto(await page.evaluate(() => window.demo.link)); await peer.waitForFunction(() => window.demo?.handle)
  const before = await scene(page), label = nodes(before).find(node => node.data?.kind === 'connector-label'), start = await bodyPoint(page, id)
  await dragBody(page, start); await page.mouse.up()
  const after = await scene(page), moved = nodes(after).find(node => node.id === id), movedLabel = nodes(after).find(node => node.id === label.id)
  expect(moved.data.from.x).toBeCloseTo(300 + 96 / 2 / 1.25); expect(moved.data.from.y).toBeCloseTo(240 - 48 / 2 / 1.25)
  expect(movedLabel.x - label.x).toBeCloseTo(48); expect(movedLabel.y - label.y).toBeCloseTo(-24)
  expect(movedLabel.data.offset).toEqual(label.data.offset)
  await expect.poll(() => scene(peer)).toEqual(after)
  await page.evaluate(() => window.demo.handle.undo()); await expect.poll(() => scene(peer)).toEqual(before)
  await page.evaluate(() => window.demo.handle.redo()); await expect.poll(() => scene(peer)).toEqual(after)
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await page.waitForFunction(() => window.demo?.handle); expect(await scene(page)).toEqual(after)
  await peer.close()
})

test('a connector with one attached endpoint retains body path editing', async ({ page }) => {
  await open(page)
  const id = await page.evaluate(async () => {
    const { makeConnector, makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts')
    const node = makeDiagram('rounded', 140, 200), line = makeConnector({ x: 300, y: 240 }, { x: 700, y: 420 }, 'curve', node.id)
    line.data = { ...line.data, sourceAnchor: { x: 1, y: .5 } }
    for (const item of [node, line]) window.demo.handle.addElement(item.toJSON())
    const id = line.id; node.destroy(); line.destroy(); window.demo.handle.flush(); window.demo.handle.select([]); return id
  })
  const initial = nodes(await scene(page)).find(node => node.id === id), start = await bodyPoint(page, id)
  await dragBody(page, start); await page.mouse.up()
  const moved = nodes(await scene(page)).find(node => node.id === id)
  expect(moved.data.from).toEqual(initial.data.from); expect(moved.data.to).toEqual(initial.data.to)
  expect(moved.data.sourceId).toBe(initial.data.sourceId); expect(moved.data.targetId).toBe(initial.data.targetId)
  expect(moved.data.curveOffset.x).toBeCloseTo(start.delta.x); expect(moved.data.curveOffset.y).toBeCloseTo(start.delta.y)
})
