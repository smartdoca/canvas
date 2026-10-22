import { readFileSync, writeFileSync } from 'node:fs'
import { test, expect } from './fixtures.mjs'

const generated = JSON.parse(readFileSync(new URL('./data/web-admin-explicit-title.json', import.meta.url), 'utf8'))
const state = page => page.evaluate(() => ({ scene: window.demo.model.getValue().scene,
  checkpoint: Array.from(window.demo.model.checkpoint().update), writes: window.demo.allUpdates.length }))
async function openSeed(page, search) {
  // The complete real-model fixture exceeds Node's URL/header limit. Keep the
  // same public checkpoint bootstrap in this test-only module response, without
  // putting fixture bytes in the request URL or changing the example/product.
  await page.addInitScript(value => { window.__titleSeedSearch = value }, search)
  await page.route('**/examples/doca/main.jsx', async route => {
    const response = await route.fetch(), body = (await response.text()).replace('new URLSearchParams(location.search)', 'new URLSearchParams(window.__titleSeedSearch)')
    await route.fulfill({ response, body })
  })
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
}
async function seed(page, value) {
  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
  const search = await page.evaluate(value => {
    const model = window.demo.model.constructor.initialize(crypto.randomUUID(), value), checkpoint = model.checkpoint()
    const url = new URL('/examples/doca/', location.origin)
    url.searchParams.set('epoch', checkpoint.epochId)
    url.searchParams.set('checkpoint', btoa(String.fromCharCode(...checkpoint.update)))
    model.dispose()
    return url.search
  }, value)
  await openSeed(page, search)
  return search
}
const titleEvidence = (page, id) => page.evaluate(async id => {
  const { Leafer } = window.canvasQaEngine || await import('/__qa/canvas-engine.js')
  const app = Leafer.list.list.find(item => item.isApp), frame = app.tree.children.find(item => item.id === id)
  const title = frame.children.find(item => item.name === 'frame-title')
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const host = document.querySelector('.canvas-host'), bounds = host.getBoundingClientRect()
  const live = document.createElement('canvas'); live.width = Math.ceil(bounds.width); live.height = Math.ceil(bounds.height)
  const livePaint = live.getContext('2d')
  for (const canvas of host.querySelectorAll('canvas')) {
    const b = canvas.getBoundingClientRect()
    if (b.width && b.height && getComputedStyle(canvas).display !== 'none') livePaint.drawImage(canvas, b.left - bounds.left, b.top - bounds.top, b.width, b.height)
  }
  // Only the title strip inside the clipped Frame. Borders, content and browser
  // chrome lie outside this rectangle, so model/text presence cannot pass it.
  const area = { x: frame.x + title.x, y: frame.y + title.y,
    width: Math.max(1, frame.width - title.x - 20), height: title.height }
  const from = app.tree.getClientPointByWorld(app.tree.getWorldPoint(area))
  const to = app.tree.getClientPointByWorld(app.tree.getWorldPoint({ x: area.x + area.width, y: area.y + area.height }))
  const count = (paint, x, y, width, height) => {
    const data = paint.getImageData(Math.round(x), Math.round(y), Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height))).data
    let dark = 0
    for (let i = 0; i < data.length; i += 4) if (Math.max(data[i], data[i + 1], data[i + 2]) < 140 && data[i + 3] > 200) dark++
    return dark
  }
  const livePixels = count(livePaint, from.x - bounds.left, from.y - bounds.top, to.x - from.x, to.y - from.y)
  const png = await window.demo.handle.exportFile({ format: 'png', background: 'transparent' })
  const svg = await window.demo.handle.exportFile({ format: 'svg', background: 'transparent' }), source = await svg.blob.text()
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml'), box = doc.documentElement.getAttribute('viewBox').split(/[ ,]+/).map(Number)
  const paintBlob = async blob => {
    const url = URL.createObjectURL(blob), image = new Image()
    try {
      image.src = url; await image.decode()
      const surface = document.createElement('canvas'); surface.width = image.naturalWidth; surface.height = image.naturalHeight
      const paint = surface.getContext('2d'); paint.drawImage(image, 0, 0)
      return count(paint, area.x - box[0], area.y - box[1], area.width, area.height)
    } finally { URL.revokeObjectURL(url) }
  }
  return { title: { x: title.x, width: title.width, text: title.text, textAlign: title.textAlign }, frame: { width: frame.width, height: frame.height },
    area, livePixels, pngPixels: await paintBlob(png.blob), svgPixels: await paintBlob(svg.blob), svgHasTitle: source.includes(title.text) }
}, id)
function visible(evidence) {
  expect(evidence.livePixels, JSON.stringify(evidence)).toBeGreaterThan(40)
  expect(evidence.pngPixels, JSON.stringify(evidence)).toBeGreaterThan(40)
  expect(evidence.svgPixels, JSON.stringify(evidence)).toBeGreaterThan(40)
  expect(evidence.svgHasTitle).toBe(true)
  expect(evidence.title.x + evidence.title.width).toBeLessThanOrEqual(evidence.frame.width - 20)
}

test('generated explicit right-aligned Web title is actually painted in live/PNG/SVG, preserves its model and survives native resize/peer/reopen', async ({ page, context }, info) => {
  const search = await seed(page, generated), baseline = await state(page)
  const peer = await context.newPage(); await peer.setViewportSize({ width: 2200, height: 1200 }); await openSeed(peer, search)
  const initial = await titleEvidence(page, 'browser-admin')
  writeFileSync(info.outputPath('initial-title-evidence.json'), JSON.stringify(initial, null, 2))
  await page.screenshot({ path: info.outputPath('explicit-title-before-resize.png') })
  visible(initial)
  expect(initial.title).toMatchObject({ x: 900, width: 360, text: '合成管理台', textAlign: 'right' })
  await page.evaluate(() => window.demo.handle.flush())
  expect(await state(page)).toEqual(baseline)
  expect((await state(peer)).writes).toBe(0)
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await page.waitForFunction(() => window.demo?.handle)
  visible(await titleEvidence(page, 'browser-admin'))
  expect(await state(page)).toEqual(baseline)
  await page.evaluate(() => window.demo.handle.select(['browser-admin']))
  const corner = await page.evaluate(async () => {
    const { Leafer } = window.canvasQaEngine || await import('/__qa/canvas-engine.js')
    const app = Leafer.list.list.find(item => item.isApp), frame = app.tree.children.find(item => item.id === 'browser-admin')
    const p = app.tree.getClientPointByWorld(app.tree.getWorldPoint({ x: frame.x + frame.width, y: frame.y + frame.height }))
    return { x: p.x, y: p.y }
  })
  await page.mouse.move(corner.x, corner.y); await page.mouse.down()
  await page.mouse.move(corner.x + 120, corner.y + 75, { steps: 10 }); await page.mouse.up()
  await page.evaluate(() => { window.demo.handle.flush(); window.demo.handle.select([]) })
  const edited = await state(page), frame = edited.scene.children.find(item => item.id === 'browser-admin')
  expect(frame.width).toBeGreaterThan(1280)
  const storedTitle = frame.children.find(item => item.name === 'frame-title')
  expect(storedTitle.x).toBe(900)
  await expect.poll(async () => (await state(peer)).scene).toEqual(edited.scene)
  expect((await state(peer)).writes).toBe(0)
  const resized = await titleEvidence(page, 'browser-admin'); visible(resized)
  visible(await titleEvidence(peer, 'browser-admin'))
  expect(await state(page)).toEqual(edited)
  await page.evaluate(() => window.demo.handle.undo())
  expect((await state(page)).scene).toEqual(baseline.scene)
  await page.evaluate(() => window.demo.handle.redo())
  expect((await state(page)).scene).toEqual(edited.scene)
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await page.waitForFunction(() => window.demo?.handle)
  const reopened = await state(page); visible(await titleEvidence(page, 'browser-admin'))
  await page.evaluate(() => window.demo.handle.flush())
  expect(await state(page)).toEqual(reopened)
  expect(reopened.scene).toEqual(edited.scene)
  writeFileSync(info.outputPath('resized-title-evidence.json'), JSON.stringify(resized, null, 2))
  await page.screenshot({ path: info.outputPath('explicit-title-after-resize.png') })
})

test('the existing x20 container title keeps its original 20px right inset without opening or export writes', async ({ page }, info) => {
  await seed(page, { version: 1, scene: { tag: 'Leafer', children: [{ id: 'default-web', tag: 'Frame', name: 'frame', x: 320, y: 80,
    width: 640, height: 400, fill: '#ffffff', stroke: '#b8bec9', strokeWidth: 1, overflow: 'hide', editable: true,
    data: { kind: 'container', containerType: 'web', title: 'Default Web' }, children: [{ id: 'default-title', tag: 'Text', name: 'frame-title',
      x: 20, y: 14, width: 600, height: 24, text: 'Default Web', textAlign: 'right', fontSize: 14, fill: '#374151', data: { containerPart: 'title' } }] }] } })
  const baseline = await state(page), evidence = await titleEvidence(page, 'default-web')
  visible(evidence); expect(evidence.title).toMatchObject({ x: 20, width: 600 })
  await page.evaluate(() => window.demo.handle.flush()); expect(await state(page)).toEqual(baseline)
  writeFileSync(info.outputPath('default-title-evidence.json'), JSON.stringify(evidence, null, 2))
})
