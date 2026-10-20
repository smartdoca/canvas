import { test, expect } from '@playwright/test'

// Exercise the built library: source aliases hide registration tree-shaking bugs.
test.beforeEach(async ({ page }) => {
  const errors = [], modules = []
  page.packageErrors = errors
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => modules.push(new URL(request.url()).pathname))
  await page.route('**/examples/doca/main.jsx*', async route => {
    const response = await route.fetch()
    const body = (await response.text()).replaceAll('/src/index.ts', '/dist/index.js').replaceAll('/src/model/index.ts', '/dist/model.js').replaceAll('/src/io/index.ts', '/dist/io.js').replaceAll('/src/index.css', '/dist/index.css')
    await route.fulfill({ response, body })
  })
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
  if (process.env.CANVAS_PACKAGE_CONSUMER) expect(modules.some(path => path.startsWith('/assets/') && path.endsWith('.js'))).toBe(true)
  else expect(modules).toContain('/dist/index.js')
  expect(modules.some(path => path.startsWith('/src/'))).toBe(false)
})

test.afterEach(async ({ page }) => {
  await page.close()
  expect(page.packageErrors).toEqual([])
})

async function edit(page, id) {
  const bounds = await page.evaluate(id => window.demo.handle.revealElements([id], { maxZoom: 1 }).bounds, id)
  const host = await page.locator('.canvas-host').boundingBox()
  await page.mouse.dblclick(host.x + bounds.x + bounds.width / 2, host.y + bounds.y + bounds.height / 2)
}
const text = (page, id) => page.evaluate(id => {
  const find = nodes => nodes.flatMap(node => [node, ...find(node.children || [])])
  return find(window.demo.model.getValue().scene.children).find(node => node.id === id)
}, id)

test('built package registers plain text editing and preserves literal text through undo/redo', async ({ page }) => {
  await edit(page, 'text-a')
  const input = page.locator('.canvas-plain-text-editor')
  await expect(input).toBeFocused()
  await input.fill('Package **literal**')
  await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  expect((await text(page, 'text-a')).text).toBe('Package **literal**')
  expect((await text(page, 'text-a')).data?.richText).toBeUndefined()
  await page.evaluate(() => window.demo.handle.undo())
  expect((await text(page, 'text-a')).text).toBe('hello canvas')
  await page.evaluate(() => window.demo.handle.redo())
  expect((await text(page, 'text-a')).text).toBe('Package **literal**')
})

test('built package registers Slate notes and restores their text and formatting from checkpoint', async ({ page }, info) => {
  await page.evaluate(() => window.demo.model.add({ id: 'packaged-note', tag: 'Frame', name: 'note', x: 350, y: 260, width: 360, height: 180, fill: '#fff2a8', editable: true, data: { kind: 'note' }, children: [{ id: 'packaged-rich', tag: 'Text', name: 'text', text: '初始内容', x: 16, y: 16, width: 328, height: 148, fontSize: 20, fill: '#1f2329', editable: true }] }))
  await edit(page, 'packaged-rich')
  const input = page.locator('[data-slate-editor]')
  await expect(input).toBeFocused()
  await page.keyboard.press('Meta+a'); await page.keyboard.insertText('打包富文本')
  await page.keyboard.press('Home'); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Meta+b')
  await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  const saved = await text(page, 'packaged-rich')
  expect(saved.text).toBe('打包富文本')
  expect(saved.data.richText.value[0].children[0]).toMatchObject({ text: '打包', bold: true })
  await page.evaluate(() => { const open = window.demo.openDocument, checkpoint = window.demo.closeDocument(); open(checkpoint) })
  await page.waitForFunction(() => window.demo?.handle)
  await edit(page, 'packaged-rich')
  await expect(input).toHaveText('打包富文本')
  await expect(input.locator('[data-slate-leaf]').first()).toHaveCSS('font-weight', '700')
  await page.screenshot({ path: info.outputPath('packaged-slate-editing.png') })
  await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  expect(await text(page, 'packaged-rich')).toEqual(saved)
})

test('built package selects images before preview and copies authorized image pixels', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.evaluate(async () => {
    window.demo.model.remove(window.demo.model.getValue().scene.children.map(n => n.id))
    const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 32
    const c = canvas.getContext('2d'); c.fillStyle = '#3370ff'; c.fillRect(0, 0, 48, 32)
    const blob = await new Promise(resolve => canvas.toBlob(resolve))
    await window.demo.handle.insertImageFile(new File([blob], 'packaged.png', { type: 'image/png' }), { x: 340, y: 240, width: 180 })
    window.demo.handle.flush(); window.demo.handle.select([])
  })
  const host = page.locator('.canvas-host')
  const before = await page.evaluate(() => JSON.stringify(window.demo.model.getValue()))
  await host.click({ position: { x: 420, y: 290 } })
  expect(await page.evaluate(() => window.demo.resourceLog.filter(e => e.type === 'preview').length)).toBe(0)
  await host.click({ position: { x: 420, y: 290 } })
  expect(await page.evaluate(() => window.demo.resourceLog.filter(e => e.type === 'preview').length)).toBe(1)
  await page.evaluate(() => navigator.clipboard.writeText('before-packaged-image-copy'))
  await host.click({ position: { x: 420, y: 290 }, button: 'right' })
  await page.getByRole('menuitem', { name: '复制图片', exact: true }).click()
  await expect.poll(() => page.evaluate(async () => {
    const items = await navigator.clipboard.read()
    if (!items[0]?.types.includes('image/png')) return null
    const bitmap = await createImageBitmap(await items[0].getType('image/png'))
    const size = [bitmap.width, bitmap.height]; bitmap.close(); return size
  })).toEqual([48, 32])
  expect(await page.evaluate(() => JSON.stringify(window.demo.model.getValue()))).toBe(before)
})

test('built package keeps view controls available without the document header', async ({ page }) => {
  await page.goto('/examples/doca/?no-header')
  await page.waitForFunction(() => window.demo?.handle)
  await expect(page.locator('.app-header')).toHaveCount(0)
  const before = await page.evaluate(() => JSON.stringify(window.demo.model.getValue()))
  await page.getByRole('button', { name: '主菜单', exact: true }).click()
  await page.getByRole('menuitemradio', { name: '点阵', exact: true }).click()
  await expect(page.locator('.canvas-stage')).toHaveClass(/has-grid/)
  await page.getByRole('button', { name: '主菜单', exact: true }).click()
  await page.getByRole('menuitemradio', { name: '背景色 #edf3ff', exact: true }).click()
  await expect(page.locator('.canvas-host')).toHaveCSS('background-color', 'rgb(237, 243, 255)')
  expect(await page.evaluate(() => JSON.stringify(window.demo.model.getValue()))).toBe(before)
})

test('built package can delete a note with an active mention and undo the object deletion', async ({ page }) => {
  await page.evaluate(() => window.demo.model.add({ id: 'mention-note', tag: 'Frame', name: 'note', x: 350, y: 260, width: 360, height: 180, fill: '#fff2a8', editable: true, data: { kind: 'note' }, children: [{ id: 'mention-label', tag: 'Text', name: 'text', text: '', x: 16, y: 16, width: 328, height: 148, fontSize: 20, fill: '#1f2329', editable: true }] }))
  await edit(page, 'mention-label')
  await expect(page.locator('[data-slate-editor]')).toBeFocused()
  await page.keyboard.insertText('@Canvas')
  await page.getByRole('option', { name: 'Canvas QA' }).waitFor()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-rich-inline]')).toHaveText('@Canvas QA')
  await page.evaluate(() => { window.demo.handle.removeSelection(); window.demo.handle.flush() })
  expect(await text(page, 'mention-note')).toBeUndefined()
  await page.evaluate(() => window.demo.handle.undo())
  expect((await text(page, 'mention-label')).data.richText.value[0].children.some(child => child.inline)).toBe(true)
})

test('built package translates an unbound line from its body before and after selection', async ({ page }) => {
  await page.evaluate(() => {
    window.demo.model.remove(window.demo.model.getValue().scene.children.map(node => node.id))
    window.demo.handle.addElement({ id: 'packaged-free-line', tag: 'Path', name: 'connector', path: 'M300 240L700 420', stroke: '#646a73', strokeWidth: 1.5, editable: true, editConfig: { moveable: false, resizeable: false, rotateable: false }, data: { kind: 'connector', mode: 'straight', from: { x: 300, y: 240 }, to: { x: 700, y: 420 } } })
    window.demo.handle.flush(); window.demo.handle.select([])
  })
  const before = await text(page, 'packaged-free-line'), host = await page.locator('.canvas-host').boundingBox()
  const drag = async (x, y, dx, dy) => {
    await page.mouse.move(host.x + x, host.y + y); await page.mouse.down()
    await page.mouse.move(host.x + x + dx, host.y + y + dy, { steps: 12 }); await page.mouse.up()
  }
  await drag(420, 294, 100, 60)
  const first = await text(page, 'packaged-free-line')
  expect(first.data.from).toEqual({ x: 400, y: 300 }); expect(first.data.to).toEqual({ x: 800, y: 480 })
  await drag(520, 354, -50, 40)
  const second = await text(page, 'packaged-free-line')
  expect(second.data.from).toEqual({ x: 350, y: 340 }); expect(second.data.to).toEqual({ x: 750, y: 520 })
  await page.evaluate(() => window.demo.handle.undo()); expect(await text(page, 'packaged-free-line')).toEqual(first)
  await page.evaluate(() => window.demo.handle.undo()); expect(await text(page, 'packaged-free-line')).toEqual(before)
  await page.evaluate(() => { window.demo.handle.redo(); window.demo.handle.redo() }); expect(await text(page, 'packaged-free-line')).toEqual(second)
  await page.evaluate(() => window.demo.setMode('readonly'))
  await drag(470, 394, 100, 60); expect(await text(page, 'packaged-free-line')).toEqual(second)
})
