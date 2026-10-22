import { test, expect } from './fixtures.mjs'

const settledMenu = async page => {
  const menu = page.getByRole('menu', { name: '主菜单', exact: true })
  await expect(menu).toBeVisible()
  await menu.evaluate(async el => {
    await Promise.all(el.getAnimations({ subtree: true }).filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})))
  })
  return menu
}
const geometry = menu => menu.evaluate(el => {
  const rect = el.getBoundingClientRect(), stage = el.closest('.canvas-stage').getBoundingClientRect()
  return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, bounds: { left: Math.max(8, stage.left + 8), top: Math.max(8, stage.top + 8), right: Math.min(innerWidth - 8, stage.right - 8), bottom: Math.min(innerHeight - 8, stage.bottom - 8) } }
})
const fits = box => box.x >= box.bounds.left - .5 && box.y >= box.bounds.top - .5 && box.right <= box.bounds.right + .5 && box.bottom <= box.bounds.bottom + .5
const open = async (page, top) => {
  await page.goto('/examples/doca/?no-header')
  await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(top => {
    const app = document.querySelector('.canvas-app')
    Object.assign(app.style, { position: 'absolute', inset: `${top}px 0 0`, height: 'auto', minHeight: '0' })
  }, top)
}
for (const [width, height, top] of [[760, 720, 104], [390, 540, 146]]) test(`settled main menu stays inside ${width}x${height} embedded canvas and scrolls to its last command`, async ({ page }, info) => {
  await page.setViewportSize({ width, height }); await open(page, top)
  const before = await page.evaluate(() => ({ value: window.demo.model.getValue(), updates: window.demo.allUpdates.length }))
  await page.getByRole('button', { name: '主菜单', exact: true }).click()
  const menu = await settledMenu(page)
  await expect.poll(async () => fits(await geometry(menu))).toBe(true)
  const box = await geometry(menu); expect(box.scrollHeight).toBeGreaterThan(box.clientHeight)
  await page.keyboard.press('End')
  const help = menu.getByRole('menuitem', { name: /^帮助/ })
  await expect(help).toBeFocused()
  const visibleLast = await help.evaluate(el => { const box = el.getBoundingClientRect(), menu = el.closest('[role=menu]').getBoundingClientRect(); return box.top >= menu.top && box.bottom <= menu.bottom && el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) })
  expect(visibleLast).toBe(true)
  await page.screenshot({ path: info.outputPath(`menu-${width}x${height}-last-command.png`), animations: 'disabled' })
  await page.keyboard.press('Home'); await page.keyboard.press('Escape')
  await page.evaluate(() => window.demo.setMode('readonly'))
  await page.getByRole('button', { name: '主菜单', exact: true }).click()
  await expect.poll(async () => fits(await geometry(await settledMenu(page)))).toBe(true)
  expect(await page.evaluate(() => ({ value: window.demo.model.getValue(), updates: window.demo.allUpdates.length }))).toEqual(before)
})

test('open main menu repositions after browser resize and host scrolling without content writes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); await open(page, 104)
  const before = await page.evaluate(() => ({ value: window.demo.model.getValue(), updates: window.demo.allUpdates.length }))
  await page.getByRole('button', { name: '主菜单', exact: true }).click()
  const menu = await settledMenu(page)
  await page.setViewportSize({ width: 640, height: 440 })
  await expect.poll(async () => fits(await geometry(menu))).toBe(true)
  await page.evaluate(() => { document.body.style.height = '1400px'; document.body.style.overflow = 'auto'; window.scrollTo(0, 64) })
  await expect.poll(async () => fits(await geometry(menu))).toBe(true)
  expect(await page.evaluate(() => ({ value: window.demo.model.getValue(), updates: window.demo.allUpdates.length }))).toEqual(before)
})
