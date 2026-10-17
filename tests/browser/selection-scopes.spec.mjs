import { test, expect } from './fixtures.mjs'
test.setTimeout(30000)
async function open(page) {
  await page.context().route('**/examples/doca/main.jsx', async route => { const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()).replaceAll('/dist/index.js', '/src/index.ts').replaceAll('/dist/model.js', '/src/model/index.ts').replaceAll('/dist/io.js', '/src/io/index.ts').replaceAll('/dist/index.css', '/src/index.css') }) })
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.model.remove(window.demo.model.getValue().scene.children.map(node => node.id)))
}
const scene = page => page.evaluate(() => window.demo.model.getValue().scene.children)
const select = async (page, ids) => { await page.evaluate(ids => window.demo.handle.select(ids), Array.isArray(ids) ? ids : [ids]); await page.locator('.canvas-app').focus() }
const hostPoint = async (page, x, y) => { const b = await page.locator('.canvas-host').boundingBox(); return { x: b.x + x, y: b.y + y } }
async function seed(page, surface, text = '') {
  return page.evaluate(async ({ surface, text }) => {
    const { makeTable, makeDiagram, makeMindMap } = await import('/src/editor/runtime/thinking/scene.ts')
    const label = { id: 'scope-label', tag: 'Text', name: 'text', text, x: 16, y: 16, width: 288, height: 168, fontSize: 16, editable: true, fill: '#1f2329' }
    let item
    if (surface === 'table') item = makeTable(360, 260, 3, 3)
    else if (surface === 'mind') item = makeMindMap(480, 340, text, 'branch')
    else if (surface === 'diagram') item = makeDiagram('rounded', 360, 260, text, 320, 200)
    const node = item ? item.toJSON() : surface === 'text' ? { ...label, x: 360, y: 260 } : { id: 'scope-element', tag: 'Frame', name: surface, x: 360, y: 260, width: 320, height: 200, editable: true, fill: '#fff2a8', data: { kind: surface }, children: [label] }
    const id = window.demo.handle.addElement(node).id, labelId = surface === 'table' ? node.children[3].children[0].id : surface === 'diagram' ? node.children[1].id : surface === 'mind' ? node.children.find(n => n.data?.root).children[0].id : label.id
    item?.destroy(); window.demo.handle.flush(); window.demo.handle.select([labelId]); return { id, labelId }
  }, { surface, text })
}
const labelData = (nodes, id) => { for (const n of nodes) { if (n.id === id) return n; const found = n.children && labelData(n.children, id); if (found) return found } }

for (const surface of ['note', 'card', 'table']) test(`${surface}: caret hides formatting, Markdown and links persist through native rendering`, async ({ page }, info) => {
  await open(page); const ids = await seed(page, surface)
  await page.locator('.canvas-app').focus(); await page.keyboard.press(surface === 'mind' ? 'F2' : 'Enter')
  const input = page.locator('[data-slate-editor]'), toolbar = page.locator('.slate-format-toolbar')
  await expect(input).toBeFocused(); await expect(toolbar).toBeHidden(); await expect(input).toHaveCSS('outline-style', 'none')
  await page.keyboard.type('# Heading'); await expect(input.locator('[data-rich-block=heading]')).toHaveText('Heading')
  await page.keyboard.press('Enter'); await page.keyboard.type('**bold** and *italic* and ~~strike~~ and `code`')
  await expect(input.locator('[data-rich-block=heading]')).toHaveCount(1)
  await expect(input).toHaveText('Headingbold and italic and strike and code')
  await expect(toolbar).toBeHidden()
  await page.keyboard.press('Enter'); await page.keyboard.type('[docs](https://example.com/guide)')
  await expect(input.locator('a')).toHaveAttribute('href', 'https://example.com/guide')
  await page.keyboard.press('Enter'); await page.keyboard.type('- first'); await page.keyboard.press('Enter'); await page.keyboard.type('second')
  await expect(input.locator('[data-rich-block=bullet]')).toHaveCount(2)
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.type('plain')
  await page.keyboard.press('Meta+a'); await expect(toolbar).toBeVisible()
  await page.screenshot({ path: info.outputPath(`${surface}-selected-rich.png`) })
  await page.keyboard.press('ArrowRight'); await expect(toolbar).toBeHidden()
  if (surface === 'table') { await expect(page.locator('.table-axis-rail')).toHaveCount(6); await expect(page.getByRole('button', { name: '在第 2 行前插入', exact: true })).toBeVisible() }
  await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  const data = labelData(await scene(page), ids.labelId), rich = data.data.richText.value
  expect(data.text).not.toContain('**'); expect(rich[0].block).toBe('heading'); expect(rich[1].children.some(leaf => leaf.bold && leaf.text === 'bold')).toBe(true)
  expect(rich[1].children.some(leaf => leaf.italic && leaf.text === 'italic')).toBe(true); expect(rich[1].children.some(leaf => leaf.code && leaf.text === 'code')).toBe(true)
  expect(rich[2].children[0].url).toBe('https://example.com/guide'); expect(rich[3].block).toBe('bullet'); expect(rich.at(-1).block).toBeUndefined()
  const svg = await page.evaluate(async () => (await window.demo.handle.exportFile({ format: 'svg' })).blob.text()); expect(svg).toContain('href="https://example.com/guide"')
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) }); await page.waitForFunction(() => window.demo?.handle)
  expect(labelData(await scene(page), ids.labelId).data.richText.value).toEqual(rich)
  await select(page, ids.labelId); await page.keyboard.press(surface === 'mind' ? 'F2' : 'Enter'); await expect(input.locator('a')).toHaveAttribute('href', 'https://example.com/guide'); await page.keyboard.press('Escape')
})

test('link command retains the text range, validates URLs, updates and removes links', async ({ page }, info) => {
  await open(page); const ids = await seed(page, 'card', 'project docs'); await page.locator('.canvas-app').focus(); await page.keyboard.press('Enter')
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Meta+k')
  await page.getByRole('textbox', { name: '链接地址', exact: true }).fill('javascript:alert(1)'); await page.getByRole('button', { name: '应用链接', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '链接地址', exact: true })).toHaveAttribute('aria-invalid', 'true')
  await page.getByRole('textbox', { name: '链接地址', exact: true }).fill('https://example.com/docs'); await page.getByRole('button', { name: '应用链接', exact: true }).click()
  await expect(page.locator('[data-slate-editor] a')).toHaveText('project docs'); await expect(page.locator('[data-slate-editor]')).toBeFocused(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Meta+k')
  await page.getByRole('textbox', { name: '链接文字', exact: true }).fill('updated docs'); await page.getByRole('textbox', { name: '链接地址', exact: true }).fill('https://example.com/updated'); await page.getByRole('button', { name: '应用链接', exact: true }).click()
  await expect(page.locator('[data-slate-editor] a')).toHaveAttribute('href', 'https://example.com/updated'); await expect(page.locator('[data-slate-editor]')).toBeFocused()
  await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  await expect(page.locator('[data-slate-editor]')).toHaveCount(0)
  await page.locator('.canvas-host').hover({ position: { x: 399, y: 288 } }); await expect(page.locator('.rich-native-link a')).toHaveAttribute('href', 'https://example.com/updated')
  await page.screenshot({ path: info.outputPath('native-link.png') })
  const linkBox = await page.locator('.rich-native-link a').boundingBox(); await page.mouse.move(linkBox.x + 50, linkBox.y + linkBox.height / 2, { steps: 20 }); await expect(page.locator('.rich-native-link a')).toBeVisible()
  await page.context().route('https://example.com/**', route => route.fulfill({ contentType: 'text/html', body: '<main>Linked document</main>' }))
  const popupEvent = page.waitForEvent('popup'); await page.locator('.rich-native-link a').click(); const popup = await popupEvent; await expect(popup.locator('main')).toHaveText('Linked document'); await popup.close()

  await select(page, ids.labelId); await page.keyboard.press('Enter'); await page.keyboard.press('Meta+a'); await page.keyboard.press('Meta+k'); await page.getByRole('button', { name: '移除链接', exact: true }).click()
  await expect(page.locator('[data-slate-editor] a')).toHaveCount(0); await page.keyboard.press('Escape')
  expect(labelData(await scene(page), ids.labelId).text).toBe('updated docs')
})

test('quotes, numbered and task lists, indentation, code, auto-links and HTML links remain editable', async ({ page }, info) => {
  await open(page); const ids = await seed(page, 'note'); await page.locator('.canvas-app').focus(); await page.keyboard.press('Enter')
  const input = page.locator('[data-slate-editor]')
  await page.keyboard.type('> quote'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter')
  await page.keyboard.type('1. one'); await page.keyboard.press('Enter'); await page.keyboard.type('two'); await page.keyboard.press('Tab')
  await expect(input.locator('[data-rich-block=number]').last()).toHaveCSS('margin-left', '22px')
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter')
  await page.keyboard.type('[ ] task'); await expect(input.locator('[data-rich-block=task]')).toHaveText('task')
  const checkbox = input.getByRole('checkbox', { name: '待办', exact: true })
  await expect(checkbox).toHaveAttribute('aria-checked', 'false')
  await checkbox.click(); await expect(checkbox).toHaveAttribute('aria-checked', 'true')
  await input.click(); await page.keyboard.press('Meta+End'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter')
  await page.keyboard.type('```'); await page.keyboard.press('Enter'); await page.keyboard.type('code'); await expect(input.locator('[data-rich-block=code]')).toHaveText('code'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter')
  await page.keyboard.type('https://example.com/auto '); await expect(input.locator('a').last()).toHaveAttribute('href', 'https://example.com/auto')
  await page.keyboard.type('plain'); await page.keyboard.press('Enter')
  await input.evaluate(element => { const clipboardData = new DataTransfer(); clipboardData.setData('text/html', '<p><a href="https://example.com/pasted">pasted</a> <a href="javascript:alert(1)">safe text</a></p>'); element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })) })
  await expect(input.locator('a[href="https://example.com/pasted"]')).toHaveText('pasted'); await expect(input.locator('a[href^="javascript:"]')).toHaveCount(0)
  await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  const rich = labelData(await scene(page), ids.labelId).data.richText.value
  expect(rich.some(p => p.block === 'quote')).toBe(true); expect(rich.filter(p => p.block === 'number')).toHaveLength(2); expect(rich.some(p => p.block === 'task' && p.checked)).toBe(true); expect(rich.some(p => p.block === 'code')).toBe(true)
  expect(rich.flatMap(p => p.children).find(l => l.text.includes('plain')).url).toBeUndefined()
  await page.screenshot({ path: info.outputPath('markdown-blocks-native.png') })
})

test('an explicit font size inside a heading is identical in Slate and native text', async ({ page }) => {
  await open(page)
  const { labelId: id } = await seed(page, 'note', 'Heading')
  await page.evaluate(id => window.demo.model.patch(id, { data: { richText: { version: 1, value: [{ type: 'paragraph', block: 'heading', level: 1, children: [{ text: 'Heading', fontSize: 18 }] }] } } }), id)
  await select(page, id); await page.keyboard.press('Enter'); await expect(page.locator('[data-slate-leaf]').first()).toHaveCSS('font-size', '18px')
  await page.locator('.slate-format-toolbar').getByRole('combobox', { name: '选中文字字号', exact: true }).click(); await page.getByRole('option', { name: '24', exact: true }).click(); await expect(page.locator('[data-slate-leaf]').first()).toHaveCSS('font-size', '24px')
  await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush()); expect(labelData(await scene(page), id).data.richText.value[0].children[0].fontSize).toBe(24)
})

test('closing an active Chinese composition in a list never commits its visual bullet', async ({ page, context }) => {
  await open(page); const ids = await seed(page, 'note'); await page.locator('.canvas-app').focus(); await page.keyboard.press('Enter'); await page.keyboard.type('- ')
  const input = page.locator('[data-slate-editor]'), cdp = await context.newCDPSession(page)
  await cdp.send('Input.imeSetComposition', { text: '候选', selectionStart: 2, selectionEnd: 2 }); await expect(input).toContainText('候选')
  await page.evaluate(() => { window.demo.model.checkpoint(); window.demo.setMode('readonly') }); await expect(input).toHaveCount(0)
  expect(labelData(await scene(page), ids.labelId).text).toBe('候选')
  await page.evaluate(() => window.demo.setMode('edit'))
  await expect(page.locator('.canvas-app')).not.toHaveClass(/is-readonly/)
  await select(page, ids.labelId); await page.keyboard.press('Enter')
  await expect(input.locator('[data-slate-string]')).toHaveText('候选'); await expect(input.locator('[data-rich-block=bullet]')).toHaveCount(1); await page.keyboard.press('Escape')
})

test('element, cell and text toolbars have distinct scopes and dismiss stale styles', async ({ page }, info) => {
  await open(page)
  const ids = await page.evaluate(() => {
    const line = window.demo.handle.addElement({ id: 'scope-path', tag: 'Path', name: 'path', path: 'M0 0L120 30L200 0', x: 300, y: 250, stroke: '#646a73', strokeWidth: 2, editable: true }).id
    const shape = window.demo.handle.addElement({ id: 'scope-rect', tag: 'Rect', name: 'rect', x: 700, y: 260, width: 160, height: 90, fill: '#eaf1ff', stroke: '#646a73', editable: true }).id
    window.demo.handle.flush(); return { line, shape }
  })
  await select(page, ids.line); const bar = page.locator('.selection-actions'); await expect(bar).toBeVisible()
  await expect(bar.getByRole('combobox', { name: '字号', exact: true })).toHaveCount(0); await expect(bar.getByRole('button', { name: '文字颜色', exact: true })).toHaveCount(0)
  await expect(bar.getByRole('combobox', { name: '线宽', exact: true })).toBeVisible(); await expect(bar.getByRole('button', { name: '填充', exact: true })).toHaveCount(0)
  await bar.getByRole('button', { name: '更多样式', exact: true }).click(); await expect(page.locator('.property-wrap')).toBeVisible()
  await page.locator('.canvas-host').click({ position: { x: 1000, y: 500 } }); await expect(bar).toHaveCount(0); await expect(page.locator('.property-wrap')).toHaveCount(0)
  await select(page, ids.shape); await expect(page.locator('.property-wrap')).toHaveCount(0); await bar.getByRole('button', { name: '更多样式', exact: true }).click()
  await page.keyboard.press('Delete'); await expect(page.locator('.property-wrap')).toHaveCount(0); await expect(bar).toHaveCount(0)
  const table = await seed(page, 'table'); await select(page, table.labelId); await page.keyboard.press('Enter'); await page.keyboard.type('text')
  await expect(bar).toBeHidden(); await expect(page.locator('.table-cell-toolbar')).toHaveCount(0); await expect(page.locator('.slate-format-toolbar')).toBeHidden()
  await page.keyboard.press('Meta+a'); await expect(page.locator('.slate-format-toolbar')).toBeVisible(); await expect(page.locator('.table-cell-toolbar')).toHaveCount(0)
  await page.keyboard.press('Escape'); await select(page, (await scene(page)).find(node => node.id === table.id).children.slice(3, 6).map(n => n.id))
  await expect(page.locator('.table-cell-toolbar')).toBeVisible(); await expect(page.locator('.slate-format-toolbar')).toHaveCount(0); await expect(bar).toHaveCount(0); await expect(page.locator('.graph-port')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('cell-toolbar-scope.png') })
})

test('background dots keep their screen spacing through zoom and pan without content writes', async ({ page }, info) => {
  await open(page); await page.getByRole('button', { name: '主菜单', exact: true }).click(); await page.getByRole('menuitemcheckbox', { name: '显示网格' }).click(); await page.keyboard.press('Escape')
  const before = await scene(page), updates = await page.evaluate(() => window.demo.allUpdates.length), host = page.locator('.canvas-host')
  for (const button of ['缩小', '缩小', '缩小', '放大', '放大', '放大', '放大', '放大']) { await page.getByRole('button', { name: button, exact: true }).click(); await expect(host).toHaveCSS('background-size', '20px 20px') }
  await page.getByRole('button', { name: '手型工具 (H / Space)', exact: true }).click(); const p = await hostPoint(page, 600, 400); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 87, p.y + 43, { steps: 10 }); await page.mouse.up()
  await expect(host).toHaveCSS('background-size', '20px 20px'); expect(await scene(page)).toEqual(before); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
  await page.screenshot({ path: info.outputPath('fixed-dot-grid.png') })
})

test('reverse cell drags, Shift ranges and live caret axis actions keep their own selections', async ({ page }, info) => {
  await open(page); const ids = await seed(page, 'table'), before = await scene(page), updates = await page.evaluate(() => window.demo.allUpdates.length)
  const a = await hostPoint(page, 730, 376), b = await hostPoint(page, 390, 282)
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 20 }); await page.mouse.up()
  await expect(page.locator('.table-range-indicator')).toHaveText('3 × 3'); await expect(page.locator('[data-slate-editor]')).toHaveCount(0); await expect(page.locator('.graph-port')).toHaveCount(0)
  expect(await scene(page)).toEqual(before); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
  const toolbar = page.locator('.table-cell-toolbar')
  await toolbar.getByRole('button', { name: '文本对齐', exact: true }).click()
  await toolbar.getByRole('button', { name: '右对齐', exact: true }).click(); await toolbar.getByRole('button', { name: '底部对齐', exact: true }).click()
  await expect(toolbar.getByRole('button', { name: '右对齐', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await toolbar.getByRole('button', { name: '文本对齐', exact: true }).click()
  await toolbar.getByRole('combobox', { name: '选中文字字号', exact: true }).click(); await page.getByRole('option', { name: '18', exact: true }).click()
  await expect(page.locator('.table-range-indicator')).toHaveText('3 × 3')
  const formatted = (await scene(page)).find(n => n.id === ids.id); expect(formatted.children.map(n => n.id)).toEqual(before[0].children.map(n => n.id))
  expect(formatted.children.every(n => n.children[0].verticalAlign === 'bottom' && n.children[0].data.richText.value.every(p => p.align === 'right' && p.children.every(l => l.fontSize === 18)))).toBe(true)
  await page.locator('.canvas-host').click({ position: { x: 390, y: 282 } }); await expect(page.locator('[data-slate-editor]')).toBeFocused()
  await page.keyboard.down('Shift'); await page.locator('.canvas-host').click({ position: { x: 600, y: 328 } }); await page.keyboard.up('Shift')
  await expect(page.locator('.table-range-indicator')).toHaveText('2 × 2')
  await page.locator('.canvas-host').click({ position: { x: 390, y: 282 } }); await page.keyboard.type('caret')
  await expect(page.locator('.slate-format-toolbar')).toBeHidden(); await expect(page.locator('.table-cell-toolbar')).toHaveCount(0)
  await page.getByRole('button', { name: '在第 2 行前插入', exact: true }).click(); await page.evaluate(() => window.demo.handle.flush())
  const after = (await scene(page)).find(n => n.id === ids.id); expect(after.data.rows).toBe(4); expect(after.children.find(n => n.id === before[0].children[0].id).children[0].text).toBe('caret')
  await page.screenshot({ path: info.outputPath('caret-axis-insertion.png') })
  await select(page, ids.id); await expect(page.locator('.selection-actions')).toBeVisible(); await expect(page.locator('.table-cell-toolbar')).toHaveCount(0)
})

test('mind quick-add is outside left, up and down branches and stays there after adding', async ({ page }, info) => {
  await open(page)
  for (const direction of ['left', 'up', 'down']) {
    const ids = await page.evaluate(async direction => {
      window.demo.model.remove(window.demo.model.getValue().scene.children.map(n => n.id))
      const { makeMindMap, layoutMindMap } = await import('/src/editor/runtime/thinking/scene.ts'); const group = makeMindMap(650, 400, 'center', 'branch'), node = group.children.find(n => n.data?.parentId)
      node.data = { ...node.data, mindDirection: direction }; layoutMindMap(group); const id = window.demo.handle.addElement(group.toJSON()).id, nodeId = node.id; group.destroy(); window.demo.handle.flush(); return { id, nodeId }
    }, direction)
    await select(page, ids.nodeId)
    const point = await page.locator('.node-quick-create').boundingBox(), map = (await scene(page)).find(n => n.id === ids.id), branch = map.children.find(n => n.id === ids.nodeId), start = await hostPoint(page, map.x + branch.x, map.y + branch.y)
    if (direction === 'left') expect(point.x + point.width).toBeLessThan(start.x)
    else if (direction === 'up') expect(point.y + point.height).toBeLessThan(start.y)
    else expect(point.y).toBeGreaterThan(start.y + branch.height)
    await page.locator('.node-quick-create').click(); await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
    const next = (await scene(page)).find(n => n.id === ids.id).children.find(n => n.data?.parentId === ids.nodeId); expect(next).toBeTruthy()
    await expect.poll(async () => {
      const bar = await page.locator('.selection-actions').boundingBox(), tools = await page.locator('.toolbar-wrap').boundingBox()
      return bar.x - tools.x - tools.width
    }).toBeGreaterThanOrEqual(8)
    const bar = await page.locator('.selection-actions').boundingBox(); expect(bar.x + bar.width).toBeLessThanOrEqual(1272)
    await page.screenshot({ path: info.outputPath(`mind-add-${direction}.png`) })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.demo.handle.revealElements(window.demo.handle.getSelection().map(n => n.id), { padding: 100, maxZoom: 1 }))
  await expect.poll(async () => {
    const bar = await page.locator('.selection-actions').boundingBox(), tools = await page.locator('.toolbar-wrap').boundingBox()
    return bar.x >= tools.x + tools.width + 8 && bar.x + bar.width <= 382
  }).toBe(true)
  await page.screenshot({ path: info.outputPath('mind-toolbar-mobile.png') })
})

test('elbow vertex edits, removal and bound node moves never introduce diagonal route segments', async ({ page }, info) => {
  await open(page)
  const ids = await page.evaluate(async () => {
    const { makeDiagram, makeConnector } = await import('/src/editor/runtime/thinking/scene.ts'); const a = makeDiagram('rounded', 300, 240, 'source'), b = makeDiagram('rounded', 750, 460, 'target'), edge = makeConnector({ x: 460, y: 280 }, { x: 750, y: 500 }, 'elbow', a.id, b.id)
    edge.data = { ...edge.data, sourceAnchor: { x: 1, y: .5 }, targetAnchor: { x: 0, y: .5 } }; for (const n of [a, b, edge]) window.demo.handle.addElement(n.toJSON()); const ids = { a: a.id, b: b.id, edge: edge.id }; for (const n of [a, b, edge]) n.destroy(); window.demo.handle.flush(); return ids
  })
  const assertRoute = async () => {
    await select(page, ids.edge)
    const route = await page.locator('.graph-route-highlight path').getAttribute('d'), nums = route.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number), points = []
    for (let i = 0; i < nums.length; i += 2) points.push({ x: nums[i], y: nums[i + 1] })
    for (let i = 1; i < points.length; i++) expect(Math.min(Math.abs(points[i].x - points[i - 1].x), Math.abs(points[i].y - points[i - 1].y))).toBeLessThan(.01)
    expect(points.length).toBeLessThanOrEqual(10)
    expect(Math.abs(points[1].y - points[0].y)).toBeLessThan(.01); expect(Math.abs(points.at(-1).y - points.at(-2).y)).toBeLessThan(.01); expect(points[1].x).toBeGreaterThan(points[0].x); expect(points.at(-2).x).toBeLessThan(points.at(-1).x)
  }
  await assertRoute()
  for (let i = 0; i < 8; i++) {
    const handle = await page.locator('.graph-vertex').first().boundingBox(); await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down(); await page.mouse.move(handle.x + 37, handle.y + (i % 2 ? -44 : 44), { steps: 10 }); await page.mouse.up(); await assertRoute()
  }
  await select(page, ids.a); await page.evaluate(() => { window.demo.handle.updateSelection({ x: 350, y: 300 }); window.demo.handle.flush() }); await assertRoute()
  await page.locator('.graph-vertex').first().dblclick(); await assertRoute()
  await page.screenshot({ path: info.outputPath('orthogonal-after-vertex-edits.png') })
})

test('subpixel elbow segments survive convergence instead of becoming diagonal shortcuts', async ({ page }) => {
  await open(page)
  const freeRoutes = await page.evaluate(async () => {
    const { connectorGeometry } = await import('/src/editor/runtime/thinking/scene.ts')
    return [{ x: 100, y: 600 }, { x: 600, y: 100 }].map(to => connectorGeometry({ x: 0, y: 0 }, to).points)
  })
  expect(freeRoutes[0]).toEqual([{ x: 0, y: 0 }, { x: 0, y: 300 }, { x: 100, y: 300 }, { x: 100, y: 600 }])
  expect(freeRoutes[1]).toEqual([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }, { x: 600, y: 100 }])
  const routes = await page.evaluate(async () => {
    const { connectorGeometry } = await import('/src/editor/runtime/thinking/scene.ts')
    return [.001, .01, .1, .3, .5, 1].flatMap(delta => [false, true].map(vertical => {
      const from = { x: 0, y: 0 }, to = vertical ? { x: delta, y: 600 } : { x: 600, y: delta }, vertices = vertical ? [{ x: 0, y: 300 }, { x: delta, y: 300 }] : [{ x: 300, y: 0 }, { x: 300, y: delta }]
      const data = { mode: 'elbow', axis: vertical ? 'y' : 'x', vertices, sourceAnchor: vertical ? { x: .5, y: 1 } : { x: 1, y: .5 }, targetAnchor: vertical ? { x: .5, y: 0 } : { x: 0, y: .5 } }
      const once = connectorGeometry(from, to, data), twice = connectorGeometry(from, to, { ...data, vertices: once.points.slice(1, -1) })
      return { from, to, once: once.routePath, twice: twice.routePath }
    }))
  })
  for (const route of routes) {
    expect(route.once).toBe(route.twice)
    const numbers = route.once.match(/-?\d+(?:\.\d+)?/g).map(Number)
    for (let i = 2; i < numbers.length; i += 2) expect(Math.min(Math.abs(numbers[i] - numbers[i - 2]), Math.abs(numbers[i + 1] - numbers[i - 1]))).toBeLessThan(.000001)
    expect(numbers.slice(0, 2)).toEqual([route.from.x, route.from.y]); expect(numbers.slice(-2)).toEqual([route.to.x, route.to.y])
  }
})

test('old saved diagonal manual routes render as orthogonal without a selection write', async ({ page }) => {
  await open(page)
  const { id, expected } = await page.evaluate(async () => {
    const { makeConnector, connectorGeometry } = await import('/src/editor/runtime/thinking/scene.ts')
    const edge = makeConnector({ x: 350, y: 300 }, { x: 850, y: 500 }, 'elbow')
    edge.data = { ...edge.data, vertices: [{ x: 600, y: 340 }, { x: 600, y: 460 }], sourceAnchor: { x: 1, y: .5 }, targetAnchor: { x: 0, y: .5 } }
    edge.path = 'M350 300L600 340L600 460L850 500'
    const id = window.demo.model.add(edge.toJSON()), expected = connectorGeometry(edge.data.from, edge.data.to, edge.data).path; edge.destroy(); window.demo.handle.flush(); return { id, expected }
  })
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) }); await page.waitForFunction(() => window.demo?.handle)
  const before = await scene(page), updates = await page.evaluate(() => window.demo.allUpdates.length)
  await select(page, id)
  expect(await page.evaluate(() => window.demo.handle.getSelection()[0].path)).toBe(expected)
  expect(await scene(page)).toEqual(before); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
})

test('elbow routes approach every bound port from outside, including reverse connections', async ({ page }) => {
  await open(page)
  const results = await page.evaluate(async () => {
    const { connectorGeometry, connectionPorts } = await import('/src/editor/runtime/thinking/scene.ts'), results = []
    for (const sourceAnchor of connectionPorts) for (const targetAnchor of connectionPorts) for (const to of [{ x: 800, y: 500 }, { x: 200, y: 300 }, { x: 400, y: 300 }, { x: 400, y: 600 }]) {
      const from = { x: 400, y: 300 }, data = { mode: 'elbow', sourceAnchor, targetAnchor }, points = connectorGeometry(from, to, data).points
      const manual = connectorGeometry(from, to, { ...data, vertices: points.slice(1, -1).map((point, index) => ({ x: point.x + (index % 2 ? 170 : -170), y: point.y + 50 })) }).points
      results.push({ sourceAnchor, targetAnchor, points, manual })
    }
    return results
  })
  for (const route of results) for (const points of [route.points, route.manual]) {
    if (points.length === 1) { expect(points[0]).toEqual({ x: 400, y: 300 }); continue }
    expect(points.length).toBeLessThanOrEqual(10)
    for (let i = 1; i < points.length; i++) expect(Math.min(Math.abs(points[i].x - points[i - 1].x), Math.abs(points[i].y - points[i - 1].y))).toBeLessThan(.000001)
    const assertSide = (a, b, anchor) => {
      if (anchor.x === 0 || anchor.x === 1) { expect(b.y).toBeCloseTo(a.y); expect((b.x - a.x) * (anchor.x ? 1 : -1)).toBeGreaterThan(0) }
      else { expect(b.x).toBeCloseTo(a.x); expect((b.y - a.y) * (anchor.y ? 1 : -1)).toBeGreaterThan(0) }
    }
    assertSide(points[0], points[1], route.sourceAnchor); assertSide(points.at(-1), points.at(-2), route.targetAnchor)
  }
})
