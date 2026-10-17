import { test, expect } from './fixtures.mjs'

const rect = (id, x, y, width = 100, height = 60, extra = {}) => ({ id, tag: 'Rect', name: 'rect', x, y, width, height, fill: '#eaf1ff', stroke: '#3370ff', editable: true, ...extra })
const scene = page => page.evaluate(() => window.demo.handle.getValue().scene.children)
const guides = page => page.locator('.canvas-alignment-guides line')
async function open(page, children) {
  await page.route('**/examples/doca/main.jsx', async route => {
    const response = await route.fetch()
    await route.fulfill({ response, body: (await response.text()).replaceAll('/dist/index.js', '/src/index.ts').replaceAll('/dist/model.js', '/src/model/index.ts').replaceAll('/dist/io.js', '/src/io/index.ts').replaceAll('/dist/index.css', '/src/index.css') })
  })
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(children => {
    const { model, handle } = window.demo
    model.remove(model.getValue().scene.children.map(item => item.id))
    children.forEach(item => handle.addElement(item))
    handle.flush(); handle.select([])
  }, children)
  await expect(page.locator('.canvas-alignment-guides')).toHaveCount(1)
  // Leafer schedules its layout, canvas paint and hit-test data on animation frames.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}
async function startDrag(page, start, end) {
  const host = await page.locator('.canvas-host').boundingBox()
  await page.mouse.move(host.x + start.x, host.y + start.y)
  await page.mouse.down()
  await page.mouse.move(host.x + end.x, host.y + end.y, { steps: 12 })
}
async function finishDrag(page) {
  await page.mouse.up()
  await expect(guides(page)).toHaveCount(0)
  await page.evaluate(() => window.demo.handle.flush())
}

test('dragging snaps left, center, right, top, middle and bottom with transient guides', async ({ page }, info) => {
  await open(page, [rect('reference', 300, 180, 160, 100), rect('moving', 600, 380)])
  await page.screenshot({ path: info.outputPath('before-alignment.png') })
  const cases = [
    { axis: 'x', x: 300, y: 344, position: 300 },
    { axis: 'x', x: 330, y: 344, position: 380 },
    { axis: 'x', x: 360, y: 344, position: 460 },
    { axis: 'y', x: 620, y: 180, position: 180 },
    { axis: 'y', x: 620, y: 200, position: 230 },
    { axis: 'y', x: 620, y: 220, position: 280 },
  ]
  for (const [index, item] of cases.entries()) {
    await page.evaluate(() => { window.demo.model.patch('moving', { x: 600, y: 380 }); window.demo.handle.select([]) })
    await startDrag(page, { x: 650, y: 410 }, { x: item.x + 54, y: item.y + 34 })
    const line = page.locator(`.canvas-alignment-guides line[data-axis="${item.axis}"]`)
    await expect(line).toHaveCount(1)
    await expect(line).toHaveAttribute(item.axis === 'x' ? 'x1' : 'y1', String(item.position))
    const moving = (await scene(page)).find(node => node.id === 'moving')
    expect(moving[item.axis]).toBeCloseTo(item[item.axis], 4)
    if (index === 0) await page.screenshot({ path: info.outputPath('during-alignment.png') })
    await finishDrag(page)
    const persisted = await page.evaluate(() => window.demo.model.getValue().scene.children)
    expect(persisted).toHaveLength(2)
    expect(persisted.find(node => node.id === 'moving')[item.axis]).toBeCloseTo(item[item.axis], 4)
  }
  await page.screenshot({ path: info.outputPath('after-alignment.png') })
  await page.evaluate(() => window.demo.handle.undo())
  expect((await scene(page)).find(node => node.id === 'moving').y).toBe(380)
})

test('snap tolerance stays at six screen pixels with zoom and pan; dragging can leave a snap', async ({ page }) => {
  await open(page, [rect('reference', 300, 180, 160, 100), rect('moving', 600, 380)])
  const viewport = await page.evaluate(() => window.demo.handle.revealElements(['reference', 'moving'], { padding: 100, maxZoom: .5 }))
  await expect(page.locator('.zoom-value')).toHaveText('50%')
  const offset = { x: viewport.bounds.x - 150, y: viewport.bounds.y - 90 }
  const point = (x, y) => ({ x: offset.x + x * .5, y: offset.y + y * .5 })
  await startDrag(page, point(650, 410), point(360, 364))
  await expect(guides(page)).toHaveCount(1)
  expect((await scene(page)).find(node => node.id === 'moving').x).toBeCloseTo(300, 4)
  const host = await page.locator('.canvas-host').boundingBox(), end = point(366, 364)
  await page.mouse.move(host.x + end.x, host.y + end.y)
  await expect(guides(page)).toHaveCount(0)
  expect((await scene(page)).find(node => node.id === 'moving').x).toBeCloseTo(316, 4)
  await finishDrag(page)
})

test('multi-selection snaps as one box while preserving spacing', async ({ page }) => {
  await open(page, [rect('reference', 300, 180), rect('first', 600, 340, 80), rect('second', 720, 440, 80)])
  await page.evaluate(() => window.demo.handle.select(['first', 'second']))
  await startDrag(page, { x: 640, y: 370 }, { x: 344, y: 384 })
  await expect(page.locator('.canvas-alignment-guides line[data-axis="x"][x1="300"]')).toHaveCount(1)
  const nodes = await scene(page), first = nodes.find(node => node.id === 'first'), second = nodes.find(node => node.id === 'second')
  expect(first.x).toBeCloseTo(300, 4)
  expect(second.x - first.x).toBeCloseTo(120, 4)
  expect(second.y - first.y).toBeCloseTo(100, 4)
  await finishDrag(page)
})

test('hidden elements, object labels and the moving group children do not attract a drag', async ({ page }) => {
  await open(page, [
    rect('hidden', 300, 180, 160, 100, { visible: false }),
    { id: 'note', tag: 'Frame', name: 'note', x: 140, y: 100, width: 100, height: 80, editable: true, fill: '#fff2a8', data: { kind: 'note' }, children: [{ id: 'label', tag: 'Text', x: 10, y: 10, width: 80, height: 60, text: '内部文字', editable: true }] },
    { id: 'group', tag: 'Group', name: 'group', x: 600, y: 380, editable: true, hitChildren: false, children: [rect('child', 0, 0)] },
  ])
  await page.evaluate(() => window.demo.handle.select(['group']))
  await startDrag(page, { x: 650, y: 410 }, { x: 354, y: 374 })
  await expect(guides(page)).toHaveCount(0)
  expect((await scene(page)).find(node => node.id === 'group').x).toBeCloseTo(304, 4)
  await finishDrag(page)
  // Only a label has x=150; its enclosing note has x=140/190/240.
  await startDrag(page, { x: 354, y: 374 }, { x: 204, y: 384 })
  await expect(guides(page)).toHaveCount(0)
  expect((await scene(page)).find(node => node.id === 'group').x).toBeCloseTo(154, 4)
  await finishDrag(page)
  await startDrag(page, { x: 204, y: 384 }, { x: 208, y: 388 })
  await expect(guides(page)).toHaveCount(0)
  expect((await scene(page)).find(node => node.id === 'group').x).toBeCloseTo(158, 4)
  await finishDrag(page)
})

test('both axes align together and guides clear on pointer cancellation or loss of focus', async ({ page }) => {
  await open(page, [rect('reference', 300, 180, 160, 100), rect('moving', 600, 380)])
  await startDrag(page, { x: 650, y: 410 }, { x: 384, y: 234 })
  await expect(guides(page)).toHaveCount(2)
  expect((await scene(page)).find(node => node.id === 'moving')).toMatchObject({ x: 330, y: 200 })
  await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })))
  await expect(guides(page)).toHaveCount(0)
  await finishDrag(page)
  await page.evaluate(() => { window.demo.model.patch('moving', { x: 600, y: 380 }); window.demo.handle.select([]) })
  await startDrag(page, { x: 650, y: 410 }, { x: 384, y: 234 })
  await expect(guides(page)).toHaveCount(2)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(guides(page)).toHaveCount(0)
  await finishDrag(page)
})

test('nested transforms, Shift locking, cancellation, keyboard movement and readonly retain their behavior', async ({ page }) => {
  await open(page, [rect('reference', 300, 180, 160, 100), { id: 'parent', tag: 'Group', x: 500, y: 300, scaleX: 1.5, scaleY: 1.5, editable: true, children: [rect('nested', 20, 20, 80)] }])
  await page.evaluate(() => window.demo.handle.select(['nested']))
  await startDrag(page, { x: 590, y: 375 }, { x: 364, y: 389 })
  await expect(guides(page)).toHaveCount(1)
  expect((await scene(page)).find(node => node.id === 'parent').children[0].x).toBeCloseTo(-200 / 1.5, 4)
  await page.keyboard.press('Escape')
  await expect(guides(page)).toHaveCount(0)
  await finishDrag(page)
  await page.evaluate(() => { window.demo.model.patch('nested', { x: 20, y: 20 }); window.demo.handle.select(['nested']) })
  await page.keyboard.down('Shift')
  await startDrag(page, { x: 590, y: 375 }, { x: 364, y: 384 })
  expect((await scene(page)).find(node => node.id === 'parent').children[0].y).toBeCloseTo(20, 4)
  await page.keyboard.up('Shift')
  await finishDrag(page)
  await page.locator('.canvas-app').focus()
  const before = (await scene(page)).find(node => node.id === 'parent').children[0].x
  await page.keyboard.press('ArrowRight')
  await expect(guides(page)).toHaveCount(0)
  expect((await scene(page)).find(node => node.id === 'parent').children[0].x).toBeGreaterThan(before)
  await page.evaluate(() => window.demo.setMode('readonly'))
  await expect(page.locator('.canvas-alignment-guides')).toHaveCount(0)
})
