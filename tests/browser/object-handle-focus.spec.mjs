import { readFileSync, writeFileSync } from 'node:fs'
import { test, expect } from './fixtures.mjs'

const nodes = JSON.parse(readFileSync(new URL('./data/keyboard-current-nodes.json', import.meta.url), 'utf8'))
const state = page => page.evaluate(() => ({ scene: window.demo.model.getValue().scene, writes: window.demo.allUpdates.length }))
const focus = page => page.evaluate(() => ({ tag: document.activeElement.tagName, label: document.activeElement.getAttribute('aria-label'), canvas: document.activeElement.classList.contains('canvas-app'), hasFocus: document.hasFocus() }))
async function seed(page, type = 'table') {
  await page.setViewportSize({ width: 1600, height: 1100 })
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  const item = structuredClone(type === 'table' ? nodes.table : nodes.note)
  item.x = 420; item.y = 320
  if (type === 'card') { item.name = 'card'; item.data.kind = 'card' }
  const url = await page.evaluate(item => {
    const model = window.demo.model.constructor.initialize(crypto.randomUUID(), { version: 1, scene: { tag: 'Leafer', children: [item] } })
    const checkpoint = model.checkpoint(), url = new URL('/examples/doca/', location.origin)
    url.searchParams.set('epoch', checkpoint.epochId); url.searchParams.set('checkpoint', btoa(String.fromCharCode(...checkpoint.update))); model.dispose(); return url.href
  }, item)
  await page.goto(url); await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(id => window.demo.handle.select([id]), item.id)
  return { item, url }
}
async function startDrag(page, handle) {
  const b = await handle.boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2 + 80, b.y + b.height / 2 + 50, { steps: 10 })
}

for (const type of ['table', 'card']) test(`${type}: zoom button then real handle drag restores keyboard undo/redo, peer convergence and reopen`, async ({ page, context }, info) => {
  const { url } = await seed(page, type), peer = await context.newPage()
  await peer.goto(url); await peer.waitForFunction(() => window.demo?.handle); await page.bringToFront()
  await page.getByRole('button', { name: '缩小', exact: true }).click()
  await expect(page.getByRole('button', { name: '缩小', exact: true })).toBeFocused()
  const before = await state(page)
  await startDrag(page, page.locator('.rich-object-move-handle')); await page.mouse.up()
  await expect.poll(async () => (await state(page)).writes).toBe(before.writes + 1)
  const moved = await state(page), afterDragFocus = await focus(page)
  expect(moved.scene).not.toEqual(before.scene)
  await expect.poll(async () => (await state(peer)).scene).toEqual(moved.scene); expect((await state(peer)).writes).toBe(0)
  await page.keyboard.press('ControlOrMeta+z')
  writeFileSync(info.outputPath('keyboard-focus.json'), JSON.stringify({ before, moved, afterDragFocus, afterUndo: await state(page), afterUndoFocus: await focus(page) }, null, 2))
  await expect.poll(async () => (await state(page)).scene).toEqual(before.scene)
  expect(afterDragFocus).toMatchObject({ tag: 'DIV', canvas: true, hasFocus: true })
  await page.keyboard.press('ControlOrMeta+Shift+z'); await expect.poll(async () => (await state(page)).scene).toEqual(moved.scene)
  await expect.poll(async () => (await state(peer)).scene).toEqual(moved.scene); expect((await state(peer)).writes).toBe(0)
  const ready = await page.evaluate(() => { const ready = window.demo.readyCount, reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint); return ready })
  await page.waitForFunction(ready => window.demo.readyCount > ready, ready)
  expect((await state(page)).scene).toEqual(moved.scene); await peer.close()
})

test('a real handle takes focus only for its canvas; retained selection and external input stay isolated', async ({ page }) => {
  await page.setViewportSize({ width: 2200, height: 1100 })
  await page.goto('/tests/browser/data/keyboard-host.html?kind=table'); await page.waitForFunction(() => window.keyboardHosts?.first?.handle && window.keyboardHosts?.second?.handle)
  await page.evaluate(() => {
    window.keyboardHosts.first.model.patch('keyboard-table-0', { x: 320, y: 300 })
    window.keyboardHosts.first.handle.select(['keyboard-table-0']); window.keyboardHosts.second.handle.select(['second-rect'])
  })
  const read = () => page.evaluate(() => Object.fromEntries(Object.entries(window.keyboardHosts).map(([name, host]) => [name, { scene: host.model.getValue().scene, writes: host.updates.length, selection: host.handle.getSelection() }])))
  const before = await read()
  const secondZoom = page.locator('#second').getByRole('button', { name: '缩小', exact: true }); await secondZoom.click(); await expect(secondZoom).toBeFocused()
  await startDrag(page, page.locator('#first .rich-object-move-handle')); await page.mouse.up()
  await expect(page.locator('#first .canvas-app')).toBeFocused()
  const moved = await read(); expect(moved.first.scene).not.toEqual(before.first.scene); expect(moved.second).toEqual(before.second)
  await page.keyboard.press('ControlOrMeta+z'); await expect.poll(async () => (await read()).first.scene).toEqual(before.first.scene)
  await page.keyboard.press('ControlOrMeta+Shift+z'); await expect.poll(async () => (await read()).first.scene).toEqual(moved.first.scene)
  const input = page.getByRole('textbox', { name: 'Host comment', exact: true }); await input.click()
  const baseline = await read()
  for (const key of ['End', 'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ControlOrMeta+a', 'ControlOrMeta+z', 'ControlOrMeta+Shift+z']) await input.press(key)
  await expect(input).toBeFocused(); expect(await read()).toEqual(baseline)
})

test('pointerup does not take focus back from host autofocus during a handle gesture', async ({ page }) => {
  await seed(page)
  await page.evaluate(() => { const input = document.createElement('textarea'); input.id = 'host-autofocus'; input.value = 'Host draft'; document.body.append(input) })
  await page.getByRole('button', { name: '缩小', exact: true }).click()
  await startDrag(page, page.locator('.rich-object-move-handle'))
  // Model the host's own autofocus while the pointer is still captured. This
  // deliberately does not repair Canvas focus after the interaction.
  await page.locator('#host-autofocus').evaluate(input => input.focus())
  await page.mouse.up(); await expect(page.locator('#host-autofocus')).toBeFocused()
  const moved = await state(page)
  await page.keyboard.press('ControlOrMeta+z'); await page.keyboard.press('Backspace')
  expect(await state(page)).toEqual(moved)
})

test('readonly removes the handle and cancels a pending gesture without content writes', async ({ page }) => {
  await seed(page); await page.getByRole('button', { name: '缩小', exact: true }).click()
  const before = await state(page)
  await page.locator('.rich-object-move-handle').click(); expect(await state(page)).toEqual(before)
  await expect(page.locator('.canvas-app')).toBeFocused()
  await page.getByRole('button', { name: '缩小', exact: true }).click()
  await startDrag(page, page.locator('.rich-object-move-handle'))
  expect(await state(page)).toEqual(before)
  await page.evaluate(() => window.demo.setMode('readonly'))
  await expect(page.locator('.canvas-app')).toHaveClass(/is-readonly/); await expect(page.locator('.rich-object-move-handle')).toHaveCount(0)
  await page.mouse.up(); await page.keyboard.press('ControlOrMeta+z'); await page.keyboard.press('Delete')
  expect(await state(page)).toEqual(before)
})
