import { test, expect } from './fixtures.mjs'

async function open(page) {
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.model.remove(window.demo.model.getValue().scene.children.map(n => n.id)))
}
const scene = page => page.evaluate(() => window.demo.model.getValue().scene.children)
const find = (nodes, id) => { for (const n of nodes) { if (n.id === id) return n; const child = n.children && find(n.children, id); if (child) return child } }
async function point(page, id) {
  const bounds = await page.evaluate(id => window.demo.handle.revealElements([id], { maxZoom: 1 }).bounds, id)
  const host = await page.locator('.canvas-host').boundingBox()
  return { x: host.x + bounds.x + bounds.width / 2, y: host.y + bounds.y + bounds.height / 2 }
}
async function drag(page, start, dx, dy) {
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + dx, start.y + dy, { steps: 12 }); await page.mouse.up()
  await page.evaluate(() => window.demo.handle.flush())
}

test('flowchart click selects, body drag moves the whole node and bound line; double-click edits plain labels', async ({ page }, info) => {
  await open(page)
  const ids = await page.evaluate(async () => {
    const { makeDiagram, makeConnector } = await import('/src/editor/runtime/thinking/scene.ts')
    const a = makeDiagram('rounded', 340, 250, '应用层', 220, 100), b = makeDiagram('rounded', 800, 410, '存储')
    const line = makeConnector({ x: 560, y: 300 }, { x: 800, y: 450 }, 'elbow', a.id, b.id)
    line.data = { ...line.data, sourceAnchor: { x: 1, y: .5 }, targetAnchor: { x: 0, y: .5 } }
    const result = { node: a.id, label: a.children[1].id, line: line.id }
    for (const item of [a, b, line]) { window.demo.handle.addElement(item.toJSON()); item.destroy() }
    window.demo.handle.select([]); return result
  })
  const before = await scene(page), a = find(before, ids.node), label = find(before, ids.label)
  expect(label.verticalAlign).toBe('middle')
  const p = await point(page, ids.node); await page.mouse.click(p.x, p.y)
  await expect.poll(() => page.evaluate(() => window.demo.handle.getSelection().map(n => n.id))).toEqual([ids.node])
  await expect(page.locator('.leafer-text-editor')).toHaveCount(0); await expect(page.locator('.rich-object-move-handle')).toHaveCount(0)
  await expect(page.locator('.selection-actions')).toBeVisible()
  await drag(page, p, 90, -40)
  let current = await scene(page)
  expect(find(current, ids.node)).toMatchObject({ x: a.x + 90, y: a.y - 40 })
  expect(find(current, ids.label)).toEqual(label)
  expect(find(current, ids.line).data.from).not.toEqual(find(before, ids.line).data.from)
  const moved = await point(page, ids.node); await page.mouse.dblclick(moved.x, moved.y)
  const input = page.locator('.canvas-plain-text-editor')
  await expect(input).toBeFocused(); await expect(page.locator('[data-slate-editor],.slate-format-toolbar,.rich-insert-tools,.rich-object-move-handle,.graph-create-picker')).toHaveCount(0)
  await input.fill('**原样文字**'); await page.keyboard.press('End'); await page.keyboard.press('Enter'); await page.keyboard.insertText('第二行')
  await page.keyboard.press('Meta+b'); await page.keyboard.press('Meta+k')
  await expect(input.locator('b,strong,a')).toHaveCount(0)
  await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  current = await scene(page)
  expect(find(current, ids.label).text).toBe('**原样文字**\n第二行'); expect(find(current, ids.label).data?.richText).toBeUndefined()
  await expect.poll(() => page.evaluate(() => window.demo.handle.getSelection().map(n => n.id))).toEqual([ids.node])
  await drag(page, await point(page, ids.node), -30, 40)
  expect(find(await scene(page), ids.node)).toMatchObject({ x: a.x + 60, y: a.y })
  await page.screenshot({ path: info.outputPath('flowchart-plain-label.png') })
  await page.evaluate(() => window.demo.setMode('readonly')); const saved = await scene(page)
  const readonly = await point(page, ids.node); await page.mouse.dblclick(readonly.x, readonly.y)
  await expect(input).toHaveCount(0); expect(await scene(page)).toEqual(saved)
})

test('mind topics use native plain label editing and return selection to the topic for dragging', async ({ page }, info) => {
  await open(page)
  const ids = await page.evaluate(async () => {
    const { makeMindMap } = await import('/src/editor/runtime/thinking/scene.ts')
    const map = makeMindMap(520, 340, '中心主题', 'branch'), node = map.children.find(n => n.data?.root)
    const result = { node: node.id, label: node.children[0].id }; window.demo.handle.addElement(map.toJSON()); map.destroy(); window.demo.handle.select([]); return result
  })
  const p = await point(page, ids.node); await page.mouse.click(p.x, p.y)
  await expect(page.locator('.leafer-text-editor')).toHaveCount(0)
  // Finish the standalone single-click gesture before testing a double-click.
  await page.waitForTimeout(550)
  await page.mouse.dblclick(p.x, p.y); const input = page.locator('.canvas-plain-text-editor')
  await expect(input).toBeFocused(); await expect(page.locator('[data-slate-editor],.rich-object-move-handle')).toHaveCount(0)
  await input.fill('# 原样主题'); await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  expect(find(await scene(page), ids.label).text).toBe('# 原样主题'); expect(find(await scene(page), ids.label).data?.richText).toBeUndefined()
  const before = find(await scene(page), ids.node)
  await drag(page, await point(page, ids.node), 40, 30)
  expect(find(await scene(page), ids.node)).toMatchObject({ x: before.x + 40, y: before.y + 30 })
  await page.screenshot({ path: info.outputPath('mind-plain-label.png') })
})

test('ordinary text keeps literal Markdown and strips pasted HTML without creating rich data', async ({ page }) => {
  await open(page)
  const id = await page.evaluate(() => window.demo.handle.addElement({ tag: 'Text', name: 'text', text: '普通文字', x: 360, y: 260, fontSize: 20, editable: true }).id)
  const p = await point(page, id); await page.mouse.click(p.x, p.y)
  await expect(page.locator('.leafer-text-editor')).toHaveCount(0)
  await page.waitForTimeout(550)
  await page.mouse.dblclick(p.x, p.y); const input = page.locator('.canvas-plain-text-editor'); await expect(input).toBeFocused()
  await input.fill('# Heading **bold**')
  await page.keyboard.press('End')
  await input.evaluate(element => { const data = new DataTransfer(); data.setData('text/plain', ' plain paste'); data.setData('text/html', '<strong>HTML</strong>'); element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })) })
  await expect(input.locator('strong,[data-slate-node]')).toHaveCount(0)
  await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  expect(find(await scene(page), id).text).toBe('# Heading **bold** plain paste'); expect(find(await scene(page), id).data?.richText).toBeUndefined()
})

test('active multiline plain labels retain the caret through peer insertion and own undo', async ({ page, context }) => {
  await open(page)
  const id = await page.evaluate(() => window.demo.handle.addElement({ tag: 'Text', name: 'text', text: 'First\nSecond', x: 360, y: 260, fontSize: 20, editable: true }).id)
  const peer = await context.newPage(); await peer.goto(await page.evaluate(() => window.demo.link)); await peer.waitForFunction(() => window.demo?.handle)
  const p = await point(page, id); await page.mouse.dblclick(p.x, p.y)
  const input = page.locator('.canvas-plain-text-editor'); await expect(input).toBeFocused(); await page.keyboard.press('ArrowRight')
  const before = await page.evaluate(() => window.demo.allUpdates.length)
  await peer.evaluate(id => window.demo.model.editText(id, 0, 0, 'Remote '), id)
  await expect(input).toHaveText('Remote First\nSecond', { useInnerText: true }); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(before)
  await page.keyboard.insertText('!'); await page.evaluate(() => window.demo.handle.flush())
  expect(find(await scene(page), id).text).toBe('Remote First\nSecond!')
  await page.keyboard.press('Meta+z'); await expect(input).toHaveText('Remote First\nSecond', { useInnerText: true })
  await page.keyboard.press('Meta+Shift+z'); await expect(input).toHaveText('Remote First\nSecond!', { useInnerText: true })
  await page.keyboard.press('Escape'); await expect.poll(async () => JSON.stringify(await scene(page)) === JSON.stringify(await scene(peer))).toBe(true)
  await peer.close()
})
