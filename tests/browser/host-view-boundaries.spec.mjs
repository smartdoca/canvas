import { test, expect } from './fixtures.mjs'

const modelState = page => page.evaluate(() => ({
  scene: window.demo.model.getValue().scene,
  checkpoint: Array.from(window.demo.model.checkpoint().update),
  writes: window.demo.allUpdates.length,
}))
const engine = page => page.evaluate(async () => {
  const { Leafer } = window.canvasQaEngine || await import('/__qa/canvas-engine.js')
  const app = Leafer.list.list.find(item => item.isApp)
  return { nodes: app.tree.toJSON().children, innerEditing: app.editor.innerEditing }
})
const point = (page, x, y) => page.evaluate(async ({ x, y }) => {
  const { Leafer } = window.canvasQaEngine || await import('/__qa/canvas-engine.js')
  const app = Leafer.list.list.find(item => item.isApp)
  const p = app.tree.getClientPointByWorld(app.tree.getWorldPoint({ x, y }))
  return { x: p.x, y: p.y }
}, { x, y })
async function click(page, x, y) { const p = await point(page, x, y); await page.mouse.click(p.x, p.y) }
async function leaveEditing(page) {
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '手型工具 (H / Space)', exact: true }).click()
  await page.getByRole('button', { name: '选择 (V / 1)', exact: true }).click()
  await page.evaluate(() => window.demo.handle.flush())
}
async function open(page, children) {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
  const url = await page.evaluate(children => {
    const Model = window.demo.model.constructor
    const model = Model.initialize(crypto.randomUUID(), { version: 1, scene: { tag: 'Leafer', children } })
    const checkpoint = model.checkpoint(), url = new URL('/examples/doca/', location.origin)
    url.searchParams.set('epoch', checkpoint.epochId)
    url.searchParams.set('checkpoint', btoa(String.fromCharCode(...checkpoint.update)))
    model.dispose()
    return url.href
  }, children)
  await page.goto(url)
  await page.waitForFunction(() => window.demo?.handle)
  return url
}
async function exports(page) {
  return page.evaluate(async () => {
    const before = window.demo.model.getValue()
    const svgResult = await window.demo.handle.exportFile({ format: 'svg', background: 'transparent' })
    const svg = await svgResult.blob.text(), doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const box = doc.documentElement.getAttribute('viewBox').split(/[ ,]+/).map(Number)
    const pngResult = await window.demo.handle.exportFile({ format: 'png', background: 'transparent' })
    const bitmap = await createImageBitmap(pngResult.blob), canvas = document.createElement('canvas')
    canvas.width = bitmap.width; canvas.height = bitmap.height
    const paint = canvas.getContext('2d'); paint.drawImage(bitmap, 0, 0); bitmap.close()
    const sample = before.scene.children[0]
    const corner = [...paint.getImageData(Math.round(sample.x + 1 - box[0]), Math.round(sample.y + 1 - box[1]), 1, 1).data]
    return { svg, firstFill: doc.querySelector('g > path')?.getAttribute('fill'), png: { width: canvas.width, height: canvas.height, corner } }
  })
}

test('existing wrapper display and PNG/SVG agree without rewriting its stored title or checkpoint', async ({ page, context }, info) => {
  const originalChildren = [{ id: 'database-wrapper', tag: 'Frame', name: 'frame', x: 160, y: 120, width: 420, height: 240, fill: '#c4322b', editable: true, children: [
    { id: 'database-body', tag: 'Rect', name: 'diagram-body', x: 0, y: 0, width: 280, height: 140, fill: '#fae5e5', stroke: '#c4322b', strokeWidth: 1.5, cornerRadius: 8 },
    { id: 'database-text', tag: 'Text', name: 'text', x: 14, y: 12, width: 252, height: 116, text: 'video_books\nid (primary key)\ndata\nowner_id', fontSize: 18, fill: '#172b4d', editable: true },
    { id: 'database-generated-title', tag: 'Text', name: 'frame-title', x: 198, y: 214, text: 'Frame', fill: '#6257e8', fontSize: 13, editable: true },
  ] }]
  const url = await open(page, originalChildren), baseline = await modelState(page)
  expect(baseline.writes).toBe(0)
  const visible = (await engine(page)).nodes[0]
  expect(visible.fill).toBe('transparent')
  expect(visible.children.some(child => child.id === 'database-generated-title')).toBe(false)
  let result = await exports(page)
  expect(result.svg).toContain('video_books')
  expect(result.svg).not.toContain('>Frame</tspan>')
  expect(['transparent', 'none']).toContain(result.firstFill)
  expect(result.png.corner[3]).toBeLessThan(20)
  expect(await modelState(page)).toEqual(baseline)

  const peer = await context.newPage(); await peer.goto(url); await peer.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => { window.demo.handle.select(['database-wrapper']); window.demo.handle.updateSelection({ width: 520, height: 300 }); window.demo.handle.flush(); window.demo.handle.select([]) })
  const at = await point(page, 420, 185)
  await page.mouse.dblclick(at.x, at.y)
  const editor = page.locator('.canvas-plain-text-editor'); await expect(editor).toBeVisible()
  const blocked = await page.evaluate(async () => {
    try { await window.demo.handle.exportFile({ format: 'svg' }); return null } catch (error) { return error.code }
  })
  expect(blocked).toBe('PENDING_LOCAL_EDITS')
  await editor.fill('video_books\nid (primary key)\ndata\nowner_id\nreviewed_column')
  await leaveEditing(page)
  const edited = await modelState(page)
  expect(edited.scene.children[0].children.find(child => child.id === 'database-generated-title').text).toBe('Frame')
  expect(edited.scene.children[0].children.find(child => child.id === 'database-text').text).toContain('reviewed_column')
  await expect.poll(async () => (await modelState(peer)).scene).toEqual(edited.scene)
  expect((await modelState(peer)).writes).toBe(0)
  result = await exports(page)
  expect(result.svg).toContain('reviewed_column')
  expect(result.svg).not.toContain('>Frame</tspan>')
  expect(['transparent', 'none']).toContain(result.firstFill)
  expect(result.png.corner[3]).toBeLessThan(20)
  expect(await modelState(page)).toEqual(edited)
  await page.evaluate(() => window.demo.handle.undo())
  await page.evaluate(() => window.demo.handle.redo())
  expect((await modelState(page)).scene).toEqual(edited.scene)
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await page.waitForFunction(() => window.demo?.handle)
  expect((await modelState(page)).scene).toEqual(edited.scene)
  const reopened = await modelState(page)
  await exports(page)
  expect(await modelState(page)).toEqual(reopened)
  await info.attach('wrapper-export-evidence', { body: JSON.stringify({ ...result, svg: result.svg, storedTitle: 'Frame', openWrites: baseline.writes, exportWrites: 0 }), contentType: 'application/json' })
  await page.screenshot({ path: info.outputPath('wrapper-after-native-edit.png') })
})

test('legal minimal table cell interactions and 60-second idle keep its original model/checkpoint, while real edits still undo and converge', async ({ page, context }, info) => {
  test.setTimeout(120000)
  const cells = []
  for (let row = 0; row < 2; row++) for (let column = 0; column < 3; column++) cells.push({
    id: `minimal-cell-${row}-${column}`, tag: 'Frame', name: 'table-cell', x: column * 140, y: row * 46, width: 140, height: 46,
    fill: row ? '#ffffff' : '#eaf1ff', stroke: '#cfd3d8', strokeWidth: 1, editable: false, hitChildren: false,
    data: { kind: 'table-cell', row, column }, children: [{ id: `minimal-label-${row}-${column}`, tag: 'Text', name: 'text', x: 12, y: 10,
      width: 116, height: 26, text: `Cell ${row}-${column}`, fontSize: 14, fill: '#1f2329', verticalAlign: 'top', editable: true, data: { kind: 'cell-label' } }],
  })
  const url = await open(page, [{ id: 'minimal-table', tag: 'Group', name: 'board-table', x: 360, y: 240, editable: true, hitSelf: false,
    data: { kind: 'table', rows: 2, columns: 3 }, children: cells }])
  const baseline = await modelState(page)
  const peer = await context.newPage(); await peer.goto(url); await peer.waitForFunction(() => window.demo?.handle)
  expect(baseline.writes).toBe(0)
  expect(baseline.scene.children[0].data.columnWidths).toBeUndefined()
  const started = Date.now()
  for (let round = 0; round < 12; round++) {
    await page.bringToFront()
    await click(page, 385 + (round % 3) * 140, 260 + (round % 2) * 46)
    await expect(page.locator('[data-slate-editor]')).toBeVisible()
    await leaveEditing(page)
    await page.locator('.canvas-host').hover({ position: { x: 1100, y: 650 } })
    await page.mouse.wheel(24, 0); await page.mouse.wheel(-24, 0)
    await page.waitForTimeout(5000)
    expect(await modelState(page)).toEqual(baseline)
    expect((await modelState(peer)).scene).toEqual(baseline.scene)
    expect((await modelState(peer)).writes).toBe(0)
    console.log(`MINIMAL_TABLE_IDLE ${round + 1} ${Math.round((Date.now() - started) / 1000)}s`)
  }
  expect(Date.now() - started).toBeGreaterThanOrEqual(60000)
  await exports(page)
  expect(await modelState(page)).toEqual(baseline)
  await page.getByRole('button', { name: '切换只读', exact: true }).click()
  await click(page, 385, 260)
  await page.waitForTimeout(200)
  expect(await modelState(page)).toEqual(baseline)
  await page.getByRole('button', { name: '切换只读', exact: true }).click()
  await click(page, 385, 260); await expect(page.locator('[data-slate-editor]')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.insertText('Edited')
  await leaveEditing(page)
  const edited = await modelState(page)
  expect(edited.writes).toBeGreaterThan(0)
  // Real editing retains the existing native commit/layout rules. The strict
  // original-model/checkpoint comparison above applies to pure interaction.
  expect(edited.scene.children[0].children[0].children[0].text).toBe('Edited')
  await expect.poll(async () => (await modelState(peer)).scene).toEqual(edited.scene)
  expect((await modelState(peer)).writes).toBe(0)
  await page.evaluate(() => window.demo.handle.undo())
  const undone = await modelState(page)
  expect(undone.scene.children[0].children[0].children[0].text).toBe('Cell 0-0')
  expect(undone.scene.children[0].children.map(cell => cell.id)).toEqual(cells.map(cell => cell.id))
  await page.evaluate(() => window.demo.handle.redo())
  expect((await modelState(page)).scene).toEqual(edited.scene)
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await page.waitForFunction(() => window.demo?.handle)
  const reopened = await modelState(page)
  expect(reopened.scene).toEqual(edited.scene)
  await page.evaluate(() => window.demo.handle.flush())
  expect(await modelState(page)).toEqual(reopened)
  await info.attach('minimal-table-zero-write-evidence', { body: JSON.stringify({ idleSeconds: (Date.now() - started) / 1000,
    originalCheckpointBytes: baseline.checkpoint.length, idleWrites: 0, realEditWrites: edited.writes, modelLayoutFieldsStillAbsentBeforeEdit: true, peerEcho: 0 }), contentType: 'application/json' })
  await page.screenshot({ path: info.outputPath('minimal-table-after-real-edit.png') })
})
