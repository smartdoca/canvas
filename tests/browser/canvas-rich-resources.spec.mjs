import { test, expect } from './fixtures.mjs'

test.setTimeout(40000)
const scene = page => page.evaluate(() => window.demo.model.getValue().scene.children)
const point = async (page, x, y) => { const b = await page.locator('.canvas-host').boundingBox(); return { x: b.x + x, y: b.y + y } }
const click = async (page, x, y) => { const p = await point(page, x, y); await page.mouse.click(p.x, p.y) }
async function open(page) {
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.model.remove(window.demo.model.getValue().scene.children.map(n => n.id)))
}
async function seed(page, type, text = '') {
  return page.evaluate(async ({ type, text }) => {
    const { makeTable, makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts')
    const item = type === 'table' ? makeTable(340, 220, 3, 3, [text, 'B', 'C', 'D', 'E']) : makeDiagram('rounded', 340, 220, text, 300, 200)
    if (type === 'card') { item.name = 'card'; item.data = { ...item.data, kind: 'card' }; item.children[1].verticalAlign = 'top' }
    const id = window.demo.handle.addElement(item.toJSON()).id; item.destroy(); window.demo.handle.flush(); return id
  }, { type, text })
}
async function drag(page, locator, dx, dy) {
  const b = await locator.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 12 }); await page.mouse.up()
}
async function pasteFile(page, locator, kind = 'attachment') {
  await locator.evaluate(async (element, kind) => {
    const data = new DataTransfer()
    let file
    if (kind === 'image') { const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 32; const c = canvas.getContext('2d'); c.fillStyle = '#3370ff'; c.fillRect(0, 0, 48, 32); const blob = await new Promise(resolve => canvas.toBlob(resolve)); file = new File([blob], 'idea.png', { type: 'image/png' }) }
    else file = new File(['Project thinking canvas\nDetails'], 'idea.txt', { type: 'text/plain' })
    data.items.add(file); element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }))
  }, kind)
}

test('drag from a live caret across cells, merge, split, reverse drag and select text independently', async ({ page }, info) => {
  await open(page); const id = await seed(page, 'table', 'First cell')
  await click(page, 375, 242); const input = page.locator('[data-slate-editor]'); await expect(input).toBeFocused()
  await expect(page.locator('.selection-actions')).toHaveCount(0); await expect(page.locator('.slate-format-toolbar')).toBeHidden()
  const start = await point(page, 370, 243), end = await point(page, 560, 300)
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 16 }); await page.mouse.up()
  await expect(page.locator('.table-range-indicator')).toHaveText('2 × 2'); await expect(input).toHaveCount(0)
  await page.getByRole('button', { name: '合并选中单元格', exact: true }).click()
  let table = (await scene(page)).find(n => n.id === id); expect(table.children[0].data).toMatchObject({ rowSpan: 2, columnSpan: 2 }); expect(table.children[0].children[0].text).toBe('First cell\nB\nD\nE')
  await page.getByRole('button', { name: '拆分单元格', exact: true }).click()
  await page.mouse.move(end.x, end.y); await page.mouse.down(); await page.mouse.move(start.x, start.y, { steps: 16 }); await page.mouse.up()
  await expect(page.locator('.table-range-indicator')).toHaveText('2 × 2')
  await click(page, 390, 242); await expect(input).toBeFocused(); await page.keyboard.press('Home'); await page.keyboard.press('Shift+End')
  await expect(page.locator('.slate-format-toolbar')).toBeVisible(); await expect(page.locator('.table-cell-toolbar')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('cell-text-selection.png') })
  table = (await scene(page)).find(n => n.id === id); expect(table.data.rowHeights[0]).toBe(46)
})

for (const type of ['card', 'table']) test(`${type}: click edits shared top aligned text; wrapped overflow scrolls; hand selects and moves container`, async ({ page }, info) => {
  await open(page); const id = await seed(page, type)
  await click(page, 380, 244); const input = page.locator('[data-slate-editor]'); await expect(input).toBeFocused()
  await expect(input).toHaveCSS('overflow-y', 'auto'); await expect(input).toHaveCSS('overflow-x', 'hidden'); await expect(input).toHaveCSS('padding-top', '0px'); await expect(input).toHaveCSS('outline-style', 'none')
  for (let i = 0; i < 9; i++) { await page.keyboard.insertText(`${i} 这是超长的发散思考与行动项 abcdefghijklmnopqrstuvwxyz`); if (i < 8) await page.keyboard.press('Enter') }
  expect(await input.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true)
  expect(await input.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await expect(page.locator('.slate-format-toolbar')).toBeHidden(); await expect(page.locator('.rich-object-move-handle')).toBeVisible()
  await page.screenshot({ path: info.outputPath(`${type}-scroll-caret.png`) })
  await page.locator('.rich-object-move-handle').click(); await expect(input).toHaveCount(0)
  await expect(page.locator('.selection-actions')).toBeVisible()
  await page.locator('.selection-actions').getByRole('button', { name: '文本对齐', exact: true }).click()
  await page.getByRole('menu', { name: '文本对齐', exact: true }).getByRole('button', { name: '底部对齐', exact: true }).click()
  let node = (await scene(page)).find(n => n.id === id), label = type === 'table' ? node.children[0].children[0] : node.children[1]
  expect(label.verticalAlign).toBe('bottom')
  await page.getByRole('menu', { name: '文本对齐', exact: true }).getByRole('button', { name: '顶部对齐', exact: true }).click()
  await drag(page, page.locator('.rich-object-move-handle'), 90, 60); await page.evaluate(() => window.demo.handle.flush())
  node = (await scene(page)).find(n => n.id === id); expect(node.x).toBeCloseTo(430); expect(node.y).toBeCloseTo(280)
  if (type === 'table') expect(node.data.rowHeights).toEqual([46, 46, 46]); else expect(node.height).toBe(200)
  await page.evaluate(() => window.demo.handle.undo()); node = (await scene(page)).find(n => n.id === id); expect(node.x).toBe(340); expect(node.y).toBe(220)
})

for (const type of ['card', 'table']) test(`${type}: paste image and attachment as real Slate void blocks, preview, clipboard and delete/undo`, async ({ page }, info) => {
  await open(page); const id = await seed(page, type)
  await click(page, 380, 244); const input = page.locator('[data-slate-editor]')
  await pasteFile(page, input, 'image'); await expect(input.locator('[data-resource-kind=image] img')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+End'); await pasteFile(page, input)
  const file = input.locator('[data-resource-kind=attachment]'); await expect(file).toContainText('idea.txt')
  await file.locator('.rich-file-chip').click(); await file.getByRole('button', { name: '预览附件' }).click()
  expect(await page.evaluate(() => window.demo.resourceLog.filter(e => e.type === 'preview').at(-1).resource)).toMatchObject({ kind: 'attachment', name: 'idea.txt', mimeType: 'text/plain' })
  const fragment = await input.evaluate(element => { const clipboardData = new DataTransfer(); element.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData })); return Object.fromEntries(clipboardData.types.map(type => [type, clipboardData.getData(type)])) })
  expect(fragment['application/x-slate-fragment']).toBeTruthy()
  await page.keyboard.press('Backspace'); await expect(file).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+z'); await expect(file).toHaveCount(1)
  await input.locator(':scope > [data-slate-node=element]').last().click()
  await input.evaluate((element, fragment) => { const clipboardData = new DataTransfer(); for (const [type, value] of Object.entries(fragment)) clipboardData.setData(type, value); element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData })) }, fragment)
  await expect(file).toHaveCount(2)
  await page.screenshot({ path: info.outputPath(`${type}-rich-media.png`) })
  await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  const node = (await scene(page)).find(n => n.id === id), label = type === 'table' ? node.children[0].children[0] : node.children[1]
  const media = label.data.richText.value.filter(p => p.resource)
  expect(media.map(p => p.resource.kind)).toEqual(['image', 'attachment', 'attachment']); expect(label.text.match(/\uFFFC/g)).toHaveLength(3); expect(media[1].resource.id).not.toBe(media[2].resource.id); expect(media[1].resource.path).toBe(media[2].resource.path)
  expect(JSON.stringify(node)).not.toMatch(/data:|blob:/)
  const exported = await page.evaluate(async () => { const value = window.demo.model.getValue(), updates = window.demo.allUpdates.length; const svg = await (await window.demo.handle.exportFile({ format: 'svg' })).blob.text(); return { svg, unchanged: JSON.stringify(window.demo.model.getValue()) === JSON.stringify(value), updates: window.demo.allUpdates.length - updates } })
  expect(exported.svg).toContain('data:image/'); expect(exported.svg).toContain('idea.txt'); expect(exported.unchanged).toBe(true); expect(exported.updates).toBe(0)
})

test('canvas paste and drop files use host storage once; media and host custom elements have connectable ports', async ({ page }, info) => {
  await open(page); await page.locator('.canvas-app').focus(); await pasteFile(page, page.locator('.canvas-app'), 'image');
  await expect.poll(async () => (await scene(page)).filter(n => n.tag === 'Image').length).toBe(1)
  await page.locator('.canvas-app').evaluate(element => { const dataTransfer = new DataTransfer(); dataTransfer.items.add(new File(['payload'], 'board.txt', { type: 'text/plain' })); const b = element.getBoundingClientRect(); element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientX: b.x + 400, clientY: b.y + 320 })) })
  await expect.poll(async () => (await scene(page)).filter(n => n.name === 'attachment').length).toBe(1)
  const nodes = await scene(page); expect(await page.evaluate(() => window.demo.resourceLog.filter(e => e.type === 'upload').length)).toBe(2)
  const file = nodes.find(n => n.name === 'attachment'); expect(file).toMatchObject({ x: 400, y: 320 })
  await page.evaluate(id => window.demo.handle.select([id]), file.id); await expect(page.locator('.graph-port.is-selected')).toHaveCount(4)
  await page.getByRole('button', { name: '预览附件', exact: true }).click(); expect(await page.evaluate(() => window.demo.resourceLog.at(-1).type)).toBe('preview')
  const image = nodes.find(n => n.tag === 'Image'); await page.evaluate(id => window.demo.handle.select([id]), image.id); await expect(page.locator('.graph-port.is-selected')).toHaveCount(4)
  await expect(page.locator(`.graph-port.is-selected[data-node-id="${image.id}"]`)).toHaveCount(4)
  const port = page.locator('.graph-port.is-selected').and(page.getByRole('button', { name: '从右侧创建连线', exact: true })), b = await port.boundingBox(), target = await point(page, 400, 358)
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(target.x, target.y, { steps: 12 }); await page.mouse.up()
  expect((await scene(page)).find(n => n.data?.kind === 'connector').data).toMatchObject({ sourceId: image.id, targetId: file.id })
  await page.screenshot({ path: info.outputPath('canvas-image-attachment.png') })
  expect(JSON.stringify(await scene(page))).not.toMatch(/data:|blob:/)
  const before = await scene(page), updates = await page.evaluate(() => window.demo.allUpdates.length)
  await page.evaluate(() => window.demo.setMode('readonly')); await pasteFile(page, page.locator('.canvas-app'))
  expect(await scene(page)).toEqual(before); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
})

test('upload failure retries at captured rich selection, and readonly aborts pending insertion', async ({ page }) => {
  await open(page); const id = await seed(page, 'card', 'before after')
  await click(page, 400, 250); const input = page.locator('[data-slate-editor]'); await page.keyboard.press('Home'); for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight')
  await page.evaluate(() => { window.demo.resourceControls.failUpload = true })
  await pasteFile(page, input); await expect(page.getByText('上传失败', { exact: true })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.insertText(' keep')
  await page.evaluate(() => { window.demo.resourceControls.failUpload = false }); await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(input.locator('[data-resource-kind=attachment]')).toHaveCount(1)
  await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  const node = (await scene(page)).find(n => n.id === id); expect(node.children[1].text).toContain('keep')
  await click(page, 380, 250); await page.evaluate(() => { window.demo.resourceControls.hold = true }); await pasteFile(page, input)
  await expect(page.getByRole('button', { name: '取消上传', exact: true })).toBeVisible()
  await page.evaluate(() => window.demo.setMode('readonly')); const before = await scene(page)
  await page.evaluate(() => { window.demo.resourceControls.complete?.() }); await expect.poll(() => scene(page)).toEqual(before)
})

test('connector near alignment shows a guide and collapses redundant collinear control points on release', async ({ page }, info) => {
  await open(page)
  await page.evaluate(async () => {
    const { makeConnector } = await import('/src/editor/runtime/thinking/scene.ts')
    const edge = makeConnector({ x: 300, y: 240 }, { x: 900, y: 240 }, 'elbow')
    edge.data = { ...edge.data, axis: 'x', vertices: [{ x: 430, y: 240 }, { x: 430, y: 370 }, { x: 720, y: 370 }, { x: 720, y: 240 }] }
    window.demo.handle.addElement(edge.toJSON()); window.demo.handle.select([edge.id]); window.demo.handle.flush(); edge.destroy()
  })
  const handle = page.locator('.graph-segment[data-axis=y]').filter({ visible: true }).nth(1), box = await handle.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 126, { steps: 16 })
  await expect(page.locator('.graph-align-guide')).toHaveCount(1); await expect(page.locator('.graph-align-label')).toBeVisible()
  await page.screenshot({ path: info.outputPath('connector-snap-guide.png') })
  await page.mouse.up(); const edge = (await scene(page))[0]
  expect(edge.data.vertices).toEqual([]); await expect(page.locator('.graph-vertex')).toHaveCount(0); await expect(page.locator('.graph-align-label')).toHaveCount(0)
})

test('standalone undo keeps pan and zoom; host custom element remains connectable; legacy rough tools are removed', async ({ page }, info) => {
  const key = `undo-view-${Date.now()}`
  await page.route('**/src/demo/DemoApp.tsx*', async route => { const response = await route.fetch(), source = await response.text(); await route.fulfill({ response, body: source.replace('resources: demoResources,', 'resources: demoResources, onReady: handle => window.solo = handle,') }) })
  await page.goto(`/?document=${key}`); await page.waitForFunction(() => window.solo)
  const id = await page.evaluate(() => window.solo.addExtensionElement('demo-badge', { x: 420, y: 260, width: 200, height: 100 }).id)
  await expect(page.locator('.graph-port.is-selected')).toHaveCount(4)
  await page.evaluate(() => window.solo.flush())
  await page.evaluate(() => { window.solo.updateSelection({ x: 510 }); window.solo.flush() })
  const p = await point(page, 1000, 560); await page.mouse.move(p.x, p.y); await page.mouse.wheel(100, 80); await page.keyboard.down('Control'); await page.mouse.wheel(0, -100); await page.keyboard.up('Control')
  await expect(page.locator('.zoom-value')).not.toHaveText('100%')
  const before = await page.evaluate(p => window.solo.clientToScene(p), p), zoom = await page.locator('.zoom-value').innerText()
  await page.evaluate(() => window.solo.undo()); expect(await page.evaluate(p => window.solo.clientToScene(p), p)).toEqual(before); expect(await page.locator('.zoom-value').innerText()).toBe(zoom)
  expect(await page.evaluate(id => window.solo.getValue().scene.children.find(n => n.id === id).x, id)).toBe(420)
  await page.evaluate(() => window.solo.redo()); expect(await page.evaluate(p => window.solo.clientToScene(p), p)).toEqual(before)
  await page.getByRole('button', { name: '更多工具', exact: true }).hover(); await expect(page.locator('.board-legacy-grid .toolbar-tool')).toHaveCount(0)
  expect(await page.evaluate(async () => (await fetch('/package.json')).json())).not.toHaveProperty('dependencies.roughjs')
  await page.screenshot({ path: info.outputPath('undo-view-custom.png') })
})


test('rich media synchronize into an active peer, reopen atomically and readonly selection writes nothing', async ({ page, context }) => {
  await open(page); const id = await seed(page, 'card', 'shared')
  const peer = await context.newPage(); await peer.goto(await page.evaluate(() => window.demo.link)); await peer.waitForFunction(() => window.demo?.handle)
  await click(peer, 380, 244); const peerInput = peer.locator('[data-slate-editor]'); await expect(peerInput).toBeFocused()
  await click(page, 380, 244); const input = page.locator('[data-slate-editor]'); await page.keyboard.press('ControlOrMeta+End')
  const beforePeer = await peer.evaluate(() => window.demo.allUpdates.length)
  await pasteFile(page, input); await expect(input.locator('[data-resource-kind=attachment]')).toHaveCount(1)
  await expect(peerInput.locator('[data-resource-kind=attachment]')).toHaveCount(1)
  expect(await peer.evaluate(() => window.demo.allUpdates.length)).toBe(beforePeer)
  await page.keyboard.press('Escape'); await peer.keyboard.press('Escape')
  await expect.poll(async () => JSON.stringify(await scene(page)) === JSON.stringify(await scene(peer))).toBe(true)
  const saved = await scene(page)
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) }); await page.waitForFunction(() => window.demo?.handle)
  expect(await scene(page)).toEqual(saved)
  await page.evaluate(() => window.demo.setMode('readonly'))
  const node = saved.find(n => n.id === id), resource = node.children[1].data.richText.value.find(p => p.resource).resource
  const position = await page.evaluate(async id => { const handle = window.demo.handle, { readRich, richLayout } = await import('/src/editor/runtime/thinking/richText.ts'); void readRich; void richLayout; return handle.revealElements([id]).bounds }, id)
  await click(page, position.x + 25, position.y + 50)
  expect(await page.evaluate(() => window.demo.resourceLog.filter(e => e.type === 'preview').length)).toBe(0)
  expect(resource.path).toBeTruthy()
  expect(await scene(page)).toEqual(saved); await peer.close()
})

test('multi-file input preserves order and canceling a failed batch releases the next file', async ({ page }) => {
  await open(page); await seed(page, 'card', 'batch')
  await click(page, 380, 244); const input = page.locator('[data-slate-editor]')
  await page.evaluate(() => { window.demo.resourceControls.failUpload = true })
  await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.press('Enter')
  await page.getByRole('button', { name: '插入内容', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.locator('.slate-row-menu').getByRole('button', { name: '插入附件', exact: true }).click()
  await (await chooser).setFiles([{ name: 'first.txt', mimeType: 'text/plain', buffer: Buffer.from('first') }, { name: 'second.txt', mimeType: 'text/plain', buffer: Buffer.from('second') }])
  await expect(page.getByText('上传失败', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.demo.resourceLog.filter(e => e.type === 'upload').length)).toBe(1)
  await page.evaluate(() => { window.demo.resourceControls.failUpload = false })
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(input.locator('[data-resource-kind=attachment]')).toHaveCount(2)
  expect(await input.locator('.rich-file-chip > span:last-child').allTextContents()).toEqual(['first.txt1 KB', 'second.txt1 KB'])
})

test('synchronous host selection and clipboard commands always use the current cells', async ({ page }) => {
  await open(page); const id = await seed(page, 'table', 'live source')
  const result = await page.evaluate(id => {
    const table = window.demo.model.getValue().scene.children.find(n => n.id === id), app = document.querySelector('.canvas-app')
    const clipboardData = new DataTransfer()
    window.demo.handle.select([table.children[0].id]); app.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData }))
    for (const index of [1, 4, 8]) {
      window.demo.handle.select([table.children[index].id]); app.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }))
    }
    window.demo.handle.flush()
    return window.demo.model.getValue().scene.children.find(n => n.id === id).children.map(n => n.children[0].text)
  }, id)
  for (const index of [0, 1, 4, 8]) expect(result[index]).toBe('live source')
})
