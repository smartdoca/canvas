import { test, expect } from './fixtures.mjs'

const scene = page => page.evaluate(() => window.demo.model.getValue().scene)
const writes = page => page.evaluate(() => window.demo.allUpdates.length)

// Current schema-1 input accepted by CanvasModel, before any native makeTable/layoutTable call.
function minimalTable() {
  const texts = ['项目', '状态', '备注', 'Task', 'Ready', 'QA']
  return { id: 'qa-table', tag: 'Group', name: 'board-table', x: 160, y: 480, editable: true, hitSelf: false, data: { kind: 'table', rows: 2, columns: 3 }, children: texts.map((text, index) => {
    const row = Math.floor(index / 3), column = index % 3, id = `table-cell-${row}-${column}`
    return { id, tag: 'Frame', name: 'table-cell', x: column * 140, y: row * 46, width: 140, height: 46, fill: row === 0 ? '#eaf1ff' : '#ffffff', stroke: '#cfd3d8', strokeWidth: 1, editable: false, hitChildren: false, data: { kind: 'table-cell', row, column }, children: [{ id: `${id}-label`, tag: 'Text', name: 'text', x: 12, y: 10, width: 116, height: 26, fill: '#1f2329', fontFamily: 'Arial, "PingFang SC", sans-serif', fontSize: 14, fontWeight: row === 0 ? 600 : 400, verticalAlign: 'top', editable: true, data: { kind: 'cell-label' }, text }] }
  }) }
}
async function open(page, context) {
  const modules = []
  page.on('request', request => modules.push(new URL(request.url()).pathname))
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
  const seeded = await page.evaluate(table => {
    const Model = window.demo.model.constructor
    const model = Model.initialize(crypto.randomUUID(), { version: 1, scene: { tag: 'Leafer', children: [table, { id: 'other-rect', tag: 'Rect', name: 'rect', x: 850, y: 230, width: 120, height: 80, fill: '#f0aaaa', editable: true }] } })
    const checkpoint = model.checkpoint(), original = model.getValue().scene, url = new URL('/examples/doca/', location.origin)
    url.searchParams.set('epoch', checkpoint.epochId)
    url.searchParams.set('checkpoint', btoa(String.fromCharCode(...checkpoint.update)))
    model.dispose()
    return { url: url.href, original }
  }, minimalTable())
  await page.goto(seeded.url)
  await page.waitForFunction(() => window.demo?.handle)
  const peer = await context.newPage()
  await peer.goto(seeded.url)
  await peer.waitForFunction(() => window.demo?.handle)
  expect(await scene(page)).toEqual(seeded.original)
  expect(await scene(peer)).toEqual(seeded.original)
  expect(await writes(page)).toBe(0); expect(await writes(peer)).toBe(0)
  if (process.env.CANVAS_PACKAGE_CONSUMER) {
    expect(modules.some(path => path.startsWith('/assets/') && path.endsWith('.js'))).toBe(true)
    expect(modules.some(path => path.startsWith('/src/') || path.startsWith('/__qa/'))).toBe(false)
  }
  return { peer, original: seeded.original }
}
async function cellPoint(page) {
  return page.evaluate(async () => {
    const { Leafer } = window.canvasQaEngine || await import('/__qa/canvas-engine.js')
    const app = Leafer.list.list.find(item => item.isApp), cell = app.tree.children.find(item => item.id === 'qa-table').children[0]
    const bounds = cell.getBounds('box', 'world'), point = app.tree.getClientPointByWorld(bounds)
    return { x: point.x + 25, y: point.y + 20 }
  })
}

test('minimal model table selection and unchanged inner editing never backfill layout into content', async ({ page, context }) => {
  const { peer, original } = await open(page, context)
  await page.evaluate(() => { window.demo.handle.select(['qa-table']); window.demo.handle.flush() })
  expect(await scene(page)).toEqual(original)
  const point = await cellPoint(page)
  await page.mouse.click(point.x, point.y)
  await expect(page.locator('[data-slate-editor]')).toBeFocused()
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.demo.handle.flush())
  // Native property events use a 120ms debounce; catch a delayed layout-only commit too.
  await page.waitForTimeout(180)
  expect(await scene(page)).toEqual(original)
  expect(await writes(page)).toBe(0); expect(await writes(peer)).toBe(0)
  await page.evaluate(() => { window.demo.handle.select(['other-rect']); window.demo.handle.updateSelection({ fill: '#67bb88' }); window.demo.handle.flush() })
  const changed = await scene(page)
  expect(changed.children.find(item => item.id === 'qa-table')).toEqual(original.children[0])
  expect(changed.children.find(item => item.id === 'other-rect').fill).toBe('#67bb88')
  await expect.poll(() => scene(peer)).toEqual(changed)
  expect(await writes(page)).toBe(1); expect(await writes(peer)).toBe(0)
  await peer.close()
})

test('remote minimal-table projection preserves a genuinely pending native edit and never echoes', async ({ page, context }) => {
  const { peer, original } = await open(page, context)
  // Hold the real peer's transport so delivery and the pending native mutation can
  // occur in the same browser task, before the editor's debounce timer fires.
  const packet = await peer.evaluate(() => {
    window.demo.changeConnection(false)
    window.demo.model.patch('table-cell-1-1-label', { text: 'Remote status' })
    const update = window.demo.allUpdates.at(-1)
    return { ...update, update: Array.from(update.update) }
  })
  const result = await page.evaluate(async packet => {
    const { Leafer } = window.canvasQaEngine || await import('/__qa/canvas-engine.js')
    const app = Leafer.list.list.find(item => item.isApp)
    app.tree.children.find(item => item.id === 'other-rect').set({ fill: '#8844cc' })
    const beforeDelivery = window.demo.allUpdates.length
    window.demo.model.applyUpdate({ ...packet, update: Uint8Array.from(packet.update) })
    window.demo.handle.flush()
    return { beforeDelivery, afterDelivery: window.demo.allUpdates.length }
  }, packet)
  expect(result).toEqual({ beforeDelivery: 0, afterDelivery: 1 })
  await peer.evaluate(() => window.demo.changeConnection(true))
  const expected = structuredClone(original)
  expected.children.find(item => item.id === 'other-rect').fill = '#8844cc'
  expected.children[0].children[4].children[0].text = 'Remote status'
  await expect.poll(() => scene(page)).toEqual(expected)
  await expect.poll(() => scene(peer)).toEqual(expected)
  expect(await writes(page)).toBe(1); expect(await writes(peer)).toBe(1)
  await page.evaluate(() => window.demo.handle.undo())
  const undone = structuredClone(expected)
  undone.children.find(item => item.id === 'other-rect').fill = '#f0aaaa'
  await expect.poll(() => scene(page)).toEqual(undone)
  await expect.poll(() => scene(peer)).toEqual(undone)
  expect(await writes(page)).toBe(2); expect(await writes(peer)).toBe(1)
  await peer.close()
})
