import { test, expect } from './fixtures.mjs'

test.setTimeout(30000)
async function open(page) {
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.model.remove(window.demo.model.getValue().scene.children.map(node => node.id)))
}
const scene = page => page.evaluate(() => window.demo.model.getValue().scene.children)
const selectedRoute = page => page.locator('.graph-route-highlight path').getAttribute('d')
const pointsOf = path => { const numbers = path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number); return Array.from({ length: numbers.length / 2 }, (_, i) => ({ x: numbers[i * 2], y: numbers[i * 2 + 1] })) }
async function drag(page, handle, dx, dy) {
  const b = await handle.boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 12 })
}

for (const vertical of [true, false]) test(`${vertical ? 'vertical' : 'horizontal'} bound terminal segment handles follow perpendicular dragging without detaching or accumulating bends`, async ({ page }, info) => {
  await open(page)
  const id = await page.evaluate(async vertical => {
    const { makeDiagram, makeConnector } = await import('/src/editor/runtime/thinking/scene.ts')
    const a = makeDiagram('rounded', vertical ? 340 : 280, vertical ? 180 : 200, 'source'), b = makeDiagram('rounded', vertical ? 700 : 820, vertical ? 480 : 460, 'target')
    const from = vertical ? { x: 420, y: 260 } : { x: 440, y: 240 }, to = vertical ? { x: 780, y: 480 } : { x: 820, y: 500 }
    const edge = makeConnector(from, to, 'elbow', a.id, b.id)
    edge.data = { ...edge.data, sourceAnchor: vertical ? { x: .5, y: 1 } : { x: 1, y: .5 }, targetAnchor: vertical ? { x: .5, y: 0 } : { x: 0, y: .5 } }
    for (const item of [a, b, edge]) window.demo.handle.addElement(item.toJSON())
    window.demo.handle.flush(); window.demo.handle.select([edge.id]); const id = edge.id
    for (const item of [a, b, edge]) item.destroy()
    return id
  }, vertical)
  const before = (await scene(page)).find(n => n.id === id), original = await selectedRoute(page), axis = vertical ? 'x' : 'y'
  const initialNativePath = await page.evaluate(() => window.demo.handle.getSelection()[0].path)
  expect(initialNativePath).toBe(await page.evaluate(async data => (await import('/src/editor/runtime/thinking/scene.ts')).connectorGeometry(data.from, data.to, data).path, before.data))
  const first = page.locator('.graph-segment').first(), start = await first.boundingBox(), canvas = await page.locator('.canvas-host').boundingBox(), coordinate = vertical ? start.x + start.width / 2 - canvas.x : start.y + start.height / 2 - canvas.y
  const updates = await page.evaluate(() => window.demo.allUpdates.length)
  const snapshotBeforeDrag = await scene(page)
  await drag(page, first, vertical ? 0 : 50, vertical ? 50 : 0); await page.mouse.up()
  expect(await scene(page)).toEqual(snapshotBeforeDrag); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
  await drag(page, first, vertical ? 60 : 0, vertical ? 0 : 60)
  const preview = pointsOf(await page.locator('.graph-gesture-preview path').getAttribute('d'))
  expect(preview.some((p, i) => i > 0 && Math.abs(p[axis] - coordinate - 60) < 1 && Math.abs(preview[i - 1][axis] - p[axis]) < .001)).toBe(true)
  const movedHandle = await first.boundingBox(); expect(vertical ? movedHandle.x - start.x : movedHandle.y - start.y).toBeCloseTo(60)
  expect((await scene(page)).find(n => n.id === id).path).toBe(before.path)
  await page.screenshot({ path: info.outputPath(`terminal-${vertical ? 'vertical' : 'horizontal'}-preview.png`) })
  await page.mouse.up()
  expect(await selectedRoute(page)).not.toBe(original)
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates + 1)
  for (let i = 0; i < 10; i++) {
    const handles = page.locator(`.graph-segment[data-axis=${axis}]`), handle = i % 2 ? handles.first() : handles.last(), box = await handle.boundingBox(), path = await selectedRoute(page)
    const value = i % 4 < 2 ? -20 : 20, p = pointsOf(path), h = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const host = await page.locator('.canvas-host').boundingBox(), index = p.slice(1).findIndex((point, at) => Math.abs((p[at].x + point.x) / 2 + host.x - h.x) < 1 && Math.abs((p[at].y + point.y) / 2 + host.y - h.y) < 1)
    expect(index).toBeGreaterThanOrEqual(0)
    const isVertical = Math.abs(p[index].x - p[index + 1].x) < .001
    await drag(page, handle, isVertical ? value : 0, isVertical ? 0 : value); await page.mouse.up()
    expect(await selectedRoute(page)).not.toBe(path)
    const next = (await scene(page)).find(n => n.id === id), points = pointsOf(await selectedRoute(page))
    expect(next.data.from).toEqual(before.data.from); expect(next.data.to).toEqual(before.data.to)
    expect(points.length, JSON.stringify({ iteration: i, segment: index, points })).toBeLessThanOrEqual(8)
    for (let at = 1; at < points.length; at++) expect(Math.min(Math.abs(points[at].x - points[at - 1].x), Math.abs(points[at].y - points[at - 1].y))).toBeLessThan(.001)
  }
  const snapshot = await scene(page)
  await drag(page, page.locator('.graph-segment').first(), 40, 40); await page.keyboard.press('Escape'); await page.mouse.up(); expect(await scene(page)).toEqual(snapshot)
  await page.screenshot({ path: info.outputPath(`terminal-${vertical ? 'vertical' : 'horizontal'}-committed.png`) })
  await page.evaluate(() => window.demo.handle.undo()); expect(await scene(page)).not.toEqual(snapshot)
})

test('legacy automatic template edges leave the right port horizontally and native paths match the selected route after reopen', async ({ page }, info) => {
  await open(page)
  const ids = await page.evaluate(async () => {
    const { createTemplate } = await import('/src/editor/runtime/thinking/templates.ts')
    const group = createTemplate('architecture', 520, 350, key => key), value = group.toJSON()
    const target = value.children.find(n => n.name === 'diagram-node' && n.x === 180 && n.y > 0); target.y = 220
    const edge = value.children.find(n => n.data?.targetId === target.id)
    delete edge.data.sourceAnchor; delete edge.data.targetAnchor
    edge.data.to = { x: target.x, y: target.y + target.height / 2 }
    const a = edge.data.from, b = edge.data.to, y = (a.y + b.y) / 2
    edge.path = `M${a.x} ${a.y}L${a.x} ${y}L${b.x} ${y}L${b.x} ${b.y}`
    const id = window.demo.model.add(value); window.demo.handle.flush(); group.destroy(); return { id, edge: edge.id, target: target.id }
  })
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await page.waitForFunction(() => window.demo?.handle)
  const before = await scene(page), updates = await page.evaluate(() => window.demo.allUpdates.length)
  await page.evaluate(id => window.demo.handle.select([id]), ids.edge)
  const points = pointsOf(await selectedRoute(page)), native = await page.evaluate(() => window.demo.handle.getSelection()[0])
  expect(points[1].y).toBe(points[0].y); expect(points[1].x).toBeGreaterThan(points[0].x)
  expect(points.at(-2).y).toBe(points.at(-1).y); expect(points.at(-2).x).toBeLessThan(points.at(-1).x)
  const expected = await page.evaluate(async data => (await import('/src/editor/runtime/thinking/scene.ts')).connectorGeometry(data.from, data.to, data).path, native.data)
  expect(native.path).toBe(expected)
  const svgPaths = await page.evaluate(async () => {
    const svg = await (await window.demo.handle.exportFile({ format: 'svg' })).blob.text()
    return [...new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('path')].map(p => (p.getAttribute('d')?.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) || []).map(Number))
  })
  const expectedNumbers = pointsOf(expected).flatMap(p => [p.x, p.y])
  expect(svgPaths.some(values => values.length === expectedNumbers.length && values.every((value, i) => Math.abs(value - expectedNumbers[i]) < .01))).toBe(true)
  expect(await scene(page)).toEqual(before); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
  await page.evaluate(id => { window.demo.handle.select([id]); window.demo.handle.updateSelection({ y: 160 }); window.demo.handle.flush() }, ids.target)
  await page.evaluate(id => window.demo.handle.select([id]), ids.edge)
  const moved = pointsOf(await selectedRoute(page)), updated = await page.evaluate(() => window.demo.handle.getSelection()[0])
  expect(moved[1].y).toBe(moved[0].y); expect(moved.at(-2).y).toBe(moved.at(-1).y)
  expect(updated.path).toBe(await page.evaluate(async data => (await import('/src/editor/runtime/thinking/scene.ts')).connectorGeometry(data.from, data.to, data).path, updated.data))
  await page.screenshot({ path: info.outputPath('legacy-template-route.png') })
})
