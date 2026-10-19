import { test, expect } from './fixtures.mjs'

const scene = page => page.evaluate(() => window.demo.model.getValue().scene.children)
async function open(page) {
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.model.remove(window.demo.model.getValue().scene.children.map(n => n.id)))
}
async function center(page, id) {
  const bounds = await page.evaluate(id => window.demo.handle.revealElements([id], { maxZoom: 1 }).bounds, id)
  const host = await page.locator('.canvas-host').boundingBox()
  return { x: host.x + bounds.x + bounds.width / 2, y: host.y + bounds.y + bounds.height / 2 }
}
async function seed(page, kind) {
  return page.evaluate(async kind => {
    const { makeDiagram, makeMindMap, makeTable } = await import('/src/editor/runtime/thinking/scene.ts')
    let json, selectedId
    if (['diagram', 'mind', 'table'].includes(kind)) {
      const item = kind === 'diagram' ? makeDiagram('rounded', 350, 240, '删除测试') : kind === 'mind' ? makeMindMap(520, 340, '中心', '分支') : makeTable(350, 240, 2, 2, ['删除测试'])
      json = item.toJSON(); selectedId = kind === 'mind' ? item.children.find(n => n.data?.root).id : item.id; item.destroy()
    } else {
      json = kind === 'rect' ? { tag: 'Rect', name: 'rect', x: 350, y: 240, width: 240, height: 180, fill: '#3370ff', editable: true } : { tag: 'Frame', name: kind, data: { kind }, x: 350, y: 240, width: 240, height: 200, fill: '#fff2a8', editable: true, hitChildren: false, children: [{ tag: 'Text', name: 'text', text: '删除测试', x: 16, y: 16, width: 208, height: 168, fontSize: 20, fill: '#1f2329', editable: true }] }
    }
    const item = window.demo.handle.addElement(json); window.demo.handle.select([])
    return { id: item.id, selectedId: selectedId || item.id }
  }, kind)
}

for (const kind of ['note', 'diagram', 'rect', 'mind', 'table', 'card']) for (const key of ['Delete', 'Backspace']) test(`${kind}: click selection then ${key} keeps the canvas alive and undo restores the element`, async ({ page }) => {
  await open(page); const { id, selectedId } = await seed(page, kind), point = await center(page, selectedId)
  await page.mouse.click(point.x, point.y)
  if (['table', 'card'].includes(kind)) { await page.keyboard.press('Escape'); await page.evaluate(id => window.demo.handle.select([id]), selectedId); await page.locator('.canvas-app').focus() }
  await expect.poll(() => page.evaluate(() => window.demo.handle.getSelection().map(n => n.id))).toEqual([selectedId])
  await expect(page.locator(`.graph-port[data-node-id="${selectedId}"]`)).toHaveCount(12)
  const before = await scene(page)
  await page.keyboard.press(key); await page.evaluate(() => window.demo.handle.flush())
  await expect(page.locator('.canvas-app')).toBeVisible(); await expect.poll(() => scene(page)).toEqual([])
  await expect(page.locator('.graph-port,.selection-actions')).toHaveCount(0)
  await page.evaluate(() => window.demo.handle.undo()); await expect.poll(() => scene(page)).toEqual(before)
  const restored = await center(page, selectedId); await page.mouse.move(restored.x + 10, restored.y); await page.mouse.move(restored.x, restored.y)
  if (kind === 'table') await page.evaluate(id => window.demo.handle.select([id]), selectedId)
  await expect(page.locator(`.graph-port[data-node-id="${selectedId}"]`)).toHaveCount(12)
  expect((await scene(page))[0].id).toBe(id)
})

test('peer deletion clears hovered and selected connector handles, then undo restores both pages', async ({ page, context }) => {
  await open(page); const { id } = await seed(page, 'note')
  const peer = await context.newPage(); await peer.goto(await page.evaluate(() => window.demo.link)); await peer.waitForFunction(() => window.demo?.handle)
  const point = await center(page, id); await page.mouse.click(point.x, point.y)
  await expect(page.locator(`.graph-port[data-node-id="${id}"]`)).toHaveCount(12)
  const before = await scene(page)
  await peer.evaluate(id => window.demo.model.remove([id]), id)
  await expect.poll(() => scene(page)).toEqual([]); await expect(page.locator('.canvas-app')).toBeVisible(); await expect(page.locator('.graph-port')).toHaveCount(0)
  await peer.evaluate(() => window.demo.handle.undo()); await expect.poll(() => scene(page)).toEqual(before)
  await page.mouse.move(point.x + 10, point.y); await page.mouse.move(point.x, point.y)
  await expect(page.locator(`.graph-port[data-node-id="${id}"]`)).toHaveCount(12)
  await peer.close()
})

for (const key of ['Delete', 'Backspace']) test(`standalone: clicking an existing note then ${key} allows continued drawing`, async ({ page }) => {
  await page.goto('/')
  const host = page.locator('.canvas-host'), note = page.getByRole('button', { name: '便笺 (N)', exact: true })
  await note.click(); await host.click({ position: { x: 700, y: 350 } })
  await host.click({ position: { x: 1000, y: 550 } }); await host.click({ position: { x: 700, y: 350 } })
  await expect(page.locator('.graph-port')).toHaveCount(12)
  await page.keyboard.press(key)
  await expect(page.locator('.canvas-app')).toBeVisible(); await expect(page.locator('.graph-port,.selection-actions')).toHaveCount(0)
  await note.click(); await host.click({ position: { x: 700, y: 350 } })
  await expect(page.locator('.selection-actions')).toBeVisible()
})
