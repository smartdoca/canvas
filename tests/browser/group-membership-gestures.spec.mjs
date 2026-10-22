import { writeFileSync } from 'node:fs'
import { test, expect } from './fixtures.mjs'

const byId = (scene, id) => {
  const visit = nodes => { for (const node of nodes) { if (node.id === id) return node; const child = visit(node.children || []); if (child) return child } }
  return visit(scene.children)
}
const read = page => page.evaluate(() => ({ scene: window.demo.model.getValue().scene, writes: window.demo.allUpdates.length }))
async function flush(page) { await page.waitForTimeout(30); await page.evaluate(() => window.demo.handle.flush()); await page.waitForTimeout(160) }
async function seed(page, extension = false) {
  await page.setViewportSize({ width: 1600, height: 1200 })
  if (extension && process.env.CANVAS_PACKAGE_CONSUMER) await page.addInitScript(() => { window.__canvasQaDraw = true })
  if (extension && !process.env.CANVAS_PACKAGE_CONSUMER) await page.route('**/examples/doca/main.jsx', async route => {
    const response = await route.fetch(), source = await response.text()
    if (!source.includes('selectionActions:')) throw Error('QA_EXTENSION_ENTRY_NOT_FOUND')
    await route.fulfill({ response, body: source.replace('selectionActions:', `elementExtensions: [{ type: 'qa-draw', label: 'QA Draw', create: ({ bounds }) => ({ id: 'long-draw', tag: 'Rect', ...bounds, fill: '#bce6dc' }) }], selectionActions:`) })
  })
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  const url = await page.evaluate(() => {
    const rect = (id, x, y, width, height) => ({ id, tag: 'Rect', name: 'rect', x, y, width, height, fill: '#dbe8ff', editable: true })
    const frame = { id: 'outer', tag: 'Frame', name: 'frame', x: 320, y: 80, width: 640, height: 480, fill: '#ffffff', stroke: '#b8bec9', strokeWidth: 1, hitChildren: false,
      data: { kind: 'container', containerType: 'board', title: 'Outer' }, editable: true,
      children: [rect('outer-card', 28, 140, 280, 100), { id: 'inner', tag: 'Frame', name: 'frame', x: 44, y: 260, width: 400, height: 180,
        fill: '#ffffff', stroke: '#b8bec9', strokeWidth: 1, data: { kind: 'container', containerType: 'board', title: 'Inner' }, editable: true, children: [rect('inner-card', 28, 70, 180, 60)] }] }
    const model = window.demo.model.constructor.initialize(crypto.randomUUID(), { version: 1, scene: { tag: 'Leafer', children: [frame,
      rect('outside', 1100, 650, 120, 70), rect('resize-card', 980, 200, 160, 80)] } })
    const checkpoint = model.checkpoint(), target = new URL('/examples/doca/', location.origin)
    target.searchParams.set('epoch', checkpoint.epochId); target.searchParams.set('checkpoint', btoa(String.fromCharCode(...checkpoint.update))); model.dispose(); return target.href
  })
  await page.goto(url); await page.waitForFunction(() => window.demo?.handle)
  return url
}
async function point(page, id, rx = .5, ry = .5) {
  return page.evaluate(async ({ id, rx, ry }) => {
    const { Leafer } = window.canvasQaEngine || await import('/__qa/canvas-engine.js'), app = Leafer.list.list.find(item => item.isApp)
    const visit = nodes => { for (const node of nodes) { if (node.id === id) return node; const child = visit(node.children || []); if (child) return child } }
    const item = visit(app.tree.children), bounds = item.getBounds('box', 'world')
    const p = app.tree.getClientPointByWorld({ x: bounds.x + bounds.width * rx, y: bounds.y + bounds.height * ry })
    return { x: p.x, y: p.y }
  }, { id, rx, ry })
}
async function select(page, id) {
  await page.evaluate(id => window.demo.handle.select([id]), id)
  await expect.poll(() => page.evaluate(async id => {
    const { Leafer } = window.canvasQaEngine || await import('/__qa/canvas-engine.js'), app = Leafer.list.list.find(item => item.isApp)
    return app.editor.list.length === 1 && app.editor.list[0].id === id && app.editor.list[0].syncEventer === app.editor.editBox.rect && app.editor.editBox.visible
  }, id)).toBe(true)
  await page.locator('.canvas-app').focus()
}
async function drag(page, from, dx, dy, release = true) {
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(from.x + dx, from.y + dy, { steps: 14 })
  if (release) { await page.mouse.up(); await flush(page) }
}
async function duplicate(page) {
  await select(page, 'outer'); await page.keyboard.press('ControlOrMeta+d'); await flush(page)
  const current = await read(page), copy = current.scene.children.find(node => node.data?.containerType === 'board' && node.id !== 'outer')
  expect(copy).toBeTruthy(); expect(current.writes).toBe(1)
  return { current, copy }
}
const reopen = async page => { await page.evaluate(() => { const open = window.demo.openDocument, checkpoint = window.demo.closeDocument(); open(checkpoint) }); await page.waitForFunction(() => window.demo?.handle); await flush(page) }

test('unrelated real drag and new drawing retain both overlapping copied subtrees and original model flags', async ({ page, context }, info) => {
  const url = await seed(page), { current: copied, copy } = await duplicate(page)
  const peer = await context.newPage(); await peer.goto(url); await peer.waitForFunction(() => window.demo?.handle)
  await select(page, 'outside'); await drag(page, await point(page, 'outside'), 80, 80)
  let moved = await read(page)
  expect(byId(moved.scene, 'outer')).toEqual(byId(copied.scene, 'outer'))
  expect(byId(moved.scene, copy.id)).toEqual(copy)
  expect(byId(moved.scene, 'outside').x).toBeCloseTo(1180, 0)
  await page.getByRole('button', { name: '便笺 (N)', exact: true }).click()
  await page.mouse.click(1300, 980); await flush(page)
  const created = await read(page)
  expect(created.scene.children.some(node => node.name === 'note')).toBe(true)
  expect(byId(created.scene, 'outer')).toEqual(byId(copied.scene, 'outer'))
  expect(byId(created.scene, copy.id)).toEqual(copy)
  await expect.poll(async () => (await read(peer)).scene).toEqual(created.scene)
  expect((await read(peer)).writes).toBe(0)
  await reopen(page); expect((await read(page)).scene).toEqual(created.scene)
  writeFileSync(info.outputPath('unrelated-transform-and-create.json'), JSON.stringify({ copied, moved, created }, null, 2))
})

test('real movement of a copied outer container preserves its full nested subtree and local geometry', async ({ page, context }, info) => {
  const url = await seed(page), { current: copied, copy } = await duplicate(page)
  const peer = await context.newPage(); await peer.goto(url); await peer.waitForFunction(() => window.demo?.handle)
  await select(page, copy.id); await drag(page, await point(page, copy.id, .87, .25), 120, 350)
  const moved = await read(page), after = byId(moved.scene, copy.id)
  expect(after.children).toEqual(copy.children)
  expect(after.x - copy.x).toBeGreaterThan(100); expect(after.y - copy.y).toBeGreaterThan(300)
  expect(byId(moved.scene, 'outer')).toEqual(byId(copied.scene, 'outer'))
  await expect.poll(async () => (await read(peer)).scene).toEqual(moved.scene)
  expect((await read(peer)).writes).toBe(0)
  await page.evaluate(() => window.demo.handle.undo()); expect((await read(page)).scene).toEqual(copied.scene)
  await page.evaluate(() => window.demo.handle.redo()); expect((await read(page)).scene).toEqual(moved.scene)
  await reopen(page); expect((await read(page)).scene).toEqual(moved.scene)
  writeFileSync(info.outputPath('moved-copy.json'), JSON.stringify({ copied, moved }, null, 2))
})

test('an API insertion during a real pending drag does not consume another item’s membership work', async ({ page }, info) => {
  await seed(page)
  await select(page, 'outside'); await drag(page, await point(page, 'outside'), -510, -255, false)
  await page.evaluate(() => window.demo.handle.addElement({ id: 'concurrent-insert', tag: 'Rect', name: 'rect', x: 1260, y: 900, width: 80, height: 60, fill: '#a5dfc6', editable: true }))
  await page.mouse.up(); await flush(page)
  const after = await read(page)
  expect(byId(after.scene, 'inner').children.some(node => node.id === 'outside')).toBe(true)
  expect(after.scene.children.some(node => node.id === 'outside')).toBe(false)
  expect(after.scene.children.find(node => node.id === 'concurrent-insert')).toMatchObject({ x: 1260, y: 900 })
  await reopen(page); expect((await read(page)).scene).toEqual(after.scene)
  writeFileSync(info.outputPath('pending-drag-insert.json'), JSON.stringify(after, null, 2))
})

test('a real resize still updates the transformed item’s containment without changing copied subtrees', async ({ page }, info) => {
  await seed(page); const { current: copied, copy } = await duplicate(page)
  await select(page, 'resize-card')
  const handle = await page.evaluate(async () => {
    const { Leafer } = window.canvasQaEngine || await import('/__qa/canvas-engine.js'), app = Leafer.list.list.find(item => item.isApp)
    const bounds = app.editor.editBox.resizePoints[0].getBounds('box', 'world')
    const p = app.sky.getClientPointByWorld({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
    return { x: p.x, y: p.y }
  })
  await drag(page, handle, -280, -80)
  const resized = await read(page), card = byId(resized.scene, 'resize-card')
  writeFileSync(info.outputPath('resize-before-assertion.json'), JSON.stringify({ copied, resized }, null, 2))
  expect(card.width * Math.abs(card.scaleX || 1)).toBeGreaterThan(400)
  expect(byId(resized.scene, 'outer').children.some(node => node.id === card.id) || byId(resized.scene, copy.id).children.some(node => node.id === card.id)).toBe(true)
  const originalChildren = byId(copied.scene, 'outer').children
  expect(byId(resized.scene, 'outer').children.filter(node => node.id !== card.id)).toEqual(originalChildren)
  expect(byId(resized.scene, copy.id).children.filter(node => node.id !== card.id)).toEqual(copy.children)
  await reopen(page); expect((await read(page)).scene).toEqual(resized.scene)
  writeFileSync(info.outputPath('resize-membership.json'), JSON.stringify({ copied, resized }, null, 2))
})


test('a newly drawn native table uses its table root for containment while the first cell remains selected', async ({ page }, info) => {
  await seed(page)
  await page.getByRole('button', { name: '表格', exact: true }).click()
  await page.getByRole('button', { name: '2 × 2', exact: true }).click()
  const p = await point(page, 'outer', .75, .25)
  await page.mouse.click(p.x, p.y); await flush(page)
  const after = await read(page), outer = byId(after.scene, 'outer')
  const table = outer.children.find(node => node.data?.kind === 'table')
  expect(table).toBeTruthy()
  expect((await page.evaluate(() => window.demo.handle.getSelection()))[0].data.kind).toBe('table-cell')
  await reopen(page); expect((await read(page)).scene).toEqual(after.scene)
  writeFileSync(info.outputPath('created-table-root.json'), JSON.stringify(after, null, 2))
})

test('a new containing frame adopts an existing overflow container as one intact subtree', async ({ page }, info) => {
  await seed(page)
  await page.evaluate(() => window.demo.handle.addElement({ id: 'overflow-frame', tag: 'Frame', name: 'frame', x: 100, y: 100, width: 100, height: 100, overflow: 'show', fill: '#ffffff', editable: true,
    hitChildren: false, data: { kind: 'container', containerType: 'board', title: 'Overflow' }, children: [{ id: 'overflow-child', tag: 'Rect', name: 'rect', x: 150, y: 0, width: 20, height: 20, fill: '#ffaa77', editable: true }] }))
  const before = await read(page)
  await page.evaluate(() => window.demo.handle.addElement({ id: 'new-containing-frame', tag: 'Frame', name: 'frame', x: 50, y: 50, width: 400, height: 300, fill: '#ffffff', editable: true,
    data: { kind: 'container', containerType: 'board', title: 'Containing' }, children: [] }))
  await flush(page)
  const after = await read(page), containing = byId(after.scene, 'new-containing-frame'), captured = containing.children.find(node => node.id === 'overflow-frame')
  expect(captured).toBeTruthy()
  expect(captured.children).toEqual(byId(before.scene, 'overflow-frame').children)
  expect(captured.hitChildren).toBe(false)
  expect(containing.children.some(node => node.id === 'overflow-child')).toBe(false)
  await reopen(page); expect((await read(page)).scene).toEqual(after.scene)
  writeFileSync(info.outputPath('captured-overflow-subtree.json'), JSON.stringify({ before, after }, null, 2))
})

test('a real extension draw paused beyond content debounce retains its creation instance for containment', async ({ page }, info) => {
  await seed(page, true)
  await page.locator('[data-tool="more"] > button').click()
  await page.getByRole('button', { name: 'QA Draw', exact: true }).click()
  const p = await point(page, 'outer', .75, .23)
  await drag(page, p, 80, 90, false)
  await page.waitForTimeout(300)
  const during = await read(page)
  expect(during.scene.children.some(node => node.id === 'long-draw')).toBe(true)
  await page.mouse.up(); await flush(page)
  const after = await read(page)
  expect(byId(after.scene, 'outer').children.some(node => node.id === 'long-draw')).toBe(true)
  await reopen(page); expect((await read(page)).scene).toEqual(after.scene)
  writeFileSync(info.outputPath('paused-extension-draw.json'), JSON.stringify({ during, after }, null, 2))
})
