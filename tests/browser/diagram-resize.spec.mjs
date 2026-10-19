import { test, expect } from './fixtures.mjs'

const shapes = ['rounded', 'rect', 'ellipse', 'diamond', 'parallelogram', 'cylinder', 'triangle', 'hexagon', 'cloud', 'document']
const scene = page => page.evaluate(() => window.demo.model.getValue().scene.children)
const find = (nodes, id) => nodes.flatMap(n => [n, ...n.children ? flatten(n.children) : []]).find(n => n.id === id)
const flatten = nodes => nodes.flatMap(n => [n, ...n.children ? flatten(n.children) : []])
async function resize(page, id, corner, dx, dy) {
  await page.evaluate(id => window.demo.handle.select([id]), id)
  const bounds = await page.evaluate(id => window.demo.handle.revealElements([id], { maxZoom: 1 }).bounds, id)
  const host = await page.locator('.canvas-host').boundingBox()
  const start = { x: host.x + bounds.x + (corner.includes('right') ? bounds.width : 0), y: host.y + bounds.y + (corner.includes('bottom') ? bounds.height : 0) }
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + dx, start.y + dy, { steps: 12 }); await page.mouse.up()
  await page.evaluate(() => window.demo.handle.flush())
}
async function open(page) {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.model.remove(window.demo.model.getValue().scene.children.map(n => n.id)))
}
for (const shape of shapes) test(`${shape}: real corner resizing keeps the body and label inside one node`, async ({ page }, info) => {
  await open(page)
  const id = await page.evaluate(async shape => {
    const { makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts')
    const node = makeDiagram(shape, 420, 280, 'video_books', 280, 140, '#ffe5e3', '#cc4944'), id = node.id
    window.demo.handle.addElement(node.toJSON()); node.destroy(); return id
  }, shape)
  for (const [corner, dx, dy] of [['bottom-right', 110, 70], ['top-left', -60, -40], ['bottom-right', -100, -80]]) {
    const before = find(await scene(page), id)
    await resize(page, id, corner, dx, dy)
    const nodes = await scene(page), node = find(nodes, id), body = node.children.find(n => n.data?.kind === 'diagram-body'), text = node.children.find(n => n.tag === 'Text')
    expect(node.width).not.toBe(before.width)
    expect(flatten(nodes).map(n => n.id).sort()).toEqual(flatten([before]).map(n => n.id).sort())
    expect(body).toMatchObject({ width: node.width, height: node.height, x: 0, y: 0, fill: '#ffe5e3' })
    expect(text).toMatchObject({ width: node.width - 28, height: node.height - 24, x: 14, y: 12, fontSize: 16 })
    expect(node.fill).toBe('transparent')
  }
  await page.screenshot({ path: info.outputPath(`${shape}-resized.png`) })
})

test('resizing a multi-selection of diagram nodes keeps each body and label attached', async ({ page }) => {
  await open(page)
  const ids = await page.evaluate(async () => {
    const { makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts')
    const nodes = [makeDiagram('rounded', 320, 220, 'first', 200, 100), makeDiagram('rounded', 680, 400, 'second', 200, 100)]
    const ids = nodes.map(node => node.id)
    for (const node of nodes) { window.demo.handle.addElement(node.toJSON()); node.destroy() }
    window.demo.handle.select(ids); return ids
  })
  const host = await page.locator('.canvas-host').boundingBox()
  await page.mouse.move(host.x + 880, host.y + 500); await page.mouse.down(); await page.mouse.move(host.x + 1020, host.y + 600, { steps: 16 }); await page.mouse.up()
  await page.evaluate(() => window.demo.handle.flush())
  const nodes = await scene(page)
  expect(nodes.map(n => n.id).sort()).toEqual(ids.sort())
  for (const node of nodes) {
    expect(node.width).toBeGreaterThan(200)
    expect(node.children[0]).toMatchObject({ width: node.width, height: node.height, x: 0, y: 0 })
    expect(node.children[1]).toMatchObject({ width: node.width - 28, height: node.height - 24, x: 14, y: 12 })
  }
})

for (const name of ['diagram-node', 'frame']) test(`name-only legacy ${name} nodes resize their visual body rather than exposing the wrapper`, async ({ page }, info) => {
  await open(page)
  const id = await page.evaluate(async name => {
    const { makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts')
    const node = makeDiagram('rounded', 420, 280, 'video_books', 280, 140, '#ffe5e3', '#cc4944'), id = node.id
    const value = node.toJSON(); value.name = name; delete value.data; value.fill = '#cc4944'
    for (const child of value.children) delete child.data
    window.demo.handle.addElement(value); node.destroy(); return id
  }, name)
  const before = await scene(page)
  await resize(page, id, 'bottom-right', 140, 100)
  const node = find(await scene(page), id), body = node.children.find(n => n.name === 'diagram-body'), text = node.children.find(n => n.name === 'text')
  await page.screenshot({ path: info.outputPath(`${name}-legacy-resized.png`) })
  expect(node.width).toBeGreaterThan(280)
  expect(body).toMatchObject({ x: 0, y: 0, width: node.width, height: node.height, fill: '#ffe5e3' })
  expect(text).toMatchObject({ x: 14, y: 12, width: node.width - 28, height: node.height - 24 })
  expect(node.name).toBe('diagram-node'); expect(node.fill).toBe('transparent')
  expect(node.children.some(n => n.name === 'frame-title')).toBe(false)
  const saved = await scene(page)
  await page.evaluate(() => window.demo.handle.undo()); expect(await scene(page)).toEqual(before)
  await page.evaluate(() => window.demo.handle.redo()); expect(await scene(page)).toEqual(saved)
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await page.waitForFunction(() => window.demo?.handle); expect(await scene(page)).toEqual(saved)
})


test('a legacy diagram with an unnamed custom path keeps its outline through corner resizing', async ({ page }) => {
  await open(page)
  const id = await page.evaluate(async () => {
    const { makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts')
    const node = makeDiagram('triangle', 420, 280, 'custom path', 280, 140), id = node.id, value = node.toJSON()
    delete value.data; for (const child of value.children) delete child.data
    window.demo.handle.addElement(value); node.destroy(); return id
  })
  await resize(page, id, 'bottom-right', 140, 100)
  const node = find(await scene(page), id), body = node.children.find(n => n.name === 'diagram-body')
  expect(body.path.length).toBeGreaterThan(0)
  const bounds = await page.evaluate(async id => {
    const { Leafer } = await import('/node_modules/.vite/deps/leafer-ui.js')
    const app = Leafer.list.list.find(item => item.isApp), node = app.tree.children.find(n => n.id === id), body = node.children.find(n => n.name === 'diagram-body')
    const bounds = body.getBounds('box', 'inner'); return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
  }, id)
  expect(bounds.width).toBeCloseTo(node.width); expect(bounds.height).toBeCloseTo(node.height)
})

test('an explicitly marked container retains its role when it contains a named diagram body', async ({ page }) => {
  await open(page)
  await page.evaluate(() => window.demo.handle.addElement({ id: 'real-container', tag: 'Frame', name: 'frame', x: 420, y: 280, width: 280, height: 140, fill: '#cc4944', data: { kind: 'container', containerType: 'board' }, children: [{ id: 'child-body', tag: 'Rect', name: 'diagram-body', x: 0, y: 0, width: 100, height: 80, fill: '#ffe5e3' }] }))
  await resize(page, 'real-container', 'bottom-right', 140, 100)
  const node = find(await scene(page), 'real-container')
  expect(node).toMatchObject({ name: 'frame', fill: '#cc4944', data: { kind: 'container', containerType: 'board' } })
  expect(node.children.find(n => n.id === 'child-body')).toMatchObject({ width: 100, height: 80 })
})


test('opening an already stretched legacy wrapper repairs its existing body and text size', async ({ page }) => {
  await open(page)
  const id = await page.evaluate(async () => {
    const { makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts')
    const node = makeDiagram('rounded', 420, 280, 'video_books', 280, 140), value = node.toJSON(), id = node.id
    value.name = 'frame'; delete value.data; for (const child of value.children) delete child.data
    value.width = 420; value.height = 240; value.fill = '#cc4944'
    window.demo.model.add(value); node.destroy(); return id
  })
  const updates = await page.evaluate(() => window.demo.allUpdates.length)
  const view = () => page.evaluate(() => window.demo.handle.getValue().scene.children)
  const node = find(await view(), id)
  expect(node).toMatchObject({ name: 'diagram-node', fill: 'transparent', width: 420, height: 240 })
  expect(node.children[0]).toMatchObject({ width: 420, height: 240 })
  expect(node.children[1]).toMatchObject({ width: 392, height: 216, text: 'video_books' })
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await page.waitForFunction(() => window.demo?.handle)
  expect(find(await view(), id)).toEqual(node)
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
})

test('shrinking a diagram below its text insets never produces a negative text box', async ({ page }) => {
  await open(page)
  const id = await page.evaluate(async () => {
    const { makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts')
    const node = makeDiagram('rounded', 420, 280, 'label', 280, 140), id = node.id
    window.demo.handle.addElement(node.toJSON()); node.destroy(); return id
  })
  await resize(page, id, 'bottom-right', -270, -130)
  const node = find(await scene(page), id)
  expect(node.width).toBeLessThan(28); expect(node.height).toBeLessThan(24)
  expect(node.children[1].width).toBeGreaterThan(0); expect(node.children[1].height).toBeGreaterThan(0)
  expect((await scene(page)).map(n => n.id)).toEqual([id])
})
