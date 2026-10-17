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
