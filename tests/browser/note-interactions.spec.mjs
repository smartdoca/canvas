import { test, expect } from './fixtures.mjs'

const scene = page => page.evaluate(() => window.demo.model.getValue().scene.children)
const note = async page => (await scene(page)).find(n => n.id === 'interactive-note')
async function open(page) {
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => {
    window.demo.model.remove(window.demo.model.getValue().scene.children.map(n => n.id))
    window.demo.handle.addElement({ id: 'interactive-note', tag: 'Frame', name: 'note', data: { kind: 'note' }, x: 360, y: 220, width: 240, height: 200, fill: '#fff2a8', editable: true, hitChildren: false, children: [{ id: 'interactive-label', tag: 'Text', name: 'text', x: 16, y: 16, width: 208, height: 168, text: '想法\n行动', fontSize: 20, fill: '#1f2329', verticalAlign: 'top', editable: true, data: { richText: { version: 1, value: [{ type: 'paragraph', align: 'left', children: [{ text: '想法', bold: true }] }, { type: 'paragraph', align: 'left', children: [{ text: '行动' }] }] } } }] })
    window.demo.handle.select([])
  })
}
async function center(page) {
  const b = await page.evaluate(() => window.demo.handle.revealElements(['interactive-note'], { maxZoom: 1 }).bounds), host = await page.locator('.canvas-host').boundingBox()
  return { x: host.x + b.x + b.width / 2, y: host.y + b.y + b.height / 2 }
}

test('note first click selects, selected body drags, next click edits; leaving and reselecting restores object scope', async ({ page }, info) => {
  await open(page); const initial = await note(page), p = await center(page), updates = await page.evaluate(() => window.demo.allUpdates.length)
  await page.mouse.click(p.x, p.y)
  await expect(page.locator('.selection-actions')).toBeVisible(); await expect(page.locator('[data-slate-editor]')).toHaveCount(0)
  expect(await page.evaluate(() => window.demo.handle.getSelection().map(n => n.id))).toEqual(['interactive-note'])
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 90, p.y + 30, { steps: 12 }); await page.mouse.up(); await page.evaluate(() => window.demo.handle.flush())
  expect(await note(page)).toMatchObject({ x: initial.x + 90, y: initial.y + 30 }); await expect(page.locator('[data-slate-editor]')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('note-selected-object.png') })
  const moved = await center(page); await page.mouse.click(moved.x, moved.y)
  const input = page.locator('[data-slate-editor]'); await expect(input).toBeFocused(); await expect(page.locator('.selection-actions')).toBeHidden(); await expect(page.locator('.slate-format-toolbar')).toBeHidden()
  await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.insertText('新增')
  await page.screenshot({ path: info.outputPath('note-second-click-rich.png') })
  await page.locator('.canvas-host').click({ position: { x: 1000, y: 540 } }); await expect(input).toHaveCount(0); await expect(page.locator('.selection-actions')).toHaveCount(0)
  await page.mouse.click(moved.x, moved.y); await expect(page.locator('.selection-actions')).toBeVisible(); await expect(input).toHaveCount(0)
  expect((await note(page)).children[0].text).toContain('新增')
})

test('note object horizontal and vertical controls align all rich paragraphs while preserving marks', async ({ page }, info) => {
  await open(page); const p = await center(page); await page.mouse.click(p.x, p.y)
  const bar = page.locator('.selection-actions')
  await bar.getByRole('button', { name: '文本对齐', exact: true }).click()
  const alignment = bar.getByRole('menu', { name: '文本对齐', exact: true })
  for (const align of ['left', 'center', 'right']) {
    await alignment.getByRole('button', { name: ({ left: '左对齐', center: '居中', right: '右对齐' })[align], exact: true }).click()
    const current = (await note(page)).children[0]; expect(current.textAlign).toBe(align); expect(current.data.richText.value.every(p => p.align === align)).toBe(true); expect(current.data.richText.value[0].children[0].bold).toBe(true)
  }
  for (const align of ['top', 'middle', 'bottom']) { await alignment.getByRole('button', { name: ({ top: '顶部对齐', middle: '垂直居中', bottom: '底部对齐' })[align], exact: true }).click(); expect((await note(page)).children[0].verticalAlign).toBe(align) }
  await page.screenshot({ path: info.outputPath('note-alignment-menu.png'), animations: 'disabled' })
  await page.mouse.click(p.x, p.y); const input = page.locator('[data-slate-editor]'); await expect(input).toBeFocused()
  await expect(input).toHaveCSS('text-align', 'right'); expect(await input.evaluate(el => parseFloat(el.style.paddingTop))).toBeGreaterThan(0)
  expect(await input.locator(':scope > [data-slate-node=element]').evaluateAll(elements => elements.every(el => getComputedStyle(el).textAlign === 'right'))).toBe(true)
  await page.screenshot({ path: info.outputPath('note-right-bottom-alignment.png') })
})

test('twelve note presets apply surface and text colors, reset old borders, undo and can place a matching new note', async ({ page }, info) => {
  await open(page); const p = await center(page); await page.mouse.click(p.x, p.y)
  const bar = page.locator('.selection-actions'), presets = await page.evaluate(async () => (await import('/src/editor/runtime/thinking/noteStyles.ts')).notePresets)
  expect(presets).toHaveLength(12)
  for (const preset of presets) {
    await bar.getByRole('button', { name: '标签样式', exact: true }).click()
    const picker = page.locator('.note-preset-popover .note-preset-picker'); await expect(picker.locator('button')).toHaveCount(12)
    if (preset.id === 'yellow') await page.screenshot({ path: info.outputPath('note-style-presets.png'), animations: 'disabled' })
    await picker.locator('button').nth(presets.indexOf(preset)).click()
    const current = await note(page); expect(current.fill).toBe(preset.fill); expect(current.children[0].fill).toBe(preset.text); expect(current.children[0].text).toBe('想法\n行动')
    expect(current.children[0].data.richText.value[0].children[0].bold).toBe(true)
  }
  let current = await note(page); expect(current.stroke).toBeUndefined(); expect(current.dashPattern).toBeUndefined()
  await page.evaluate(() => window.demo.handle.undo()); current = await note(page); expect(current.fill).toBe('#f4f1ff'); expect(current.dashPattern).toEqual([6, 4])
  await page.getByRole('button', { name: '便笺 (N)', exact: true }).click()
  await page.locator('.board-tool-flyout .note-preset-picker').getByRole('button', { name: '深空灰', exact: true }).click()
  await page.locator('.canvas-host').hover({ position: { x: 900, y: 420 } })
  await expect(page.locator('.tool-placement-preview rect')).toHaveAttribute('fill', '#303744')
  await page.locator('.canvas-host').click({ position: { x: 900, y: 420 } })
  await expect.poll(async () => (await scene(page)).filter(n => n.name === 'note').length).toBe(2)
  const added = (await scene(page)).find(n => n.name === 'note' && n.id !== 'interactive-note')
  expect(added.fill).toBe('#303744'); expect(added.children[0].fill).toBe('#f6f8fc'); await expect(page.locator('[data-slate-editor]')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('note-dark-preset-created.png') })
})
