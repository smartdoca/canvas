import { test, expect } from './fixtures.mjs'
test.setTimeout(45000)

const scene = page => page.evaluate(() => window.demo.model.getValue().scene.children)
const frame = async page => (await scene(page)).find(node => node.name === 'frame')
async function open(page) {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  await clear(page)
}
async function clear(page) { await page.evaluate(() => { window.demo.handle.select([]); window.demo.model.remove(window.demo.model.getValue().scene.children.map(node => node.id)) }) }
async function pick(page, name) { await page.getByRole('button', { name: '分区 (F)', exact: true }).click(); await page.getByRole('menuitem', { name, exact: true }).click() }
async function drag(page, a, b) { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 12 }); await page.mouse.up(); await page.evaluate(() => window.demo.handle.flush()) }
async function resize(page, id, edge, dx, dy) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const b = await page.evaluate(id => { window.demo.handle.select([id]); return window.demo.handle.revealElements([id], { maxZoom: .65, padding: 90 }).bounds }, id)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const host = await page.locator('.canvas-host').boundingBox(), p = { x: host.x + b.x + b.width, y: host.y + b.y + b.height * (edge === 'side' ? .3 : 1) }
  await drag(page, p, { x: p.x + dx, y: p.y + dy })
}

test('device and print presets keep their ratios during creation in every drag direction', async ({ page }) => {
  await open(page)
  const presets = [['Phone', 390 / 844], ['Pad', 820 / 1180], ['Web', 1280 / 800], ['Watch', 198 / 242], ['16:9', 16 / 9], ['4:3', 4 / 3], ['3:4', 3 / 4], ['1:1', 1], ['A4', 595 / 842], ['演示文稿', 16 / 9]]
  for (let i = 0; i < presets.length; i++) {
    await clear(page); await pick(page, presets[i][0])
    const host = await page.locator('.canvas-host').boundingBox(), start = { x: host.x + 700, y: host.y + 480 }, end = { x: start.x + (i % 2 ? -210 : 210), y: start.y + (i % 4 < 2 ? 130 : -130) }
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 10 })
    const preview = page.locator('.thinking-insert-preview rect').first()
    expect(Number(await preview.getAttribute('width')) / Number(await preview.getAttribute('height'))).toBeCloseTo(presets[i][1], 5)
    await page.mouse.up()
    await expect.poll(async () => Boolean(await frame(page))).toBe(true)
    const item = await frame(page); expect(item.width / item.height).toBeCloseTo(presets[i][1], 5); expect(item.lockRatio).toBe(true)
  }
})

test('corner and edge resizing preserve phone and fixed ratios, including restored phones; boards stay free', async ({ page }) => {
  await open(page)
  for (const [name, ratio] of [['Phone', 390 / 844], ['16:9', 16 / 9], ['A4', 595 / 842]]) {
    await clear(page); await pick(page, name); await page.mouse.click(750, 490)
    await expect.poll(async () => Boolean(await frame(page))).toBe(true)
    const item = await frame(page), before = item.width
    await resize(page, item.id, 'corner', 80, 25)
    await expect.poll(async () => (await frame(page)).width).not.toBe(before)
    expect((await frame(page)).width / (await frame(page)).height).toBeCloseTo(ratio, 4)
    const sideWidth = (await frame(page)).width
    await resize(page, item.id, 'side', -40, 0)
    await expect.poll(async () => (await frame(page)).width).not.toBe(sideWidth)
    expect((await frame(page)).width / (await frame(page)).height).toBeCloseTo(ratio, 4)
  }
  await clear(page)
  const id = await page.evaluate(() => window.demo.handle.addElement({ id: 'old-phone', tag: 'Frame', name: 'frame', x: 500, y: 90, width: 390, height: 844, lockRatio: false, data: { kind: 'container', containerType: 'phone' }, children: [] }).id)
  await resize(page, id, 'side', 70, 0)
  expect((await frame(page)).width / (await frame(page)).height).toBeCloseTo(390 / 844, 4)
  await clear(page); await pick(page, '画板'); await page.mouse.click(750, 490)
  await expect.poll(async () => Boolean(await frame(page))).toBe(true)
  const board = await frame(page); await resize(page, board.id, 'side', 70, 0)
  expect((await frame(page)).height).toBeCloseTo(board.height, 3); expect((await frame(page)).width).not.toBe(board.width)
})

test('toolbar dropdowns show selected choices, support keyboard and cancel without changing the selection', async ({ page }, info) => {
  await open(page); await pick(page, 'Phone'); await page.mouse.click(750, 490)
  await expect.poll(async () => Boolean(await frame(page))).toBe(true)
  const id = (await frame(page)).id, bar = page.locator('.selection-actions'), font = bar.getByRole('combobox', { name: '字体大小', exact: true })
  await expect(bar.locator('select')).toHaveCount(0)
  await font.click(); await expect(page.getByRole('option', { name: '14', exact: true })).toHaveAttribute('aria-selected', 'true')
  const updates = await page.evaluate(() => window.demo.allUpdates.length)
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
  await font.click(); await page.getByRole('option', { name: '24', exact: true }).click()
  expect((await frame(page)).children.find(c => c.name === 'frame-title').fontSize).toBe(24)
  expect(await page.evaluate(() => window.demo.handle.getSelection().map(n => n.id))).toEqual([id])
  await font.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('End'); await page.keyboard.press('Enter')
  expect((await frame(page)).children.find(c => c.name === 'frame-title').fontSize).toBe(48)
  await bar.getByRole('combobox', { name: '线宽', exact: true }).click(); await page.getByRole('option', { name: '3', exact: true }).click()
  expect((await frame(page)).strokeWidth).toBe(3)
  await font.click(); await page.screenshot({ path: info.outputPath('toolbar-font-dropdown.png') })
  const menu = await page.getByRole('listbox').boundingBox(); expect(menu.y).toBeGreaterThanOrEqual(8); expect(menu.x).toBeGreaterThanOrEqual(8)
  await page.keyboard.press('Escape'); await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(id => { window.demo.handle.select([id]); window.demo.handle.revealElements([id], { padding: 90 }) }, id)
  await font.click()
  const mobile = await page.getByRole('listbox').boundingBox(); expect(mobile.x + mobile.width).toBeLessThanOrEqual(382); expect(mobile.y + mobile.height).toBeLessThanOrEqual(836)
})
