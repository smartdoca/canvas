import { test, expect } from './fixtures.mjs'

const scene = page => page.evaluate(() => window.demo.model.getValue().scene)
const writes = page => page.evaluate(() => window.demo.allUpdates.length)
const titleNodes = page => page.evaluate(async () => {
  const { Leafer } = window.canvasQaEngine || await import('/__qa/canvas-engine.js')
  const frame = Leafer.list.list.find(item => item.isApp).tree.children.find(item => item.id === 'projection-frame')
  return frame.children.filter(item => item.name === 'frame-title').map(item => ({ id: item.id, text: item.text, skipJSON: Boolean(item.skipJSON), editable: item.editable, hittable: item.hittable }))
})
async function titlePoint(page) {
  return page.evaluate(async () => {
    const { Leafer } = window.canvasQaEngine || await import('/__qa/canvas-engine.js')
    const app = Leafer.list.list.find(item => item.isApp), frame = app.tree.children.find(item => item.id === 'projection-frame')
    const title = frame.children.find(item => item.name === 'frame-title'), bounds = title.getBounds('box', 'world'), point = app.tree.getClientPointByWorld(bounds)
    // Hit a glyph rather than the large title layout box's empty center.
    return { x: point.x + 8, y: point.y + bounds.height / 2 }
  })
}
async function open(page, type, hardware = false) {
  const modules = []
  page.on('request', request => modules.push(new URL(request.url()).pathname))
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
  const seeded = await page.evaluate(({ type, hardware }) => {
    const Model = window.demo.model.constructor
    const children = [
      ...(hardware ? [{ id: 'projection-frame:phone:device-bar', tag: 'Rect', name: 'container-device-bar', x: 140, y: 800, width: 110, height: 5, fill: '#abcdef', opacity: .73, data: { kind: 'container-decoration', containerPart: 'device-bar', custom: 'preserve me' } }] : []),
      { id: 'projection-content', tag: 'Rect', name: 'rect', x: 28, y: 140, width: 280, height: 100, fill: '#e8efff', editable: true, data: { custom: 'ordinary content' } },
    ]
    const model = Model.initialize(crypto.randomUUID(), { version: 1, scene: { tag: 'Leafer', children: [{ id: 'projection-frame', tag: 'Frame', name: 'frame', x: 320, y: 80, width: type === 'phone' ? 390 : 640, height: type === 'phone' ? 844 : 400, fill: '#ffffff', stroke: '#b8bec9', strokeWidth: 1, editable: true, data: { kind: 'container', containerType: type, title: 'Generated title' }, children }] } })
    const checkpoint = model.checkpoint(), original = model.getValue().scene, url = new URL('/examples/doca/', location.origin)
    url.searchParams.set('epoch', checkpoint.epochId)
    url.searchParams.set('checkpoint', btoa(String.fromCharCode(...checkpoint.update)))
    model.dispose()
    return { url: url.href, original }
  }, { type, hardware })
  await page.goto(seeded.url)
  await page.waitForFunction(() => window.demo?.handle)
  await expect.poll(async () => (await titleNodes(page)).length).toBe(1)
  expect(await scene(page)).toEqual(seeded.original)
  expect(await writes(page)).toBe(0)
  if (process.env.CANVAS_PACKAGE_CONSUMER) {
    expect(modules.some(path => path.startsWith('/assets/') && path.endsWith('.js'))).toBe(true)
    expect(modules.some(path => path.startsWith('/src/') || path.startsWith('/__qa/'))).toBe(false)
  }
  return seeded.original
}

for (const type of ['phone', 'board']) {
test(`${type} view-only title cannot open text editing or write content when double-clicked`, async ({ page }) => {
  const original = await open(page, type)
  const point = await titlePoint(page)
  await page.mouse.dblclick(point.x, point.y)
  await expect(page.locator('.canvas-plain-text-editor')).toHaveCount(0)
  expect(await titleNodes(page)).toEqual([expect.objectContaining({ text: 'Generated title', skipJSON: true, editable: false, hittable: false })])
  await page.evaluate(() => window.demo.handle.flush())
  expect(await scene(page)).toEqual(original)
  expect(await writes(page)).toBe(0)
})

test(`${type} stored title replaces the view-only title and stays editable through delete/undo/redo`, async ({ page }) => {
  const original = await open(page, type)
  await page.evaluate(() => window.demo.model.add({ id: 'stored-title', tag: 'Text', name: 'frame-title', text: 'Saved title', x: 20, y: 14, width: 250, height: 24, fontSize: 18, fill: '#222222', editable: true, data: { containerPart: 'title', custom: 'saved metadata' } }, 'projection-frame'))
  expect(await titleNodes(page)).toEqual([expect.objectContaining({ id: 'stored-title', text: 'Saved title', skipJSON: false, editable: true })])
  expect(await writes(page)).toBe(1)
  const storedPoint = await titlePoint(page)
  await page.mouse.dblclick(storedPoint.x, storedPoint.y)
  const input = page.locator('.canvas-plain-text-editor')
  await expect(input).toBeFocused()
  await input.fill('Renamed title')
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.demo.handle.flush())
  expect((await scene(page)).children[0].children.find(item => item.id === 'stored-title')).toMatchObject({ text: 'Renamed title', data: { containerPart: 'title', custom: 'saved metadata' } })
  const withTitle = await scene(page), beforeDelete = await writes(page)
  await page.evaluate(() => window.demo.model.remove(['stored-title']))
  const withoutTitle = await scene(page)
  expect(withoutTitle).toEqual(original)
  expect(await titleNodes(page)).toEqual([expect.objectContaining({ text: 'Generated title', skipJSON: true, editable: false })])
  await page.evaluate(() => window.demo.handle.undo())
  expect(await scene(page)).toEqual(withTitle)
  expect(await titleNodes(page)).toEqual([expect.objectContaining({ id: 'stored-title', text: 'Renamed title', skipJSON: false, editable: true })])
  await page.evaluate(() => window.demo.handle.redo())
  expect(await scene(page)).toEqual(withoutTitle)
  expect(await titleNodes(page)).toEqual([expect.objectContaining({ text: 'Generated title', skipJSON: true, editable: false })])
  await page.evaluate(() => window.demo.handle.flush())
  expect(await writes(page)).toBe(beforeDelete + 3)
})
}

test('stored phone hardware delete/undo restores model ID and custom fields without promoting view helpers', async ({ page }) => {
  const original = await open(page, 'phone', true), id = 'projection-frame:phone:device-bar'
  await page.evaluate(id => window.demo.model.remove([id]), id)
  const afterDelete = await scene(page)
  expect(afterDelete.children[0].children.map(item => item.id)).toEqual(['projection-content'])
  const native = () => page.evaluate(async id => {
    const { Leafer } = window.canvasQaEngine || await import('/__qa/canvas-engine.js')
    const frame = Leafer.list.list.find(item => item.isApp).tree.children.find(item => item.id === 'projection-frame')
    return frame.children.filter(item => item.id === id).map(item => ({ id: item.id, skipJSON: Boolean(item.skipJSON), opacity: item.opacity, data: item.data }))
  }, id)
  expect(await native()).toEqual([expect.objectContaining({ id, skipJSON: true })])
  await page.evaluate(() => window.demo.handle.undo())
  expect(await scene(page)).toEqual(original)
  expect(await native()).toEqual([expect.objectContaining({ id, skipJSON: false, opacity: .73, data: { kind: 'container-decoration', containerPart: 'device-bar', custom: 'preserve me' } })])
  await page.evaluate(() => window.demo.handle.flush())
  expect(await writes(page)).toBe(2)
  await page.evaluate(() => window.demo.handle.redo())
  expect(await scene(page)).toEqual(afterDelete)
  expect(await native()).toEqual([expect.objectContaining({ id, skipJSON: true })])
  await page.evaluate(() => window.demo.handle.flush())
  expect(await writes(page)).toBe(3)
})
