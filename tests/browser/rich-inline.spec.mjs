import { test, expect } from './fixtures.mjs'
const input = page => page.locator('[data-slate-editor]')
async function open(page) {
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.model.remove(window.demo.model.getValue().scene.children.map(n => n.id)))
}
async function seed(page, type) {
  const point = await page.evaluate(async type => {
    const { makeTable, makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts')
    const item = type === 'table' ? makeTable(340, 220, 2, 2, ['']) : makeDiagram('rounded', 340, 220, '', 320, 200)
    if (type === 'card' || type === 'note') { item.name = type; item.data = { ...item.data, kind: type }; item.children[1].verticalAlign = 'top' }
    const id = window.demo.handle.addElement(item.toJSON()).id; item.destroy(); window.demo.handle.flush()
    return { id, x: 380, y: 245 }
  }, type)
  const box = await page.locator('.canvas-host').boundingBox()
  await page.mouse.click(box.x + point.x, box.y + point.y)
  if (type === 'note') await page.mouse.click(box.x + point.x, box.y + point.y)
  await expect(input(page)).toBeFocused()
  return point.id
}
async function paste(page, text) { await input(page).evaluate((el, text) => { const data = new DataTransfer(); data.setData('text/plain', text); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })) }, text) }
for (const type of ['card', 'table', 'note']) test(`${type}: native inline mention, atomic delete/undo, clipboard and stable reload`, async ({ page }) => {
  await open(page); await seed(page, type)
  await page.keyboard.insertText('Owner @Canvas')
  await expect(page.getByRole('option', { name: 'Canvas QA' })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-rich-inline="example:person"]')).toHaveText('@Canvas QA')
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace')
  await expect(page.locator('[data-rich-inline]')).toHaveCount(0)
  await page.evaluate(() => window.demo.handle.undo())
  await expect(page.locator('[data-rich-inline]')).toHaveCount(1)
  await page.keyboard.press('End'); await paste(page, 'https://example.test/document/qa')
  await expect(page.locator('[data-rich-inline="example:reference"]')).toHaveText('Project document')
  await page.keyboard.press('ControlOrMeta+a')
  const fragment = await input(page).evaluate(element => { const data = new DataTransfer(); element.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true })); return data.getData('application/x-slate-fragment') })
  expect(fragment).toBeTruthy(); await page.keyboard.press('End')
  await input(page).evaluate((element, fragment) => { const data = new DataTransfer(); data.setData('application/x-slate-fragment', fragment); element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })) }, fragment)
  await expect(page.locator('[data-rich-inline="example:person"]')).toHaveCount(2)
  await page.evaluate(() => window.demo.handle.flush())
  const before = await page.evaluate(() => window.demo.model.getValue())
  const peer = await page.context().newPage(); await peer.goto(await page.locator('nav a').getAttribute('href')); await peer.waitForFunction(() => window.demo?.handle)
  await expect.poll(() => peer.evaluate(() => JSON.stringify(window.demo.model.getValue()))).toBe(JSON.stringify(before))
  await page.keyboard.press('Escape')
  await page.evaluate(() => { const checkpoint = window.demo.closeDocument(); window.demo.openDocument(checkpoint) })
  expect(await page.evaluate(() => window.demo.model.getValue())).toEqual(before)
})
test('pending reference paste cannot insert after readonly or editor disposal', async ({ page }) => {
  await open(page); await seed(page, 'card')
  await page.evaluate(() => { window.demo.resourceControls.holdReference = true })
  await paste(page, 'https://example.test/document/qa')
  await page.waitForFunction(() => window.demo.resourceControls.completeReference)
  await page.getByRole('button', { name: '切换只读' }).click()
  const before = await page.evaluate(() => JSON.stringify(window.demo.model.getValue()))
  await page.evaluate(() => window.demo.resourceControls.completeReference())
  await page.waitForTimeout(250)
  expect(await page.evaluate(() => JSON.stringify(window.demo.model.getValue()))).toBe(before)
})
