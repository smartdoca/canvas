import { test, expect } from './fixtures.mjs'

test('canvas fills the viewport and floating chrome remains usable on desktop and mobile', async ({ page }, testInfo) => {
  await page.goto('/'); await page.locator('.canvas-view canvas').first().waitFor()
  for (const size of [{ width: 1440, height: 900 }, { width: 800, height: 640 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size)
    const app = await page.locator('.canvas-app').boundingBox(), host = await page.locator('.canvas-host').boundingBox()
    expect(app).toMatchObject({ x: 0, y: 0, width: size.width, height: size.height })
    expect(host).toMatchObject({ x: 0, y: 0, width: size.width, height: size.height })
    await expect(page.locator('.layers-panel, .layer-row')).toHaveCount(0)
    const toolbar = await page.locator('.canvas-toolbar').boundingBox()
    expect(toolbar.x).toBeGreaterThanOrEqual(0)
    expect(toolbar.x).toBeLessThan(30)
    expect(toolbar.width).toBeCloseTo(52, 2)
    expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(size.height)
    const zoom = await page.locator('.board-bottom-controls').boundingBox()
    expect(zoom.x).toBeGreaterThan(toolbar.x + toolbar.width)
    expect(zoom.x + zoom.width).toBeLessThanOrEqual(size.width)
    await page.getByRole('button', { name: '图形 (M)', exact: true }).click()
    const ellipse = page.getByRole('button', { name: '椭圆', exact: true }).locator('svg')
    const icon = await ellipse.boundingBox()
    expect(icon.width).toBeCloseTo(icon.height, 2)
    await page.keyboard.press('Escape')
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: testInfo.outputPath('full-page-canvas.png') })
})
