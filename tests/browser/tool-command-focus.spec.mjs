import { writeFileSync } from 'node:fs'
import { test, expect } from './fixtures.mjs'

const state = page => page.evaluate(() => ({ scene: window.demo.model.getValue().scene, writes: window.demo.allUpdates.length }))
const select = scope => scope.getByRole('button', { name: '选择 (V / 1)', exact: true })
const hand = scope => scope.getByRole('button', { name: '手型工具 (H / Space)', exact: true })
function minimalTable() {
  return { id: 'tool-table', tag: 'Group', name: 'board-table', x: 420, y: 220, editable: true, hitSelf: false, data: { kind: 'table', rows: 2, columns: 3 }, children: ['项目', '状态', '备注', 'Task', 'Ready', 'QA'].map((text, index) => {
    const row = Math.floor(index / 3), column = index % 3, id = `tool-cell-${row}-${column}`
    return { id, tag: 'Frame', name: 'table-cell', x: column * 140, y: row * 46, width: 140, height: 46, fill: '#ffffff', stroke: '#cfd3d8', strokeWidth: 1, editable: false, hitChildren: false, data: { kind: 'table-cell', row, column }, children: [{ id: `${id}-label`, tag: 'Text', name: 'text', x: 12, y: 10, width: 116, height: 26, fill: '#1f2329', fontFamily: 'Arial', fontSize: 14, verticalAlign: 'top', editable: true, data: { kind: 'cell-label' }, text }] }
  }) }
}
async function open(page, kind = 'table') {
  await page.setViewportSize({ width: 1600, height: 1100 }); await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  const item = kind === 'table' ? minimalTable() : { id: 'tool-text', tag: 'Text', name: 'text', x: 420, y: 220, width: 300, height: 80, text: 'Original plain text', fontSize: 24, editable: true }
  const url = await page.evaluate(({ item, kind }) => {
    const model = window.demo.model.constructor.initialize(crypto.randomUUID(), { version: 1, scene: { tag: 'Leafer', children: kind === 'empty' ? [] : [item] } })
    const checkpoint = model.checkpoint(), url = new URL('/examples/doca/', location.origin)
    url.searchParams.set('epoch', checkpoint.epochId); url.searchParams.set('checkpoint', btoa(String.fromCharCode(...checkpoint.update))); model.dispose(); return url.href
  }, { item, kind })
  await page.goto(url); await page.waitForFunction(() => window.demo?.handle); return url
}
async function point(page, id) {
  return page.evaluate(async id => {
    const { Leafer } = window.canvasQaEngine || await import('/__qa/canvas-engine.js'), app = Leafer.list.list.find(item => item.isApp)
    const visit = nodes => { for (const node of nodes) { if (node.id === id) return node; const found = visit(node.children || []); if (found) return found } }
    const bounds = visit(app.tree.children).getBounds('box', 'world'), p = app.tree.getClientPointByWorld(bounds)
    return { x: p.x + 25, y: p.y + 20 }
  }, id)
}
async function leaveCell(page) {
  await page.keyboard.press('Escape'); await hand(page).click(); await select(page).click()
}

test('minimal table real edit then Escape, Hand, Select owns keyboard undo/redo and peer/reopen', async ({ page, context }, info) => {
  const url = await open(page), peer = await context.newPage(); await peer.goto(url); await peer.waitForFunction(() => window.demo?.handle); await page.bringToFront()
  const before = await state(page), p = await point(page, 'tool-cell-0-0')
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(p.x, p.y); await expect(page.locator('[data-slate-editor]')).toBeFocused(); await leaveCell(page)
  }
  expect(await state(page)).toEqual(before)
  await page.mouse.click(p.x, p.y); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.insertText('Minimal table real edit'); await leaveCell(page)
  await expect.poll(async () => (await state(page)).scene.children[0].children[0].children[0].text).toBe('Minimal table real edit')
  const edited = await state(page), afterTools = await page.evaluate(() => ({ active: document.activeElement.className, label: document.activeElement.getAttribute('aria-label'), hasFocus: document.hasFocus() }))
  expect(edited.writes).toBe(1); await expect.poll(async () => (await state(peer)).scene).toEqual(edited.scene); expect((await state(peer)).writes).toBe(0)
  await page.keyboard.press('ControlOrMeta+z')
  writeFileSync(info.outputPath('minimal-table-tool-focus.json'), JSON.stringify({ before, edited, afterTools, afterUndo: await state(page) }, null, 2))
  await expect.poll(async () => (await state(page)).scene).toEqual(before.scene)
  expect(afterTools).toMatchObject({ hasFocus: true }); expect(afterTools.active).toContain('canvas-app')
  await page.keyboard.press('ControlOrMeta+Shift+z'); await expect.poll(async () => (await state(page)).scene).toEqual(edited.scene)
  await expect.poll(async () => (await state(peer)).scene).toEqual(edited.scene); expect((await state(peer)).writes).toBe(0)
  const ready = await page.evaluate(() => { const ready = window.demo.readyCount, reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint); return ready })
  await page.waitForFunction(ready => window.demo.readyCount > ready, ready)
  const reopened = await state(page); await page.mouse.click(p.x, p.y); await leaveCell(page); expect(await state(page)).toEqual(reopened); await peer.close()
})

test('keyboard activation of Selection leaves a native plain editor and enables drawing undo', async ({ page }) => {
  await open(page, 'plain'); const before = await state(page), p = await point(page, 'tool-text')
  await page.mouse.dblclick(p.x, p.y); const input = page.locator('.canvas-plain-text-editor'); await expect(input).toBeFocused()
  await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.insertText('Changed plain text')
  // Use native Tab navigation, never a focus repair on the canvas.
  for (let i = 0; i < 70 && !await select(page).evaluate(button => button === document.activeElement); i++) await page.keyboard.press('Tab')
  await expect(select(page)).toBeFocused(); await page.keyboard.press('Enter')
  await expect(input).toHaveCount(0); await expect(page.locator('.canvas-app')).toBeFocused()
  await expect.poll(async () => (await state(page)).scene.children[0].text).toBe('Changed plain text')
  const edited = await state(page); await page.keyboard.press('ControlOrMeta+z'); await expect.poll(async () => (await state(page)).scene).toEqual(before.scene)
  await page.keyboard.press('ControlOrMeta+Shift+z'); await expect.poll(async () => (await state(page)).scene).toEqual(edited.scene)
})

test('explicit Hand keyboard activation returns to this canvas while category menus retain control focus', async ({ page }) => {
  await open(page); const before = await state(page)
  await page.getByRole('button', { name: '缩小', exact: true }).click(); await page.keyboard.press('Shift+Tab'); await expect(hand(page)).toBeFocused()
  await page.keyboard.press('Enter'); await expect(page.locator('.canvas-app')).toBeFocused()
  await page.keyboard.press('v'); await expect(select(page)).toHaveClass(/is-active/)
  const category = page.locator('[data-tool="shapes"] > button'); await category.click(); await expect(category).toBeFocused()
  await page.keyboard.press('ControlOrMeta+z'); expect(await state(page)).toEqual(before)
  await page.keyboard.press('Tab'); await expect(page.locator('.shape-quick-grid button').first()).toBeFocused(); await page.keyboard.press('Enter')
  await expect(page.locator('.canvas-app')).toBeFocused(); await page.keyboard.press('Escape'); expect(await state(page)).toEqual(before)
})

test('shape-library search and view settings keep their controls; final shape choice returns to canvas', async ({ page }) => {
  await open(page); const before = await state(page)
  await select(page).click(); await page.keyboard.press('m')
  const search = page.locator('.board-shapes-library input'); await search.fill(''); await search.click(); await page.keyboard.press('ControlOrMeta+z'); await expect(search).toBeFocused(); expect(await state(page)).toEqual(before)
  await page.locator('.board-shapes-library').getByRole('button', { name: '椭圆', exact: true }).click(); await expect(page.locator('.canvas-app')).toBeFocused()
  await page.keyboard.press('Escape'); await page.locator('.view-popover > button').click(); await page.keyboard.press('ArrowDown')
  expect(await page.evaluate(() => Boolean(document.activeElement.closest('.view-popover')))).toBe(true)
  await page.keyboard.press('ControlOrMeta+z'); expect(await state(page)).toEqual(before)
})

test('automatic text-tool completion keeps its newly opened native text input focused', async ({ page }) => {
  await open(page, 'empty'); await page.locator('[data-tool="text"] > button').click(); await expect(page.locator('.canvas-app')).toBeFocused()
  const b = await page.locator('.canvas-host').boundingBox(); await page.mouse.click(b.x + 500, b.y + 400)
  const input = page.locator('.canvas-plain-text-editor'); await expect(input).toBeFocused(); await page.keyboard.insertText('New native text')
  await expect(input).toHaveText('New native text'); await expect(input).toBeFocused()
})

test('explicit tools own only their canvas; foreign controls keep their keyboard and clipboard ownership', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']); await page.setViewportSize({ width: 2200, height: 1100 })
  await page.goto('/tests/browser/data/keyboard-host.html?kind=table'); await page.waitForFunction(() => window.keyboardHosts?.first?.handle && window.keyboardHosts?.second?.handle)
  await page.evaluate(() => window.keyboardHosts.second.handle.select(['second-rect']))
  const read = () => page.evaluate(() => Object.fromEntries(Object.entries(window.keyboardHosts).map(([name, host]) => [name, { scene: host.model.getValue().scene, writes: host.updates.length }])))
  const second = page.locator('#second'), first = page.locator('#first'), before = await read()
  await select(second).click(); await page.keyboard.press('ArrowRight'); await expect.poll(async () => (await read()).second.scene.children[0].x).toBe(281)
  const moved = await read(); await hand(first).click(); await select(first).click(); await expect(first.locator('.canvas-app')).toBeFocused(); await page.keyboard.press('ControlOrMeta+z')
  expect(await read()).toEqual(moved)
  await select(second).click(); await page.keyboard.press('ControlOrMeta+z'); await expect.poll(async () => (await read()).second.scene).toEqual(before.second.scene)
  const input = page.getByRole('textbox', { name: 'Host comment', exact: true }); await input.click(); const baseline = await read()
  for (const key of ['End', 'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ControlOrMeta+a', 'ControlOrMeta+c', 'ControlOrMeta+x', 'ControlOrMeta+v', 'ControlOrMeta+z', 'ControlOrMeta+Shift+z']) await input.press(key)
  await expect(input).toBeFocused(); expect(await read()).toEqual(baseline)
})

test('readonly Hand activation and pan remain view-only, and editing tools stay absent', async ({ page }) => {
  await open(page); await page.evaluate(() => window.demo.setMode('readonly')); await expect(page.locator('.canvas-app')).toHaveClass(/is-readonly/)
  const before = await state(page); await expect(select(page)).toHaveCount(0); await hand(page).click(); await expect(page.locator('.canvas-app')).toBeFocused()
  await page.mouse.move(1100, 650); await page.mouse.down(); await page.mouse.move(1160, 700, { steps: 5 }); await page.mouse.up()
  for (const key of ['Delete', 'Backspace', 'ControlOrMeta+z', 'ControlOrMeta+Shift+z']) await page.keyboard.press(key)
  expect(await state(page)).toEqual(before)
})
