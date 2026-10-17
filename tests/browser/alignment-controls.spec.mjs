import { test, expect } from './fixtures.mjs'

const scene = page => page.evaluate(() => window.demo.model.getValue().scene.children)
const find = (nodes, id) => { for (const n of nodes) { if (n.id === id) return n; const child = n.children && find(n.children, id); if (child) return child } }
async function open(page, surface) {
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  return page.evaluate(async surface => {
    window.demo.model.remove(window.demo.model.getValue().scene.children.map(n => n.id))
    const { makeTable, makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts')
    const item = surface === 'cell' ? makeTable(400, 260, 3, 3, ['任务', '负责人']) : makeDiagram('rounded', 400, 260, '想法与行动', 240, 200)
    if (surface !== 'cell') { item.name = surface; item.data = { kind: surface }; item.children[1].verticalAlign = 'top'; item.children[1].textAlign = 'left' }
    const result = { id: item.id, label: surface === 'cell' ? item.children[0].children[0].id : item.children[1].id, cells: surface === 'cell' ? item.children.slice(0, 2).map(c => c.id) : [] }
    window.demo.handle.addElement(item.toJSON()); item.destroy(); window.demo.handle.select(surface === 'cell' ? result.cells : [result.id]); return result
  }, surface)
}

for (const surface of ['note', 'card', 'cell']) test(`${surface}: one icon opens a two-row alignment panel with independent current selections`, async ({ page }, info) => {
  const ids = await open(page, surface), bar = page.locator(surface === 'cell' ? '.table-cell-toolbar' : '.selection-actions')
  const before = await scene(page), updates = await page.evaluate(() => window.demo.allUpdates.length)
  await bar.getByRole('button', { name: '文本对齐', exact: true }).click()
  const menu = bar.getByRole('menu', { name: '文本对齐', exact: true })
  await expect(menu).toBeVisible(); await expect(menu.getByRole('button')).toHaveCount(7)
  await expect(menu.getByRole('button', { name: '左对齐', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(menu.getByRole('button', { name: '顶部对齐', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await scene(page)).toEqual(before); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
  await menu.getByRole('button', { name: '居中', exact: true }).click(); await menu.getByRole('button', { name: '垂直居中', exact: true }).click()
  for (const label of ['居中', '垂直居中']) { const button = menu.getByRole('button', { name: label, exact: true }); await expect(button).toHaveAttribute('aria-pressed', 'true'); await expect(button).toHaveCSS('color', 'rgb(128, 86, 255)'); await expect(button).toHaveCSS('background-color', 'rgb(240, 234, 255)') }
  const current = await scene(page), targets = surface === 'cell' ? find(current, ids.id).children.slice(0, 2).map(c => c.children[0]) : [find(current, ids.label)]
  expect(targets.every(t => t.textAlign === 'center' && t.verticalAlign === 'middle')).toBe(true)
  await page.screenshot({ path: info.outputPath(`${surface}-text-alignment.png`), animations: 'disabled' })
  await menu.getByRole('button', { name: '右对齐', exact: true }).click(); await menu.getByRole('button', { name: '底部对齐', exact: true }).click()
  await expect(menu.getByRole('button', { name: '居中', exact: true })).toHaveAttribute('aria-pressed', 'false')
  if (surface === 'cell') expect((await page.evaluate(() => window.demo.handle.getSelection())).map(n => n.id)).toEqual(ids.cells)
})

test('justify changes rich paragraphs and native glyph spacing, keeps text marks and survives reopening', async ({ page }) => {
  const ids = await open(page, 'note')
  const content = '用于验证两端对齐的中文段落，内容会自然换行并填满首行。最后一行保持自然宽度。'
  await page.evaluate(({ id, content }) => window.demo.model.patch(id, { text: content, data: { richText: { version: 1, value: [{ type: 'paragraph', children: [{ text: content, bold: true }] }] } } }), { id: ids.label, content })
  await page.locator('.selection-actions').getByRole('button', { name: '文本对齐', exact: true }).click()
  await page.getByRole('menu', { name: '文本对齐', exact: true }).getByRole('button', { name: '两端对齐', exact: true }).click()
  let label = find(await scene(page), ids.label); expect(label.textAlign).toBe('both'); expect(label.data.richText.value[0].align).toBe('justify'); expect(label.data.richText.value[0].children[0].bold).toBe(true)
  const layout = await page.evaluate(async id => {
    const { makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts'), { richLayout } = await import('/src/editor/runtime/thinking/richText.ts')
    const find = nodes => nodes.flatMap(n => [n, ...n.children ? find(n.children) : []]), saved = find(window.demo.model.getValue().scene.children).find(n => n.id === id), box = makeDiagram('rect', 0, 0), text = box.children[1]
    text.set(saved); const result = richLayout(text, true); box.destroy(); return { width: saved.width, rows: result.rows }
  }, ids.label)
  expect(layout.rows.length).toBeGreaterThan(1); expect(layout.rows[0].width).toBeCloseTo(layout.width); expect(layout.rows.at(-1).width).toBeLessThan(layout.width)
  await page.evaluate(({ id }) => { window.demo.handle.select([id]); }, ids)
  await page.locator('.canvas-app').focus(); await page.keyboard.press('Enter'); const input = page.locator('[data-slate-editor]')
  await expect(input.locator(':scope > [data-slate-node=element]')).toHaveCSS('text-align', 'justify'); await page.keyboard.press('Meta+a')
  await page.locator('.slate-format-toolbar').getByRole('button', { name: '文本对齐', exact: true }).click()
  const menu = page.locator('.slate-format-toolbar').getByRole('menu', { name: '文本对齐', exact: true }); await expect(menu.getByRole('button')).toHaveCount(4)
  await menu.getByRole('button', { name: '两端对齐', exact: true }).click(); await expect(input).toBeFocused(); await page.keyboard.press('Escape')
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) }); await page.waitForFunction(() => window.demo?.handle)
  label = find(await scene(page), ids.label); expect(label.text).toBe(content); expect(label.data.richText.value[0].align).toBe('justify')
})

test('alignment panel fits the narrow viewport and keeps both rows visible', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); const ids = await open(page, 'card')
  await page.evaluate(id => window.demo.handle.revealElements([id], { padding: 120, maxZoom: 1 }), ids.id)
  const button = page.locator('.selection-actions').getByRole('button', { name: '文本对齐', exact: true }); await button.click()
  const menu = page.getByRole('menu', { name: '文本对齐', exact: true }); await expect(menu).toBeVisible()
  const box = await menu.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(7); expect(box.x + box.width).toBeLessThanOrEqual(383); expect(box.y).toBeGreaterThanOrEqual(7); expect(box.y + box.height).toBeLessThanOrEqual(837)
  await menu.getByRole('button', { name: '居中', exact: true }).click(); await menu.getByRole('button', { name: '垂直居中', exact: true }).click()
  await page.screenshot({ path: info.outputPath('mobile-text-alignment.png'), animations: 'disabled' })
})
