import { test, expect } from './fixtures.mjs'
const scene = page => page.evaluate(() => window.demo.model.getValue().scene)
const find = (scene, id) => { const visit = nodes => nodes.flatMap(n => [n, ...visit(n.children || [])]); return visit(scene.children).find(n => n.id === id) }
async function open(page) {
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.model.remove(window.demo.model.getValue().scene.children.map(n => n.id)))
}
async function note(page) {
  await page.evaluate(() => {
    window.demo.handle.addElement({ id: 'issue-note', tag: 'Frame', name: 'note', x: 340, y: 200, width: 360, height: 300, fill: '#fff2a8', editable: true, data: { kind: 'note' }, children: [{ id: 'issue-label', tag: 'Text', name: 'text', x: 16, y: 16, width: 328, height: 268, fontSize: 24, text: '反向代理\nSSL证书', textAlign: 'center', verticalAlign: 'middle', editable: true }] })
    window.demo.handle.flush(); window.demo.handle.select(['issue-note'])
  })
}

for (const empty of [false, true]) test(`row 52: note left/top alignment survives redo/reopen (empty=${empty})`, async ({ page }) => {
  await open(page); await note(page)
  if (empty) await page.evaluate(() => window.demo.model.patch('issue-label', { text: '' }))
  await page.locator('.selection-actions').getByRole('button', { name: '文本对齐', exact: true }).click()
  const menu = page.getByRole('menu', { name: '文本对齐', exact: true })
  await menu.getByRole('button', { name: '右对齐', exact: true }).click(); await menu.getByRole('button', { name: '底部对齐', exact: true }).click()
  await menu.getByRole('button', { name: '左对齐', exact: true }).click(); await menu.getByRole('button', { name: '顶部对齐', exact: true }).click()
  await expect(menu.getByRole('button', { name: '左对齐', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(menu.getByRole('button', { name: '顶部对齐', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const value = await scene(page), label = find(value, 'issue-label')
  expect(label.textAlign || 'left').toBe('left'); expect(label.verticalAlign || 'top').toBe('top')
  await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.select(['issue-label']))
  await page.locator('.canvas-app').focus(); await page.keyboard.press('Enter')
  await expect(page.locator('[data-slate-editor]')).toHaveCSS('text-align', 'left')
  await page.keyboard.press('Escape'); await page.evaluate(() => { window.demo.handle.undo(); window.demo.handle.redo() })
  expect(await scene(page)).toEqual(value)
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await page.waitForFunction(() => window.demo?.handle); expect(await scene(page)).toEqual(value)
})

test('table handle paints the entire moving table and attached connector continuously, without a ghost rectangle or intermediate commits', async ({ page, context }, info) => {
  await open(page)
  const ids = await page.evaluate(async () => {
    const { makeTable, makeDiagram, makeConnector } = await import('/src/editor/runtime/thinking/scene.ts')
    const table = makeTable(460, 240, 2, 3, ['项目', '状态', '备注']), box = makeDiagram('rounded', 180, 440, 'source')
    const line = makeConnector({ x: 340, y: 480 }, { x: 460, y: 286 }, 'elbow', box.id, table.id)
    line.data = { ...line.data, sourceAnchor: { x: 1, y: .5 }, targetAnchor: { x: 0, y: .5 } }
    for (const item of [table, box, line]) window.demo.handle.addElement(item.toJSON())
    const ids = { table: table.id, line: line.id }; for (const item of [table, box, line]) item.destroy()
    window.demo.handle.flush(); window.demo.handle.select([ids.table]); return ids
  })
  const peer = await context.newPage(); await peer.goto(await page.evaluate(() => window.demo.link)); await peer.waitForFunction(() => window.demo?.handle)
  const before = await scene(page), updates = await page.evaluate(() => window.demo.allUpdates.length), handle = page.locator('.rich-object-move-handle'), b = await handle.boundingBox()
  const start = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  const drag = async () => { await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 180, start.y + 140, { steps: 12 }) }
  await drag()
  await expect(page.locator('.rich-object-drag-preview')).toHaveCount(0)
  const painted = await page.evaluate(async () => {
    const { Leafer } = await import('/node_modules/.vite/deps/leafer-ui.js'), app = Leafer.list.list.find(item => item.isApp)
    return app.tree.children.filter(item => item.skipJSON && item.name === 'object-drag-preview').map(item => ({ kind: item.data?.kind, x: item.x, y: item.y, path: item.path, children: item.children?.map(child => child.children?.[0]?.text) }))
  })
  expect(painted.find(item => item.kind === 'table')).toMatchObject({ x: 640, y: 380 })
  expect(painted.find(item => item.kind === 'table').children).toContain('项目')
  expect(painted.find(item => item.kind === 'connector').path).not.toBe(find(before, ids.line).path)
  expect(await scene(page)).toEqual(before); expect(await scene(peer)).toEqual(before)
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
  await page.screenshot({ path: info.outputPath('table-live-drag.png') })
  await page.keyboard.press('Escape'); await page.mouse.up(); expect(await scene(page)).toEqual(before)
  await drag(); await page.mouse.up()
  const after = await scene(page); expect(find(after, ids.table)).toMatchObject({ x: 640, y: 380 })
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates + 1)
  await expect.poll(() => scene(peer)).toEqual(after)
  await page.evaluate(() => window.demo.handle.undo()); expect(await scene(page)).toEqual(before)
  await page.evaluate(() => window.demo.handle.redo()); expect(await scene(page)).toEqual(after)
  await peer.close()
})

test('rows 47/60: controlled preferences do not rewrite old content and style only newly drawn elements', async ({ page }) => {
  await open(page); await note(page)
  const before = await scene(page), updates = await page.evaluate(() => window.demo.allUpdates.length)
  await page.evaluate(() => {
    window.demo.setViewPreferences({ version: 1, gridVisible: true, gridPattern: 'lines', backgroundColor: '#edf3ff', minimapVisible: true, outlineVisible: false })
    window.demo.setCreationPreferences({ version: 1, connector: { mode: 'curve', stroke: '#9254de', strokeWidth: 4, lineDash: 'dashed', startHead: 'circle', endHead: 'triangle' }, note: { preset: 'mint', fontSize: 18, textAlign: 'left', verticalAlign: 'top' } })
  })
  await expect(page.locator('.canvas-stage')).toHaveAttribute('data-grid-pattern', 'lines')
  await expect(page.locator('.canvas-host')).toHaveCSS('background-color', 'rgb(237, 243, 255)')
  await expect(page.locator('.board-minimap')).toBeVisible()
  expect(await scene(page)).toEqual(before); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
  await page.locator('.board-tool-button[data-canvas-insert="note"]').click()
  await expect(page.locator('.canvas-stage')).toHaveAttribute('data-active-tool', 'note')
  await page.locator('.canvas-host').click({ position: { x: 850, y: 300 } })
  await expect.poll(async () => (await scene(page)).children.length).toBe(2)
  const afterNote = await scene(page), created = afterNote.children.find(item => item.id !== 'issue-note')
  expect(created.fill).toBe('#dcefe4'); expect(created.children[0]).toMatchObject({ fontSize: 18 })
  expect(created.children[0].textAlign || 'left').toBe('left'); expect(created.children[0].verticalAlign || 'top').toBe('top')
  expect(find(afterNote, 'issue-note')).toEqual(find(before, 'issue-note'))
  await page.locator('.board-tool-group[data-tool="connector"] > button').click()
  await expect(page.locator('.canvas-stage')).toHaveAttribute('data-active-tool', 'connector:curve')
  await page.locator('.canvas-host').hover({ position: { x: 800, y: 520 } }); await page.mouse.down(); await page.mouse.move(1050, 620, { steps: 12 }); await page.mouse.up()
  await expect.poll(async () => (await scene(page)).children.some(item => item.data?.kind === 'connector')).toBe(true)
  const edge = (await scene(page)).children.find(item => item.data?.kind === 'connector')
  expect(edge).toMatchObject({ stroke: '#9254de', strokeWidth: 4, dashPattern: [8, 5], data: { mode: 'curve', startHead: 'circle', endHead: 'triangle' } })
  const saved = await scene(page)
  await page.evaluate(() => window.demo.handle.select(['issue-note']))
  await page.getByRole('button', { name: '主菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '将选中样式用作新建默认', exact: true }).click()
  expect(await scene(page)).toEqual(saved)
  expect(await page.evaluate(() => window.demo.preferenceLog.at(-1))).toMatchObject({ kind: 'creation', value: { version: 1, note: { textAlign: 'center', verticalAlign: 'middle' } } })
})

test('row 47: left menu paints above tools and minimap blank-space clicks navigate without changing zoom or content', async ({ page }, info) => {
  await open(page); await note(page)
  await page.evaluate(() => window.demo.handle.addElement({ id: 'far-box', tag: 'Rect', name: 'rect', x: 4000, y: 1800, width: 280, height: 180, fill: '#eaf1ff', editable: true }))
  await page.evaluate(() => window.demo.handle.flush())
  const before = await scene(page), updates = await page.evaluate(() => window.demo.allUpdates.length)
  await page.getByRole('button', { name: '主菜单', exact: true }).click()
  const menu = page.getByRole('menu', { name: '主菜单', exact: true }), stage = await page.locator('.canvas-stage').boundingBox(), b = await menu.boundingBox()
  expect(b.x - stage.x).toBeLessThan(80)
  expect(await menu.evaluate(el => { const b = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(b.x + 15, Math.min(b.bottom - 20, b.top + 200))) })).toBe(true)
  await page.screenshot({ path: info.outputPath('left-view-menu.png') })
  await page.getByRole('menuitemcheckbox', { name: '小地图', exact: true }).click()
  const map = page.locator('.board-minimap svg'), point = await map.evaluate(svg => { const p = new DOMPoint(2200, 1000).matrixTransform(svg.getScreenCTM()); return { x: p.x, y: p.y } })
  const zoom = await page.locator('.zoom-value').textContent()
  await page.mouse.click(point.x, point.y)
  const host = await page.locator('.canvas-host').boundingBox(), center = await page.evaluate(host => window.demo.handle.clientToScene({ x: host.x + host.width / 2, y: host.y + host.height / 2 }), host)
  expect(center.x).toBeCloseTo(2200, 0); expect(center.y).toBeCloseTo(1000, 0)
  await expect(page.locator('.zoom-value')).toHaveText(zoom)
  expect(await scene(page)).toEqual(before); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
})

for (const surface of ['rich', 'plain']) test(`row 25: Ctrl+A and Cmd+A select only focused ${surface} text`, async ({ page }) => {
  await open(page); await note(page)
  if (surface === 'plain') await page.evaluate(async () => {
    const { makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts'), item = makeDiagram('rounded', 760, 300, 'label text')
    window.demo.handle.addElement(item.toJSON()); const id = item.children[1].id; item.destroy(); window.demo.handle.flush(); window.demo.handle.select([id])
  }); else await page.evaluate(() => window.demo.handle.select(['issue-label']))
  await page.locator('.canvas-app').focus(); await page.keyboard.press('Enter')
  const input = page.locator(surface === 'rich' ? '[data-slate-editor]' : '.canvas-plain-text-editor')
  await expect(input).toBeFocused(); const before = await scene(page)
  for (const key of ['Control+a', 'Meta+a']) {
    await page.keyboard.press('ArrowRight'); await page.keyboard.press(key)
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(surface === 'rich' ? '反向代理\nSSL证书' : 'label text')
    expect(await scene(page)).toEqual(before)
    expect(await page.evaluate(() => window.demo.handle.getSelection().length)).toBe(1)
  }
})

test('row 36: PNG export has no vector-font embedding warning, SVG retains the fidelity notice', async ({ page }) => {
  await open(page); await note(page)
  for (const format of ['png', 'svg']) {
    const result = await page.evaluate(async format => { const out = await window.demo.handle.exportFile({ format }); return { size: out.blob.size, codes: out.warnings.map(w => w.code) } }, format)
    expect(result.size).toBeGreaterThan(100)
    expect(result.codes.includes('FONT_NOT_EMBEDDED_SYSTEM_FALLBACK')).toBe(format === 'svg')
  }
})

test('row 43: quick stroke width and dash update both selected diagram bodies', async ({ page }) => {
  await open(page)
  const ids = await page.evaluate(async () => {
    const { makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts')
    const nodes = [makeDiagram('rounded', 280, 240, 'one'), makeDiagram('rect', 650, 360, 'two')]
    const ids = nodes.map(node => window.demo.handle.addElement(node.toJSON()).id); nodes.forEach(node => node.destroy())
    window.demo.handle.flush(); window.demo.handle.select(ids); return ids
  })
  const bar = page.locator('.selection-actions')
  await bar.getByRole('combobox', { name: '线宽', exact: true }).click(); await page.getByRole('option', { name: '6', exact: true }).click()
  await bar.getByRole('button', { name: '线条样式', exact: true }).click(); await page.getByRole('button', { name: '虚线', exact: true }).click()
  for (const id of ids) expect(find(await scene(page), id).children[0]).toMatchObject({ strokeWidth: 6, dashPattern: [8, 5] })
})

test('row 13: tombstoned IDs are rejected without writes, undo restores identity and duplicate allocates fresh IDs', async ({ page }) => {
  await open(page); await note(page)
  const original = find(await scene(page), 'issue-note')
  await page.evaluate(() => window.demo.model.remove(['issue-note']))
  const updates = await page.evaluate(() => window.demo.allUpdates.length)
  expect(await page.evaluate(original => { try { window.demo.model.add(original); return '' } catch (error) { return error.message } }, original)).toBe('ELEMENT_ID_REUSE')
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
  await page.evaluate(() => window.demo.handle.undo()); expect(find(await scene(page), 'issue-note')).toEqual(original)
  await page.evaluate(() => window.demo.handle.select(['issue-note']))
  await page.locator('.selection-actions').getByRole('button', { name: '复制', exact: true }).click()
  await page.evaluate(() => window.demo.handle.flush())
  const copies = (await scene(page)).children
  expect(copies).toHaveLength(2); expect(new Set(copies.flatMap(n => [n.id, ...n.children.map(c => c.id)])).size).toBe(4)
  await page.evaluate(() => window.demo.handle.undo()); await page.evaluate(() => window.demo.handle.redo())
  expect((await scene(page)).children).toEqual(copies)
})

test('preference validators reject unknown data without overwriting records; controlled defaults never leak into the existing session cache', async ({ page }) => {
  await open(page)
  const result = await page.evaluate(async () => {
    const { isCanvasViewPreferences, isCanvasCreationPreferences } = await import('/src/sdk/preferences.ts')
    const badView = { version: 2, gridVisible: true }, badCreation = { version: 2, connector: { mode: 'curve' } }, before = JSON.stringify([badView, badCreation])
    const accepted = [isCanvasViewPreferences(badView), isCanvasCreationPreferences(badCreation), isCanvasCreationPreferences({ version: 1, note: { preset: 'unknown' } }), isCanvasCreationPreferences({ version: 1, connector: { strokeWidth: -1 } })]
    const { getStyleParamsFromLocalStorage } = await import('/src/editor/runtime/utils/styleLocalStorage.ts')
    window.demo.sessionStyleBefore = getStyleParamsFromLocalStorage()
    window.demo.setCreationPreferences({ version: 1, connector: { mode: 'curve', stroke: '#9254de' }, note: { preset: 'mint' } })
    return { accepted, unchanged: before === JSON.stringify([badView, badCreation]) }
  })
  expect(result).toEqual({ accepted: [false, false, false, false], unchanged: true })
  await page.locator('.board-tool-group[data-tool="connector"] > button').click()
  await expect(page.locator('.canvas-stage')).toHaveAttribute('data-active-tool', 'connector:curve')
  await page.evaluate(() => window.demo.setCreationPreferences(undefined))
  expect(await page.evaluate(async () => (await import('/src/editor/runtime/utils/styleLocalStorage.ts')).getStyleParamsFromLocalStorage())).toEqual(await page.evaluate(() => window.demo.sessionStyleBefore))
  await page.evaluate(() => { window.demo.setViewPreferences({ version: 2 }); window.demo.setCreationPreferences({ version: 2 }) })
  const callbacks = await page.evaluate(() => window.demo.preferenceLog.length)
  await page.getByRole('button', { name: '主菜单', exact: true }).click(); await page.getByRole('menuitemradio', { name: '网格', exact: true }).click()
  expect(await page.evaluate(() => window.demo.preferenceLog.length)).toBe(callbacks)
})

test('personal view changes, navigation and selection stay write-free for 60 seconds', async ({ page }) => {
  test.setTimeout(90000)
  await open(page); await note(page)
  const before = await scene(page), writes = await page.evaluate(() => window.demo.allUpdates.length), ready = await page.evaluate(() => window.demo.readyCount)
  await page.evaluate(() => window.demo.setViewPreferences({ version: 1, gridVisible: true, gridPattern: 'dots', backgroundColor: '#edf3ff', minimapVisible: true, outlineVisible: false }))
  await page.locator('.canvas-app').focus(); await page.keyboard.press('Meta+a')
  await page.locator('.canvas-host').hover({ position: { x: 800, y: 350 } }); await page.mouse.wheel(120, 40)
  await page.waitForTimeout(60000)
  expect(await scene(page)).toEqual(before); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(writes)
  expect(await page.evaluate(() => window.demo.readyCount)).toBe(ready)
})
