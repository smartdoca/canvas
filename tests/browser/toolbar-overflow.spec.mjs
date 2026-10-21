import { test, expect } from '@playwright/test'

// The same host harness runs from current source or an installed production tarball.
test.beforeEach(async ({ page }) => {
  page.toolbarErrors = []
  page.toolbarModules = []
  page.on('pageerror', error => page.toolbarErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') page.toolbarErrors.push(message.text()) })
  page.on('request', request => page.toolbarModules.push(new URL(request.url()).pathname))
})
test.afterEach(async ({ page }) => {
  await page.close()
  expect(page.toolbarErrors).toEqual([])
})

async function open(page, viewport) {
  await page.setViewportSize(viewport)
  await page.goto('/examples/doca/?no-header')
  await page.waitForFunction(() => window.demo?.handle)
  if (process.env.CANVAS_PACKAGE_CONSUMER) {
    expect(page.toolbarModules.some(path => path.startsWith('/assets/') && path.endsWith('.js'))).toBe(true)
    expect(page.toolbarModules.some(path => path.startsWith('/src/'))).toBe(false)
  }
  return page.evaluate(() => ({ scene: window.demo.model.getValue().scene, writes: window.demo.allUpdates.length }))
}
const unchanged = async (page, before) => expect(await page.evaluate(() => ({ scene: window.demo.model.getValue().scene, writes: window.demo.allUpdates.length }))).toEqual(before)
const selectable = page => page.locator('.canvas-toolbar').getByRole('button', { name: '选择 (V / 1)', exact: true })
async function hit(locator) {
  await expect.poll(() => locator.evaluate(element => {
    const b = element.getBoundingClientRect()
    return b.width > 0 && b.height > 0 && element.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2))
  })).toBe(true)
}
async function fitted(page, menu) {
  await expect(menu).toBeVisible()
  await expect.poll(async () => {
    const b = await menu.boundingBox(), stage = await page.locator('.canvas-stage').boundingBox(), viewport = page.viewportSize()
    return b.x >= Math.max(0, stage.x) && b.y >= Math.max(0, stage.y) && b.x + b.width <= Math.min(viewport.width, stage.x + stage.width) + 1 && b.y + b.height <= Math.min(viewport.height, stage.y + stage.height) + 1
  }).toBe(true)
}
async function tool(page, name) {
  const button = page.locator('.canvas-toolbar').getByRole('button', { name, exact: true })
  await button.scrollIntoViewIfNeeded()
  await button.click()
  const menu = page.getByRole('menu', { name, exact: true })
  await fitted(page, menu)
  return menu
}

test('short desktop canvas scrolls tools while selection and escaped flyouts remain usable', async ({ page }, info) => {
  const before = await open(page, { width: 1280, height: 480 })
  const list = page.locator('.board-tool-list'), select = selectable(page)
  expect(await list.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  await hit(select)
  const selectBefore = await select.boundingBox()
  await list.hover(); await page.mouse.wheel(0, 480)
  await expect.poll(() => list.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  await hit(select)
  const selectAfter = await select.boundingBox()
  expect(selectAfter.y).toBeCloseTo(selectBefore.y, 1)
  expect(selectAfter.height).toBeCloseTo(selectBefore.height, 1)

  const containers = await tool(page, '分区 (F)')
  const matrix = containers.getByRole('menuitem', { name: '矩阵', exact: true })
  await matrix.scrollIntoViewIfNeeded()
  await fitted(page, containers); await hit(matrix)
  await page.screenshot({ path: info.outputPath('short-canvas-container-menu.png'), animations: 'disabled' })
  await matrix.click()
  await expect(page.locator('.canvas-stage')).toHaveAttribute('data-active-tool', 'container:matrix')

  const tables = await tool(page, '表格'), size = tables.getByRole('button', { name: '2 × 3', exact: true })
  await hit(size); await size.click()
  await expect(page.locator('.canvas-stage')).toHaveAttribute('data-active-tool', 'table:2:3')
  await select.click(); await expect(page.locator('.canvas-stage')).toHaveAttribute('data-active-tool', 'init')
  await unchanged(page, before)
})

test('open flyout follows toolbar scrolling and fits a resized embedded canvas and viewport', async ({ page }) => {
  const before = await open(page, { width: 1280, height: 480 })
  const table = await tool(page, '表格'), list = page.locator('.board-tool-list')
  const tableBefore = await table.boundingBox()
  // Scrolling an already open group must reposition it without requiring hover again.
  await list.evaluate(element => { element.scrollTop += 140 })
  await expect.poll(async () => (await table.boundingBox()).y).toBeLessThan(tableBefore.y - 20)
  await fitted(page, table)
  const menu = await tool(page, '分区 (F)'), button = page.locator('[data-tool=section] > button')
  const first = await menu.boundingBox()
  // A layout change without a window resize must also recompute the flyout bounds.
  await page.locator('.canvas-app').evaluate(element => {
    Object.assign(element.parentElement.style, { flex: 'none', height: '330px', width: '700px' })
  })
  await fitted(page, menu)
  await expect.poll(async () => (await menu.boundingBox()).height).toBeLessThan(first.height)
  await page.setViewportSize({ width: 820, height: 430 })
  await fitted(page, menu)
  const tile = menu.getByRole('menuitem', { name: '矩阵', exact: true })
  await tile.scrollIntoViewIfNeeded(); await hit(tile); await tile.click()
  await expect(page.locator('.canvas-stage')).toHaveAttribute('data-active-tool', 'container:matrix')
  await selectable(page).click()
  await button.scrollIntoViewIfNeeded(); await button.click()
  await expect(menu).toBeVisible(); await page.keyboard.press('Escape'); await expect(menu).toBeHidden()
  await unchanged(page, before)
})

test('390 by 420 expanded toolbar keeps 40px controls and selectable mobile flyouts', async ({ page }, info) => {
  const before = await open(page, { width: 390, height: 420 })
  const expand = page.getByRole('button', { name: '展开更多工具', exact: true })
  await hit(expand); await expand.click()
  await expect(expand).toHaveAttribute('aria-expanded', 'true')
  const list = page.locator('.board-tool-list')
  expect(await list.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  for (const button of [expand, selectable(page), page.locator('[data-tool=section] > button')]) {
    const b = await button.boundingBox()
    expect(b.width).toBeGreaterThanOrEqual(40); expect(b.height).toBeGreaterThanOrEqual(40)
  }
  const containers = await tool(page, '分区 (F)'), matrix = containers.getByRole('menuitem', { name: '矩阵', exact: true })
  await matrix.scrollIntoViewIfNeeded(); await hit(matrix); await matrix.click()
  await expect(page.locator('.canvas-stage')).toHaveAttribute('data-active-tool', 'container:matrix')
  const tables = await tool(page, '表格'), size = tables.getByRole('button', { name: '2 × 3', exact: true })
  await hit(size)
  await page.screenshot({ path: info.outputPath('mobile-short-canvas-table-menu.png'), animations: 'disabled' })
  await size.click(); await expect(page.locator('.canvas-stage')).toHaveAttribute('data-active-tool', 'table:2:3')
  await hit(selectable(page)); await selectable(page).click()
  await unchanged(page, before)
})
