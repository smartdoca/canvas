import { test, expect } from './fixtures.mjs'
test.setTimeout(30000)

async function open(page) {
  await page.context().route('**/examples/doca/main.jsx', async route => {
    const response = await route.fetch()
    await route.fulfill({ response, body: (await response.text()).replaceAll('/dist/index.js', '/src/index.ts').replaceAll('/dist/model.js', '/src/model/index.ts').replaceAll('/dist/io.js', '/src/io/index.ts').replaceAll('/dist/index.css', '/src/index.css') })
  })
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => history.pushState({}, '', `${location.pathname}${location.search}${location.search ? '&' : '?'}viewport=current`))
}

const wheelCanceled = (locator, deltaX, deltaY = 0, shiftKey = false) => locator.evaluate((element, data) => {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...data })
  element.dispatchEvent(event)
  return event.defaultPrevented
}, { deltaX, deltaY, shiftKey })

test('canvas and graph overlays cancel horizontal browser gestures without trapping host scrolling', async ({ page }) => {
  await open(page)
  const url = page.url(), scene = await page.evaluate(() => window.demo.model.getValue())
  const host = page.locator('.canvas-host')
  await expect(host).toHaveCSS('overscroll-behavior-x', 'none')
  for (const deltaX of [-180, 180]) expect(await wheelCanceled(host, deltaX)).toBe(true)
  expect(await wheelCanceled(host, 0, 180, true)).toBe(true)
  await page.evaluate(async () => {
    const { makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts')
    const shape = makeDiagram('rounded', 500, 300)
    const added = window.demo.handle.addElement(shape.toJSON()); shape.destroy()
    window.demo.handle.select([added.id]); window.demo.handle.flush()
  })
  const port = page.locator('.graph-port.is-selected').first()
  await expect(port).toBeVisible()
  for (const deltaX of [-180, 180]) expect(await wheelCanceled(port, deltaX)).toBe(true)
  for (const deltaX of [-180, 180]) expect(await wheelCanceled(page.locator('.canvas-toolbar'), deltaX)).toBe(true)
  expect(await wheelCanceled(page.locator('.canvas-toolbar'), 0, 180)).toBe(false)
  expect(await wheelCanceled(page.locator('nav').first(), -180)).toBe(false)
  expect(page.url()).toBe(url)
  await page.evaluate(() => window.demo.setMode('readonly'))
  expect(await wheelCanceled(host, -180)).toBe(true)
  // Deliberate history navigation remains available.
  await page.goBack()
  await expect(page).not.toHaveURL(/viewport=current/)
  expect(await page.evaluate(() => window.demo.model.getValue().scene.children.length)).toBe(scene.scene.children.length + 1)
})

test('root scroll-chain guard is scoped to pointer presence, releases on exit and disposal; rich vertical scroll remains native', async ({ page }) => {
  await open(page)
  await page.evaluate(() => { document.documentElement.style.overscrollBehaviorX = 'contain'; document.body.style.overscrollBehaviorX = 'auto' })
  const host = page.locator('.canvas-host')
  await page.mouse.move(10, 15); await expect.poll(() => page.evaluate(() => document.documentElement.style.overscrollBehaviorX)).toBe('contain')
  await host.hover({ position: { x: 750, y: 450 } })
  await expect.poll(() => page.evaluate(() => document.documentElement.style.overscrollBehaviorX)).toBe('none')
  await page.evaluate(async () => {
    const { makeTable } = await import('/src/editor/runtime/thinking/scene.ts')
    const table = makeTable(400, 250, 3, 3, [Array.from({ length: 12 }, (_, i) => `Line ${i}`).join('\n')]); window.demo.handle.addElement(table.toJSON()); table.destroy()
  })
  await page.locator('.canvas-host').click({ position: { x: 430, y: 272 } })
  const input = page.locator('[data-slate-editor]'); await expect(input).toBeFocused()
  expect(await wheelCanceled(input, -120)).toBe(true); expect(await wheelCanceled(input, 0, 80)).toBe(false)
  const position = await page.evaluate(() => window.demo.handle.clientToScene({ x: 800, y: 450 }))
  await input.hover(); await page.mouse.wheel(0, 110)
  await expect.poll(() => input.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  expect(await page.evaluate(() => window.demo.handle.clientToScene({ x: 800, y: 450 }))).toEqual(position)
  await page.mouse.move(10, 15)
  await expect.poll(() => page.evaluate(() => document.documentElement.style.overscrollBehaviorX)).toBe('contain')
  expect(await page.evaluate(() => document.body.style.overscrollBehaviorX)).toBe('auto')
  await host.hover({ position: { x: 750, y: 450 } }); await expect.poll(() => page.evaluate(() => document.documentElement.style.overscrollBehaviorX)).toBe('none')
  await page.evaluate(() => window.demo.closeDocument())
  await expect.poll(() => page.evaluate(() => document.documentElement.style.overscrollBehaviorX)).toBe('contain')
})

test('trackpad pan and modifier zoom still update only the viewport', async ({ page }) => {
  await open(page)
  const url = page.url(), host = await page.locator('.canvas-host').boundingBox()
  const point = { x: host.x + 800, y: host.y + 450 }
  const position = () => page.evaluate(point => window.demo.handle.clientToScene(point), point)
  const before = await position(), value = await page.evaluate(() => window.demo.model.getValue())
  const updates = await page.evaluate(() => window.demo.allUpdates.length)
  await page.mouse.move(point.x, point.y)
  await page.mouse.wheel(-180, 0)
  await expect.poll(async () => (await position()).x).toBeLessThan(before.x)
  const horizontal = await position()
  await page.mouse.wheel(0, 100)
  await expect.poll(async () => (await position()).y).toBeGreaterThan(horizontal.y)
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -100); await page.keyboard.up('Control')
  await expect.poll(() => page.locator('.zoom-value').innerText()).not.toBe('100%')
  await page.evaluate(() => window.demo.handle.flush())
  expect(page.url()).toBe(url)
  expect(await page.evaluate(() => window.demo.model.getValue())).toEqual(value)
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
})
