import { test, expect } from './fixtures.mjs'

const scene = page => page.evaluate(() => window.demo.model.getValue().scene)
const hardware = page => page.evaluate(async () => {
  const { Leafer } = window.canvasQaEngine || await import('/__qa/canvas-engine.js')
  const app = Leafer.list.list.find(item => item.isApp), frame = app.tree.children.find(item => item.id === 'model-phone')
  return frame.children.filter(item => String(item.data?.containerPart || '').startsWith('device-')).map(item => ({ id: item.id, role: item.data.containerPart, skipJSON: item.skipJSON }))
})
const titles = page => page.evaluate(async () => {
  const { Leafer } = window.canvasQaEngine || await import('/__qa/canvas-engine.js')
  const app = Leafer.list.list.find(item => item.isApp), frame = app.tree.children.find(item => item.id === 'model-phone')
  return frame.children.filter(item => item.name === 'frame-title').map(item => ({ text: item.text, skipJSON: item.skipJSON }))
})

for (const [type, title] of [['phone', true], ['phone', false], ['web', false], ['board', false]]) test(`model-only ${type} retains view parts across content projection and native flush (title=${title})`, async ({ page, context }, info) => {
  const hardwareCount = type === 'phone' ? 10 : 0
  const modules = []
  page.on('request', request => modules.push(new URL(request.url()).pathname))
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
  const seeded = await page.evaluate(async ({ type, title }) => {
    const CanvasModel = window.demo.model.constructor
    const children = [
      ...(title ? [{ id: 'phone-title', tag: 'Text', name: 'frame-title', text: 'Phone', x: 20, y: 14, fontSize: 18, fill: '#222222', data: { containerPart: 'title' } }] : []),
      { id: 'phone-card', tag: 'Rect', name: 'rect', x: 28, y: 140, width: 334, height: 100, fill: '#e8efff', editable: true },
      { id: 'phone-label', tag: 'Text', name: 'text', text: 'Current model content', x: 44, y: 170, fontSize: 18, fill: '#222222', editable: true },
    ]
    const value = { version: 1, scene: { tag: 'Leafer', children: [{ id: 'model-phone', tag: 'Frame', name: 'frame', x: 320, y: 80, width: type === 'phone' ? 390 : 640, height: type === 'phone' ? 844 : 400, fill: '#ffffff', stroke: '#b8bec9', strokeWidth: 1, cornerRadius: type === 'phone' ? 46 : 8, overflow: 'hide', editable: true, data: { kind: 'container', containerType: type, title: 'Phone' }, children }] } }
    const model = CanvasModel.initialize(crypto.randomUUID(), value), checkpoint = model.checkpoint()
    const url = new URL('/examples/doca/', location.origin)
    url.searchParams.set('epoch', checkpoint.epochId)
    url.searchParams.set('checkpoint', btoa(String.fromCharCode(...checkpoint.update)))
    const original = model.getValue().scene
    model.dispose()
    return { url: url.href, original }
  }, { type, title })
  await page.goto(seeded.url)
  await page.waitForFunction(() => window.demo?.handle)
  const peer = await context.newPage()
  await peer.goto(seeded.url)
  await peer.waitForFunction(() => window.demo?.handle)
  await page.waitForTimeout(400)
  expect(await scene(page)).toEqual(seeded.original)
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(0)
  expect(await page.evaluate(() => { window.demo.handle.flush(); return window.demo.allUpdates.length })).toBe(0)
  await expect.poll(async () => (await hardware(page)).length).toBe(hardwareCount)
  expect((await hardware(page)).every(item => item.skipJSON)).toBe(true)
  expect(await titles(page)).toHaveLength(1)
  if (!title) expect((await titles(page))[0].skipJSON).toBe(true)

  await page.evaluate(() => window.demo.model.patch('phone-label', { text: 'Changed current content' }))
  await expect.poll(() => scene(peer)).toEqual(await scene(page))
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(1)
  expect(await peer.evaluate(() => window.demo.allUpdates.length)).toBe(0)
  if (process.env.CANVAS_PACKAGE_CONSUMER) {
    expect(modules.some(path => path.startsWith('/assets/') && path.endsWith('.js'))).toBe(true)
    expect(modules.some(path => path.startsWith('/src/') || path.startsWith('/__qa/'))).toBe(false)
  }
  expect((await hardware(page)).length).toBe(hardwareCount)
  expect((await hardware(peer)).length).toBe(hardwareCount)
  expect((await scene(page)).children[0]).toMatchObject({ stroke: '#b8bec9', strokeWidth: 1 })
  expect((await scene(page)).children[0].children).toHaveLength(title ? 3 : 2)

  const beforeNative = await scene(page)
  await page.evaluate(() => { window.demo.handle.select(['phone-card']); window.demo.handle.updateSelection({ fill: '#b8e5c4' }); window.demo.handle.flush(); window.demo.handle.select([]) })
  const afterNative = await scene(page)
  expect(afterNative.children[0].children.find(item => item.id === 'phone-card').fill).toBe('#b8e5c4')
  expect(afterNative.children[0].children).toHaveLength(title ? 3 : 2)
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(2)
  await expect.poll(() => scene(peer)).toEqual(afterNative)
  expect(await peer.evaluate(() => window.demo.allUpdates.length)).toBe(0)
  await page.evaluate(() => window.demo.handle.undo())
  expect(await scene(page)).toEqual(beforeNative)
  await page.evaluate(() => window.demo.handle.redo())
  expect(await scene(page)).toEqual(afterNative)
  expect((await hardware(page)).length).toBe(hardwareCount)
  const updates = await page.evaluate(() => window.demo.allUpdates.length)
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await page.waitForFunction(() => window.demo?.handle)
  expect(await scene(page)).toEqual(afterNative)
  expect(await page.evaluate(() => { window.demo.handle.flush(); return window.demo.allUpdates.length })).toBe(updates)
  expect((await hardware(page)).length).toBe(hardwareCount)
  expect(await titles(page)).toHaveLength(1)
  if (!title) expect((await titles(page))[0].skipJSON).toBe(true)

  if (type === 'phone') {
    const pixels = await page.evaluate(async () => {
    const { Leafer } = window.canvasQaEngine || await import('/__qa/canvas-engine.js')
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const app = Leafer.list.list.find(item => item.isApp), host = document.querySelector('.canvas-host'), bounds = host.getBoundingClientRect()
    const points = [{ x: 326, y: 360 }, { x: 704, y: 360 }, { x: 515, y: 83 }, { x: 515, y: 919 }]
    const composite = document.createElement('canvas')
    composite.width = Math.ceil(bounds.width); composite.height = Math.ceil(bounds.height)
    const paint = composite.getContext('2d')
    for (const canvas of host.querySelectorAll('canvas')) {
      const b = canvas.getBoundingClientRect()
      if (b.width && b.height && getComputedStyle(canvas).display !== 'none') paint.drawImage(canvas, b.left - bounds.left, b.top - bounds.top, b.width, b.height)
    }
    const live = points.map(point => {
      const p = app.tree.getClientPointByWorld(app.tree.getWorldPoint(point))
      return [...paint.getImageData(Math.round(p.x - bounds.left), Math.round(p.y - bounds.top), 1, 1).data]
    })
    const svgResult = await window.demo.handle.exportFile({ format: 'svg', background: 'transparent', scale: 1 }), svg = await svgResult.blob.text()
    const xml = new DOMParser().parseFromString(svg, 'image/svg+xml'), viewBox = xml.documentElement.getAttribute('viewBox').split(/\s+/).map(Number)
    const png = await window.demo.handle.exportFile({ format: 'png', background: 'transparent', scale: 1 })
    const bitmap = await createImageBitmap(png.blob), exported = document.createElement('canvas')
    exported.width = bitmap.width; exported.height = bitmap.height
    const pngPaint = exported.getContext('2d')
    pngPaint.drawImage(bitmap, 0, 0); bitmap.close()
    const raster = points.map(p => [...pngPaint.getImageData(Math.round(p.x - viewBox[0]), Math.round(p.y - viewBox[1]), 1, 1).data])
    return { live, raster, svgBezel: svg.includes('fill-rule="evenodd"') && svg.includes('fill="#292c32"') }
  })
    for (const samples of [pixels.live, pixels.raster]) for (const [r, g, b, a] of samples) {
      expect(a).toBeGreaterThan(240)
      expect(Math.max(r, g, b)).toBeLessThan(120)
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(25)
    }
    expect(pixels.svgBezel).toBe(true)
  }
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
  expect(await peer.evaluate(() => window.demo.allUpdates.length)).toBe(0)
  await page.screenshot({ path: info.outputPath(`${type}-live-after-content-projection.png`) })
  await peer.close()
})
