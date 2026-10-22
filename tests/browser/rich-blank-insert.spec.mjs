import { test, expect } from './fixtures.mjs'
test.setTimeout(30000)
const scene = page => page.evaluate(() => window.demo.model.getValue().scene.children)
const label = (nodes, id) => { for (const node of nodes) { if (node.id === id) return node; const found = node.children && label(node.children, id); if (found) return found } }
async function open(page) {
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.model.remove(window.demo.model.getValue().scene.children.map(n => n.id)))
}
async function seed(page, type, lines = ['']) {
  return page.evaluate(async ({ type, lines }) => {
    const { makeTable, makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts')
    const item = type === 'table' ? makeTable(340, 220, 2, 2) : makeDiagram('rounded', 340, 160, '', 400, 340)
    if (type !== 'table') { item.name = type; item.data = { ...item.data, kind: type } }
    const text = type === 'table' ? item.children[0].children[0] : item.children[1]
    text.set({ text: lines.join('\n'), fontSize: 16, verticalAlign: 'top', textAlign: 'left', data: { richText: { version: 1, value: lines.map(text => ({ type: 'paragraph', children: [{ text }] })) } } })
    window.demo.handle.addElement(item.toJSON()); window.demo.handle.flush(); const id = text.id; item.destroy(); return id
  }, { type, lines })
}
async function edit(page, id) {
  await page.waitForFunction(id => { const find = node => node.id === id || node.children?.some(find); return window.demo?.handle && find(window.demo.handle.getValue().scene) }, id)
  await page.evaluate(id => window.demo.handle.select([id]), id); await page.locator('.canvas-app').focus(); await page.keyboard.press('Enter')
  await expect(page.locator('[data-slate-editor]')).toBeFocused()
}
const imageFile = async page => ({ name: 'idea.png', mimeType: 'image/png', buffer: Buffer.from(await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 32; const context = canvas.getContext('2d'); context.fillStyle = '#3370ff'; context.fillRect(0, 0, 48, 32); return canvas.toDataURL().split(',')[1] }), 'base64') })
async function choose(page, kind, file) {
  await page.getByRole('button', { name: '插入内容', exact: true }).click()
  const waiting = page.waitForEvent('filechooser'); await page.locator('.slate-row-menu').getByRole('button', { name: kind === 'image' ? '插入图片' : '插入附件', exact: true }).click()
  const picker = await waiting
  expect(await picker.element().getAttribute('accept')).toBe(kind === 'image' ? 'image/png,image/jpeg,image/webp,image/svg+xml' : '*/*')
  await picker.setFiles(file)
}

for (const type of ['note', 'card', 'table']) test(`${type}: empty row plus inserts an image and attachment, then saves and reopens`, async ({ page, context }, info) => {
  await open(page); const id = await seed(page, type); await edit(page, id)
  const input = page.locator('[data-slate-editor]'), plus = page.getByRole('button', { name: '插入内容', exact: true })
  await expect(plus).toBeVisible()
  await page.keyboard.type('正文'); await expect(page.getByRole('button', { name: '行操作', exact: true })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Backspace'); await expect(plus).toBeVisible()
  await plus.click(); await expect(page.locator('.slate-row-menu').getByRole('button', { name: '插入图片', exact: true })).toBeEnabled(); await expect(page.locator('.slate-row-menu').getByRole('button', { name: '插入附件', exact: true })).toBeEnabled()
  if (type === 'note') await page.screenshot({ path: info.outputPath('blank-plus-menu.png') })
  await page.keyboard.press('Escape')
  // Escape closes the row menu and finishes editing; reopen the same blank row.
  await edit(page, id)
  const file = await imageFile(page)
  await choose(page, 'image', file); await expect(input.locator('[data-resource-kind=image] img')).toBeVisible()
  // The gutter follows the hovered row. The upload menu has disappeared, so
  // move to the new typing paragraph before using its insertion button again.
  await input.locator(':scope > [data-slate-node=element]').last().hover()
  await expect(plus).toBeVisible(); await choose(page, 'attachment', file)
  await expect(input.locator('[data-resource-kind=attachment]')).toContainText('idea.png')
  await page.evaluate(() => window.demo.handle.flush())
  const value = label(await scene(page), id).data.richText.value
  expect(value.map(p => p.resource?.kind || 'paragraph')).toEqual(['image', 'attachment', 'paragraph'])
  expect(value[2].children).toEqual([{ text: '' }]); expect(JSON.stringify(value)).not.toMatch(/blob:|data:/)
  await page.keyboard.press('Escape')
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await edit(page, id); await expect(input.locator('[data-resource-kind=image]')).toHaveCount(1); await expect(input.locator('[data-resource-kind=attachment]')).toHaveCount(1)
  const peer = await context.newPage(); await peer.goto(await page.evaluate(() => window.demo.link)); await peer.waitForFunction(() => window.demo?.handle)
  await expect.poll(async () => JSON.stringify(await scene(peer))).toBe(JSON.stringify(await scene(page))); await peer.close()
})

test('blank row uploads retain their insertion point while typing elsewhere and retry after failure', async ({ page }) => {
  await open(page); const id = await seed(page, 'note', ['前文', '', '后文']); await edit(page, id)
  const input = page.locator('[data-slate-editor]')
  await input.locator(':scope > [data-slate-node=element]').nth(1).hover()
  await page.evaluate(() => { window.demo.resourceControls.failUpload = true })
  await choose(page, 'attachment', { name: 'idea.txt', mimeType: 'text/plain', buffer: Buffer.from('attachment content') })
  await expect(page.getByText('上传失败', { exact: true })).toBeVisible()
  await input.focus(); await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.type('继续')
  await page.evaluate(() => { window.demo.resourceControls.failUpload = false; window.demo.resourceControls.hold = true })
  await page.getByRole('button', { name: '重试', exact: true }).click(); await expect(page.getByRole('button', { name: '取消上传', exact: true })).toBeVisible()
  await page.evaluate(() => window.demo.resourceControls.complete?.())
  await expect(input.locator('[data-resource-kind=attachment]')).toHaveCount(1)
  await page.evaluate(() => window.demo.handle.flush())
  const value = label(await scene(page), id)
  expect(value.text).toBe('前文\n\uFFFC\n\n后文继续'); expect(value.data.richText.value[1].resource.name).toBe('idea.txt')
  await expect(input).toBeFocused(); await expect.poll(() => input.evaluate(() => window.getSelection().anchorNode?.parentElement?.closest('[data-slate-node=element]')?.textContent)).toBe('后文继续')
})

test('blank row picker cancellation and readonly transition leave pending resources out of the document', async ({ page }) => {
  await open(page); const id = await seed(page, 'note'); await edit(page, id)
  await page.getByRole('button', { name: '插入内容', exact: true }).click()
  const waiting = page.waitForEvent('filechooser'); await page.getByRole('button', { name: '插入图片', exact: true }).click(); const picker = await waiting
  await picker.setFiles([]); await page.locator('.rich-upload-input').evaluate(input => input.dispatchEvent(new Event('cancel')))
  await expect(page.locator('[data-slate-editor]')).toBeFocused()
  expect(await page.evaluate(() => window.demo.resourceLog.filter(e => e.type === 'upload').length)).toBe(0)
  await page.evaluate(() => { window.demo.resourceControls.hold = true })
  await choose(page, 'attachment', { name: 'later.txt', mimeType: 'text/plain', buffer: Buffer.from('later') })
  await expect(page.getByRole('button', { name: '取消上传', exact: true })).toBeVisible()
  await page.evaluate(() => window.demo.setMode('readonly')); const before = await scene(page)
  await page.evaluate(() => window.demo.resourceControls.complete?.())
  await expect(page.locator('[data-slate-editor]')).toHaveCount(0); await expect(page.getByRole('button', { name: '插入内容', exact: true })).toHaveCount(0)
  await expect.poll(() => scene(page)).toEqual(before)
})
