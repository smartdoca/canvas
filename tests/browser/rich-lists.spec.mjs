import { test, expect } from './fixtures.mjs'
test.setTimeout(30000)

const paragraph = (text, props = {}) => ({ type: 'paragraph', ...props, children: [{ text }] })
const scene = page => page.evaluate(() => window.demo.model.getValue().scene.children)
async function open(page) {
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.model.remove(window.demo.model.getValue().scene.children.map(n => n.id)))
}
async function seed(page, value) {
  return page.evaluate(value => {
    const id = crypto.randomUUID(), labelId = crypto.randomUUID()
    window.demo.model.add({ id, tag: 'Frame', name: 'note', x: 350, y: 130, width: 420, height: 540, fill: '#fff2a8', editable: true, data: { kind: 'note' }, children: [{ id: labelId, tag: 'Text', name: 'text', text: value.map(p => p.children.map(l => l.text).join('')).join('\n'), x: 16, y: 16, width: 388, height: 508, fontSize: 16, textAlign: 'left', verticalAlign: 'top', fill: '#1f2329', editable: true, data: { richText: { version: 1, value } } }] })
    return { id, labelId }
  }, value)
}
async function edit(page, id) {
  await page.waitForFunction(id => { const find = node => node.id === id || node.children?.some(find); return window.demo?.handle && find(window.demo.handle.getValue().scene) }, id)
  await page.evaluate(id => window.demo.handle.select([id]), id)
  await page.locator('.canvas-app').focus(); await page.keyboard.press('Enter')
  await expect(page.locator('[data-slate-editor]')).toBeFocused()
}
const markers = page => page.locator('[data-slate-editor] .rich-list-marker').allTextContents()

test('nested markers and custom starts match slatetsx in editing and native rendering', async ({ page }, info) => {
  await open(page)
  const value = [paragraph('父级', { block: 'number', listOrder: 5 }), paragraph('子级', { block: 'number', indent: 1 }), paragraph('孙级', { block: 'number', indent: 2 }), paragraph('另一子级', { block: 'number', indent: 1 }), paragraph('下一父级', { block: 'number' }), paragraph('分隔'), ...[0, 1, 2].map(indent => paragraph('无序列表', { block: 'bullet', indent })), paragraph('重新编号', { block: 'number' }), paragraph('已完成事项', { block: 'task', checked: true }), paragraph('待办事项', { block: 'task' })]
  const { labelId } = await seed(page, value)
  await edit(page, labelId)
  const expected = ['5.', 'a.', 'A.', 'b.', '6.', '•', '◦', '▪', '1.']
  await expect.poll(() => markers(page)).toEqual(expected)
  await expect(page.locator('.rich-list-marker').first()).toHaveCSS('color', 'rgb(51, 112, 255)')
  await expect(page.locator('[data-rich-block=number]').nth(1)).toHaveCSS('margin-left', '22px')
  await page.keyboard.press('ArrowRight')
  await page.screenshot({ path: info.outputPath('lists-editing.png') })
  await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  const native = await page.evaluate(async expected => {
    const output = await window.demo.handle.exportFile({ format: 'svg' }), svg = new DOMParser().parseFromString(await output.blob.text(), 'image/svg+xml')
    return { markers: [...svg.querySelectorAll('tspan')].map(span => span.textContent).filter(text => expected.includes(text)), tasks: [...svg.querySelectorAll('rect')].filter(rect => ['#3370ff', '#bbbfc4'].includes(rect.getAttribute('stroke'))).map(rect => ({ checked: rect.getAttribute('fill') === '#3370ff' })), done: [...svg.querySelectorAll('tspan[text-decoration="line-through"]')].map(span => span.textContent).join('') }
  }, expected)
  expect(native.markers).toEqual(expected); expect(native.tasks.map(c => c.checked)).toEqual([true, false]); expect(native.done).toBe('已完成事项')
  await page.screenshot({ path: info.outputPath('lists-native.png') })
})

test('inserting inside an ordered list renumbers unchanged siblings and preserves a custom start', async ({ page }) => {
  await open(page); const { labelId } = await seed(page, [paragraph('第一项', { block: 'number', listOrder: 5 }), paragraph('第二项', { block: 'number' }), paragraph('第三项', { block: 'number' })])
  await edit(page, labelId); await expect.poll(() => markers(page)).toEqual(['5.', '6.', '7.'])
  await page.keyboard.press('ControlOrMeta+Home'); await page.keyboard.press('End'); await page.keyboard.press('Enter'); await page.keyboard.type('插入项')
  await expect.poll(() => markers(page)).toEqual(['5.', '6.', '7.', '8.'])
  await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  let value = (await scene(page))[0].children[0].data.richText.value
  expect(value.map(p => p.children.map(l => l.text).join(''))).toEqual(['第一项', '插入项', '第二项', '第三项'])
  expect(value[0].listOrder).toBe(5); expect(value.slice(1).every(p => p.listOrder === undefined)).toBe(true)
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await edit(page, labelId); await expect.poll(() => markers(page)).toEqual(['5.', '6.', '7.', '8.'])
})

test('list keyboard shortcuts, empty-item outdent, Backspace and row toggles follow slatetsx', async ({ page }) => {
  await open(page); const { labelId } = await seed(page, [paragraph('')]); await edit(page, labelId)
  const input = page.locator('[data-slate-editor]')
  await page.keyboard.type('5. 第一项'); await page.keyboard.press('Enter'); await page.keyboard.type('子项'); await page.keyboard.press('Tab')
  await expect.poll(() => markers(page)).toEqual(['5.', 'a.'])
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter')
  await expect.poll(() => markers(page)).toEqual(['5.', 'a.', '6.'])
  await page.keyboard.press('Enter'); await expect(input.locator('[data-rich-block=number]')).toHaveCount(2)
  await page.keyboard.type('[x] 已完成'); await expect(input.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Enter'); await expect(input.getByRole('checkbox').last()).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('Tab'); await page.keyboard.press('Backspace')
  await expect(input.locator('[data-rich-block=task]')).toHaveCount(1)
  await expect(input.locator('[data-slate-node=element]').last()).toHaveCSS('margin-left', '22px')
  await page.keyboard.press('Backspace'); await expect(input.locator('[data-slate-node=element]').last()).toHaveCSS('margin-left', '0px')
  await page.getByRole('button', { name: '插入内容', exact: true }).click(); await page.getByRole('button', { name: '无序列表', exact: true }).click()
  await expect(input.locator('[data-rich-block=bullet]')).toHaveCount(1)
  await page.getByRole('button', { name: '插入内容', exact: true }).click(); await page.getByRole('button', { name: '无序列表', exact: true }).click()
  await expect(input.locator('[data-rich-block=bullet]')).toHaveCount(0)
})

test('task controls support keyboard, native toggles, undo, peer updates, exports and readonly', async ({ page, context }, info) => {
  await open(page); const { labelId } = await seed(page, [paragraph('完成需求', { block: 'task' }), paragraph('下一项', { block: 'task' })])
  const peer = await context.newPage(); await peer.goto(await page.evaluate(() => window.demo.link)); await peer.waitForFunction(() => window.demo?.handle)
  await edit(page, labelId)
  const checkbox = page.locator('[data-slate-editor]').getByRole('checkbox').first()
  await checkbox.focus(); await page.keyboard.press('Space'); await expect(checkbox).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.rich-list-content').first()).toHaveCSS('text-decoration-line', 'line-through')
  await expect(page.locator('.rich-list-content').first()).toHaveCSS('color', 'rgb(143, 149, 158)')
  await expect(checkbox).toHaveCSS('background-color', 'rgb(51, 112, 255)')
  await page.locator('[data-slate-editor]').focus(); await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  const native = page.locator('.native-task-checkbox').first()
  await expect(native).toHaveAttribute('aria-checked', 'true')
  await native.focus(); await page.keyboard.press('Space'); await expect(native).toHaveAttribute('aria-checked', 'false')
  await expect(native).toBeFocused()
  await expect(page.locator('.canvas-stage')).toHaveAttribute('data-active-tool', 'init')
  await page.keyboard.press('Enter'); await expect(native).toHaveAttribute('aria-checked', 'true')
  await native.click(); await expect(native).toHaveAttribute('aria-checked', 'false')
  await page.evaluate(() => window.demo.handle.undo()); await expect(native).toHaveAttribute('aria-checked', 'true')
  await expect.poll(async () => JSON.stringify(await scene(peer))).toBe(JSON.stringify(await scene(page)))
  const exported = await page.evaluate(async () => { const before = JSON.stringify(window.demo.model.getValue()), svg = await window.demo.handle.exportFile({ format: 'svg' }), png = await window.demo.handle.exportFile({ format: 'png' }); return { svg: await svg.blob.text(), png: png.blob.size, unchanged: before === JSON.stringify(window.demo.model.getValue()) } })
  expect(exported.svg).toContain('<polyline'); expect(exported.svg).toContain('line-through'); expect(exported.svg).toContain('#8f959e'); expect(exported.png).toBeGreaterThan(100); expect(exported.unchanged).toBe(true)
  await page.screenshot({ path: info.outputPath('tasks-native.png') })
  await page.evaluate(() => window.demo.setMode('readonly')); await expect(native).toBeDisabled()
  const before = await scene(page); await native.focus(); await page.keyboard.press('Space'); expect(await scene(page)).toEqual(before)
  await peer.close()
})

test('HTML and slatetsx fragments retain nested lists, start numbers and task states', async ({ page }) => {
  await open(page); const { labelId } = await seed(page, [paragraph('')]); await edit(page, labelId)
  await page.locator('[data-slate-editor]').evaluate(element => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/html', '<ol start="5"><li>父级<ol><li>子级</li></ol></li><li>下一项</li></ol><ul><li><input type="checkbox" checked>已完成</li><li><input type="checkbox">未完成</li></ul>')
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  })
  await expect.poll(() => markers(page)).toEqual(['5.', 'a.', '6.'])
  await expect(page.getByRole('checkbox').first()).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('checkbox').last()).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter')
  await page.locator('[data-slate-editor]').evaluate(element => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('application/x-slate-fragment', btoa(encodeURIComponent(JSON.stringify([{ type: 'paragraph', list: 'ol', listOrder: 9, indentation: 1, children: [{ text: '文档列表' }] }, { type: 'paragraph', list: 'checkbox', checked: true, children: [{ text: '文档待办' }] }]))))
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  })
  await expect(page.locator('[data-rich-block=number]').last()).toContainText('i.')
  await expect(page.getByRole('checkbox').last()).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  const value = (await scene(page))[0].children[0].data.richText.value
  expect(value.find(p => p.children.some(l => l.text.includes('文档列表')))).toMatchObject({ block: 'number', listOrder: 9, indent: 1 })
  expect(value.find(p => p.children.some(l => l.text.includes('文档待办')))).toMatchObject({ block: 'task', checked: true })
})
