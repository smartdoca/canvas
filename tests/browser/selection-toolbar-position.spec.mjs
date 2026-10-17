import { test, expect } from './fixtures.mjs'

async function open(page, viewport) {
  await page.setViewportSize(viewport)
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(async () => {
    const { makeContainer } = await import('/src/editor/runtime/thinking/containers.ts')
    const { translate } = await import('/src/i18n/translate.ts')
    window.demo.model.remove(window.demo.model.getValue().scene.children.map(item => item.id))
    const frame = makeContainer('tablet', { x: 400, y: 250, width: 500, height: 720 }, key => translate('zh', key))
    frame.id = 'toolbar-pad'
    window.demo.handle.addElement(frame.toJSON()); frame.destroy()
    window.demo.handle.select(['toolbar-pad']); window.demo.handle.flush()
  })
  await expect(page.locator('.selection-actions')).toBeVisible()
}

async function placement(page) {
  return page.evaluate(() => {
    const host = document.querySelector('.canvas-host').getBoundingClientRect()
    const bar = document.querySelector('.selection-actions').getBoundingClientRect()
    const origin = window.demo.handle.clientToScene({ x: host.x, y: host.y })
    const next = window.demo.handle.clientToScene({ x: host.x + 1, y: host.y + 1 })
    const scale = { x: 1 / (next.x - origin.x), y: 1 / (next.y - origin.y) }
    const pad = window.demo.model.getValue().scene.children.find(item => item.id === 'toolbar-pad')
    const center = host.x + (pad.x + pad.width / 2 - origin.x) * scale.x
    const top = host.y + (pad.y - origin.y) * scale.y
    return { x: bar.x + bar.width / 2 - center, y: bar.bottom - top, bar: { x: bar.x, y: bar.y, width: bar.width, height: bar.height, right: bar.right, bottom: bar.bottom }, host: { x: host.x, y: host.y, right: host.right, bottom: host.bottom } }
  })
}

async function follows(page, anchor) {
  await expect.poll(async () => {
    const actual = await placement(page)
    return Math.max(Math.abs(actual.x - anchor.x), Math.abs(actual.y - anchor.y))
  }).toBeLessThan(1)
}

async function pan(page, dx, dy, anchor) {
  // Leafer caps each wheel event's translation; use several real events to
  // carry even a large Pad and its toolbar completely beyond each edge.
  for (let step = 0; step < 8; step++) {
    const before = await page.evaluate(() => window.demo.handle.clientToScene({ x: 200, y: 200 }))
    await page.mouse.wheel(dx, dy)
    await expect.poll(() => page.evaluate(() => window.demo.handle.clientToScene({ x: 200, y: 200 }))).not.toEqual(before)
    await follows(page, anchor)
  }
}

test('Pad toolbar follows every pan direction out of the viewport and returns with its element', async ({ page }, info) => {
  await open(page, { width: 1440, height: 1000 })
  await page.waitForTimeout(200)
  const anchor = await placement(page)
  const before = await page.evaluate(() => ({ value: window.demo.model.getValue(), updates: window.demo.allUpdates.length }))
  await page.mouse.move(1200, 700)
  for (const [dx, dy, edge] of [[0, 550, 'top'], [0, -550], [1300, 0, 'left'], [-1300, 0], [0, -1100, 'bottom'], [0, 1100], [-1300, 0, 'right'], [1300, 0]]) {
    await pan(page, dx, dy, anchor)
    const actual = await placement(page)
    if (edge === 'top') expect(actual.bar.bottom).toBeLessThan(actual.host.y)
    if (edge === 'left') expect(actual.bar.right).toBeLessThan(actual.host.x)
    if (edge === 'bottom') expect(actual.bar.y).toBeGreaterThan(actual.host.bottom)
    if (edge === 'right') expect(actual.bar.x).toBeGreaterThan(actual.host.right)
    if (edge === 'top') await page.screenshot({ path: info.outputPath('pad-toolbar-panned-out.png') })
  }
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -100); await page.keyboard.up('Control')
  await expect(page.locator('.zoom-value')).not.toHaveText('100%')
  await follows(page, anchor)
  await page.evaluate(() => window.demo.handle.flush())
  expect(await page.evaluate(() => ({ value: window.demo.model.getValue(), updates: window.demo.allUpdates.length }))).toEqual(before)
  await page.screenshot({ path: info.outputPath('pad-toolbar-returned.png') })
})

test('narrow toolbar keeps its initial tool clearance and then moves with the canvas', async ({ page }) => {
  await open(page, { width: 390, height: 844 })
  await page.evaluate(() => window.demo.handle.revealElements(['toolbar-pad'], { padding: 110, maxZoom: .35 }))
  // Re-select after revealing to establish the initial placement in this viewport.
  await page.evaluate(() => { window.demo.handle.select([]); window.demo.handle.select(['toolbar-pad']) })
  const bar = page.locator('.selection-actions'), tools = page.locator('.toolbar-wrap')
  await expect.poll(async () => (await bar.boundingBox()).x - (await tools.boundingBox()).x - (await tools.boundingBox()).width).toBeGreaterThanOrEqual(8)
  expect((await bar.boundingBox()).x + (await bar.boundingBox()).width).toBeLessThanOrEqual(382)
  const anchor = await placement(page)
  await page.mouse.move(350, 650); await pan(page, 600, 0, anchor)
  expect((await placement(page)).bar.right).toBeLessThan(0)
  await pan(page, -600, 0, anchor)
})
