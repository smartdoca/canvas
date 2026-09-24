import { test, expect } from './fixtures.mjs'

test('standalone demo fills viewport after resize, no layers sidebar, circle icons keep square geometry', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/'); await page.locator('.canvas-view canvas').first().waitFor()
  for (const size of [{ width: 1440, height: 900 }, { width: 800, height: 640 }]) {
    await page.setViewportSize(size)
    const app = await page.locator('.canvas-app').boundingBox(), host = await page.locator('.canvas-host').boundingBox()
    expect(app.x).toBe(0); expect(app.y).toBe(0)
    expect(app.width).toBe(size.width); expect(app.height).toBe(size.height)
    expect(host.width).toBe(size.width); expect(host.height).toBe(size.height - 48 - 42)
    await expect(page.locator('.layers-panel, .layer-row')).toHaveCount(0)
    const icon = await page.getByRole('button', { name: '椭圆 (O)', exact: true }).locator('svg').boundingBox()
    expect(icon.width).toBe(16); expect(icon.height).toBe(16)
    const circle = await page.getByRole('button', { name: '椭圆 (O)', exact: true }).locator('circle').evaluate(e => { const b = e.getBBox(); return { width: b.width, height: b.height } })
    expect(circle.width).toBe(circle.height)
  }
  const circleIcon = await page.getByRole('button', { name: '圆形', exact: true }).locator('svg').boundingBox()
  expect(circleIcon.width).toBeCloseTo(circleIcon.height, 2)
  await page.setViewportSize({ width: 520, height: 640 })
  await expect(page.locator('.toolbar-tools > [data-tool-key="circle"]')).toHaveCount(0)
  await expect(page.locator('.toolbar-more-menu [aria-label="圆形"]')).toHaveCount(1)
  await page.getByRole('button', { name: '更多工具', exact: true }).hover()
  const overflowCircle = await page.getByRole('button', { name: '圆形', exact: true }).locator('svg').boundingBox()
  expect(overflowCircle.width).toBeCloseTo(overflowCircle.height, 2)
  await page.mouse.move(0, 0)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: testInfo.outputPath('full-page-canvas.png') })
})
