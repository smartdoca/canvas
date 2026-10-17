import { test, expect } from './fixtures.mjs'

async function open(page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.model.remove(window.demo.model.getValue().scene.children.map(node => node.id)))
}
const scene = page => page.evaluate(() => window.demo.model.getValue().scene)
const line = (page, id) => page.evaluate(id => {
  const find = nodes => nodes.flatMap(node => [node, ...find(node.children || [])])
  return find(window.demo.model.getValue().scene.children).find(node => node.id === id)
}, id)
const numbers = path => path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number)
const middle = path => {
  const p = numbers(path)
  return { x: (p[0] + 3 * p[2] + 3 * p[4] + p[6]) / 8, y: (p[1] + 3 * p[3] + 3 * p[5] + p[7]) / 8 }
}
async function drag(page, handle, dx, dy) {
  const box = await handle.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 12 })
  return box
}
async function reopen(page) {
  const readyCount = await page.evaluate(() => { const count = window.demo.readyCount, open = window.demo.openDocument, checkpoint = window.demo.closeDocument(); open(checkpoint); return count })
  await page.waitForFunction(count => window.demo?.readyCount > count, readyCount)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

for (const direction of ['horizontal', 'vertical', 'diagonal']) test(`${direction} curves bend across the chord, preview follows the pointer and commit atomically`, async ({ page }, info) => {
  await open(page)
  const id = await page.evaluate(async direction => {
    const { makeConnector } = await import('/src/editor/runtime/thinking/scene.ts')
    const from = direction === 'vertical' ? { x: 620, y: 240 } : { x: 420, y: 360 }
    const to = direction === 'vertical' ? { x: 620, y: 600 } : { x: 820, y: direction === 'diagonal' ? 600 : 360 }
    const edge = makeConnector(from, to, 'curve')
    window.demo.handle.addElement(edge.toJSON()); window.demo.handle.select([edge.id]); window.demo.handle.flush()
    const id = edge.id; edge.destroy(); return id
  }, direction)
  const initial = await line(page, id), original = middle(initial.path), handle = page.locator('.graph-endpoint.is-bend')
  if (direction === 'horizontal') expect(original.y).toBeLessThan(initial.data.from.y - 20)
  if (direction === 'vertical') expect(original.x).toBeGreaterThan(initial.data.from.x + 20)
  const before = await scene(page), updates = await page.evaluate(() => window.demo.allUpdates.length)
  const unchanged = await drag(page, handle, 25, -30)
  await page.mouse.move(unchanged.x + unchanged.width / 2, unchanged.y + unchanged.height / 2, { steps: 8 }); await page.mouse.up()
  expect(await scene(page)).toEqual(before); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
  const start = await drag(page, handle, -130, 130)
  const preview = await page.locator('.graph-gesture-preview path').getAttribute('d'), point = middle(preview)
  expect(point.x).toBeCloseTo(original.x - 130); expect(point.y).toBeCloseTo(original.y + 130)
  const moved = await handle.boundingBox()
  expect(moved.x - start.x).toBeCloseTo(-130); expect(moved.y - start.y).toBeCloseTo(130)
  expect(await scene(page)).toEqual(before); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
  await page.screenshot({ path: info.outputPath(`${direction}-curve-preview.png`) })
  await page.mouse.up()
  const changed = await line(page, id)
  expect(changed.path).toBe(preview); expect(changed.data.from).toEqual(initial.data.from); expect(changed.data.to).toEqual(initial.data.to)
  expect(changed.data.curveOffset).toEqual({ x: -130, y: 130 })
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates + 1)
  if (direction === 'horizontal') expect(middle(changed.path).y).toBeGreaterThan(changed.data.from.y)
  if (direction === 'vertical') expect(middle(changed.path).x).toBeLessThan(changed.data.from.x)
  await page.evaluate(() => window.demo.handle.undo()); expect((await line(page, id)).path).toBe(initial.path)
  await page.evaluate(() => window.demo.handle.redo()); expect((await line(page, id)).path).toBe(changed.path)
  await page.evaluate(id => window.demo.handle.select([id]), id)
  const committed = await scene(page)
  await drag(page, handle, 35, -40); await page.keyboard.press('Escape'); await page.mouse.up()
  expect(await scene(page)).toEqual(committed)
  await reopen(page)
  expect((await line(page, id)).data.curveOffset).toEqual(changed.data.curveOffset)
  await page.evaluate(id => window.demo.handle.select([id]), id)
  await expect(page.locator('.graph-endpoint.is-bend')).toBeVisible()
  await page.evaluate(() => window.demo.handle.select([]))
  const body = middle(changed.path), host = await page.locator('.canvas-host').boundingBox()
  await expect(page.locator('.graph-endpoint.is-bend')).toHaveCount(0)
  await page.mouse.move(host.x + body.x, host.y + body.y)
  await expect(page.locator('.graph-route-highlight path')).toHaveCount(1)
  await page.mouse.down()
  await page.mouse.move(host.x + body.x + 25, host.y + body.y - 30, { steps: 10 }); await page.mouse.up()
  expect((await line(page, id)).data.curveOffset).toEqual({ x: -105, y: 100 })
  await page.getByRole('button', { name: '重置连线路径', exact: true }).click()
  expect((await line(page, id)).data.curveOffset).toBeUndefined()
  expect((await line(page, id)).path).toBe(initial.path)
})

test('an edited elbow converts to a draggable curve without reusing its segment gesture', async ({ page }) => {
  await open(page)
  const id = await page.evaluate(async () => {
    const { makeConnector } = await import('/src/editor/runtime/thinking/scene.ts')
    const edge = makeConnector({ x: 420, y: 300 }, { x: 840, y: 500 }, 'elbow')
    edge.data = { ...edge.data, vertices: [{ x: 600, y: 300 }, { x: 600, y: 500 }], bend: 600 }
    window.demo.handle.addElement(edge.toJSON()); window.demo.handle.select([edge.id]); window.demo.handle.flush()
    const id = edge.id; edge.destroy(); return id
  })
  await page.getByRole('button', { name: '连线类型', exact: true }).click()
  await page.getByRole('menuitemradio', { name: '曲线', exact: true }).click()
  const initial = await line(page, id)
  await expect(page.locator('.graph-segment')).toHaveCount(0)
  await drag(page, page.locator('.graph-endpoint.is-bend'), 35, -110); await page.mouse.up()
  const changed = await line(page, id)
  expect(changed.data.curveOffset).toEqual({ x: 35, y: -110 }); expect(changed.data.vertices).toEqual(initial.data.vertices)
  expect(middle(changed.path).y).toBeCloseTo(middle(initial.path).y - 110)
  await page.getByRole('button', { name: '连线类型', exact: true }).click()
  await page.getByRole('menuitemradio', { name: '直线', exact: true }).click()
  expect((await line(page, id)).path).not.toContain('C')
  await page.getByRole('button', { name: '连线类型', exact: true }).click()
  await page.getByRole('menuitemradio', { name: '曲线', exact: true }).click()
  expect((await line(page, id)).path).toBe(changed.path)
})

test('growth flywheel inserts four curved arrows, supports zoomed editing and follows its bound nodes after reopening', async ({ page }, info) => {
  await open(page)
  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await page.getByRole('dialog', { name: '模板库', exact: true }).getByRole('button', { name: '增长飞轮', exact: true }).click()
  const group = (await scene(page)).children.find(node => node.data?.template === 'flywheel')
  const edges = group.children.filter(node => node.data?.kind === 'template-edge')
  expect(edges).toHaveLength(4)
  for (const edge of edges) {
    expect(edge.data.mode).toBe('curve'); expect(edge.path).toContain('C')
    const p = numbers(edge.path), dx = p[6] - p[0], dy = p[7] - p[1]
    expect(Math.abs((p[2] - p[0]) * dy - (p[3] - p[1]) * dx)).toBeGreaterThan(1000)
    expect(Math.abs((p[4] - p[0]) * dy - (p[5] - p[1]) * dx)).toBeGreaterThan(1000)
  }
  await page.evaluate(id => { window.demo.handle.revealElements([id]); window.demo.handle.select([]) }, group.id)
  await page.screenshot({ path: info.outputPath('growth-flywheel-curves.png') })
  const id = edges[0].id
  const beforeView = await scene(page), updates = await page.evaluate(() => window.demo.allUpdates.length)
  await page.evaluate(id => { window.demo.handle.select([id]); window.demo.handle.revealElements([id], { maxZoom: 2 }) }, id)
  await expect(page.locator('.zoom-value')).toHaveText('200%')
  await page.evaluate(() => window.demo.handle.flush())
  expect(await scene(page)).toEqual(beforeView); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
  const initial = await line(page, id)
  await drag(page, page.locator('.graph-endpoint.is-bend'), 70, -50)
  const preview = await page.locator('.graph-gesture-preview path').getAttribute('d')
  await page.mouse.up()
  const changed = await line(page, id)
  expect(changed.data.curveOffset.x).toBeCloseTo(35); expect(changed.data.curveOffset.y).toBeCloseTo(-25)
  expect(changed.path).toBe(preview); expect(changed.data.from).toEqual(initial.data.from); expect(changed.data.to).toEqual(initial.data.to)
  await reopen(page)
  expect((await line(page, id)).data.curveOffset).toEqual(changed.data.curveOffset)
  const source = await line(page, changed.data.sourceId)
  await page.evaluate(({ sourceId, x }) => { window.demo.handle.select([sourceId]); window.demo.handle.updateSelection({ x }); window.demo.handle.flush() }, { sourceId: source.id, x: source.x + 40 })
  const moved = await line(page, id)
  expect(moved.data.from.x).toBeCloseTo(changed.data.from.x + 40)
  expect(moved.data.curveOffset).toEqual(changed.data.curveOffset)
  await page.evaluate(id => window.demo.handle.select([id]), id)
  const native = await page.evaluate(() => window.demo.handle.getSelection()[0].path)
  expect(native).toBe(moved.path)
  const svgPaths = await page.evaluate(async () => {
    const svg = await (await window.demo.handle.exportFile({ format: 'svg' })).blob.text()
    return [...new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('path')].map(path => path.getAttribute('d') || '')
  })
  const expected = numbers(moved.path)
  expect(svgPaths.some(path => { const values = path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)?.map(Number); return values?.length === expected.length && values.every((value, at) => Math.abs(value - expected[at]) < .01) })).toBe(true)
})

test('drawing a curve previews the committed geometry at zoom with both ports attached', async ({ page }) => {
  await open(page)
  const ids = await page.evaluate(async () => {
    const { makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts')
    const a = makeDiagram('rounded', 350, 250), b = makeDiagram('rounded', 500, 500)
    for (const item of [a, b]) window.demo.handle.addElement(item.toJSON())
    const ids = [a.id, b.id]; a.destroy(); b.destroy()
    window.demo.handle.revealElements(ids, { maxZoom: 2 }); return ids
  })
  await page.getByRole('button', { name: '连线 (A)', exact: true }).click()
  await page.locator('.connector-choices').getByRole('button', { name: '曲线', exact: true }).click()
  const points = await page.evaluate(() => {
    const origin = window.demo.handle.clientToScene({ x: 0, y: 0 }), unit = window.demo.handle.clientToScene({ x: 1, y: 1 })
    return [{ x: 510, y: 290 }, { x: 580, y: 500 }].map(point => ({ x: (point.x - origin.x) / (unit.x - origin.x), y: (point.y - origin.y) / (unit.y - origin.y) }))
  })
  await page.mouse.move(points[0].x, points[0].y); await page.mouse.down()
  await page.mouse.move(points[1].x, points[1].y, { steps: 12 })
  const preview = await page.locator('.thinking-insert-preview path').getAttribute('d')
  await page.mouse.up()
  const edge = (await scene(page)).children.find(node => node.data?.kind === 'connector')
  expect(edge.data.sourceId).toBe(ids[0]); expect(edge.data.targetId).toBe(ids[1])
  expect(edge.data.sourceAnchor).toEqual({ x: 1, y: .5 }); expect(edge.data.targetAnchor).toEqual({ x: .5, y: 0 })
  expect(edge.path).toBe(preview)
})
