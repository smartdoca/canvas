import { writeFileSync } from 'node:fs'
import { test, expect } from './fixtures.mjs'

const state = page => page.evaluate(() => ({ scene: window.demo.model.getValue().scene,
  checkpoint: Array.from(window.demo.model.checkpoint().update), writes: window.demo.allUpdates.length }))
const value = page => page.evaluate(() => window.demo.handle.getValue().scene)
const ownFlag = node => ({ present: Object.hasOwn(node, 'hitChildren'), value: node.hitChildren })
const byId = (scene, id) => {
  const visit = nodes => { for (const node of nodes) { if (node.id === id) return node; const child = visit(node.children || []); if (child) return child } }
  return visit(scene.children)
}
async function seed(page, type, flag, nested = false) {
  await page.setViewportSize({ width: 1600, height: 1100 })
  if (!process.env.CANVAS_PACKAGE_CONSUMER) await page.route('**/examples/doca/main.jsx', async route => {
    const response = await route.fetch(), source = await response.text()
    if (!source.includes('onReady:')) throw Error('QA_SELECTION_OBSERVER_ENTRY_NOT_FOUND')
    // Observe the existing public callback without a product bridge.
    await route.fulfill({ response, body: source.replace('onReady:', 'onSelectionChange: selection => { window.groupSelectionEventEvidence = selection }, onReady:') })
  })
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  const url = await page.evaluate(({ type, flag, nested }) => {
    const frame = { id: 'flag-frame', tag: 'Frame', name: 'frame', x: 320, y: 80, width: type === 'phone' ? 390 : 640,
      height: type === 'phone' ? 844 : 480, fill: '#ffffff', stroke: '#b8bec9', strokeWidth: 1, overflow: 'hide', editable: true,
      ...(flag !== 'missing' ? { hitChildren: flag } : {}), data: { kind: 'container', containerType: type, title: 'Generated title' },
      children: [{ id: 'flag-content', tag: 'Rect', name: 'rect', x: 28, y: 140, width: 280, height: 100, fill: '#e8efff', editable: true }] }
    if (nested) frame.children.push({ id: 'nested-frame', tag: 'Frame', name: 'frame', x: 44, y: 260, width: 400, height: 180,
      fill: '#ffffff', stroke: '#b8bec9', strokeWidth: 1, editable: true, data: { kind: 'container', containerType: 'board', title: 'Nested title' },
      children: [{ id: 'nested-content', tag: 'Rect', name: 'rect', x: 28, y: 70, width: 180, height: 60, fill: '#ffe4a8', editable: true }] })
    const Model = window.demo.model.constructor, model = Model.initialize(crypto.randomUUID(), { version: 1, scene: { tag: 'Leafer', children: [frame,
      { id: 'outside-content', tag: 'Rect', name: 'rect', x: 1100, y: 650, width: 120, height: 70, fill: '#d4e8dd', editable: true }] } })
    const checkpoint = model.checkpoint(), url = new URL('/examples/doca/', location.origin)
    url.searchParams.set('epoch', checkpoint.epochId); url.searchParams.set('checkpoint', btoa(String.fromCharCode(...checkpoint.update)))
    model.dispose(); return url.href
  }, { type, flag, nested })
  await page.goto(url); await page.waitForFunction(() => window.demo?.handle)
  return url
}
const runtime = (page, id = 'flag-frame') => page.evaluate(async id => {
  const { Leafer } = window.canvasQaEngine || await import('/__qa/canvas-engine.js')
  const app = Leafer.list.list.find(item => item.isApp)
  const visit = nodes => { for (const item of nodes) { if (item.id === id) return item; const child = visit(item.children || []); if (child) return child } }
  const item = visit(app.tree.children), title = item.children.find(child => child.name === 'frame-title'), bounds = title.getBounds('box', 'world')
  if (!window.groupEventEvidence) {
    window.groupEventEvidence = []
    for (const name of ['editor.before_open_group', 'editor.open_group', 'editor.before_close_group', 'editor.close_group']) app.editor.on(name, event => window.groupEventEvidence.push({ type: name, id: event.editTarget.id, hitChildren: event.editTarget.hitChildren }))
  }
  const point = app.tree.getClientPointByWorld(bounds)
  return { hitChildren: item.hitChildren, opened: app.editor.openedGroupList.list.map(group => group.id),
    point: { x: point.x + 8, y: point.y + bounds.height / 2 }, selected: app.editor.list.map(item => item.id),
    innerEditing: app.editor.innerEditing, textBox: item.textBox, editInner: item.editInner, events: window.groupEventEvidence,
    editReady: item.syncEventer === app.editor.editBox.rect && app.editor.editBox.visible && Boolean(app.editor.editTool) }
}, id)
async function open(page, id = 'flag-frame') {
  await page.getByRole('button', { name: '选择 (V / 1)', exact: true }).click()
  const { point } = await runtime(page, id)
  await page.mouse.click(point.x, point.y)
  await expect.poll(async () => { const state = await runtime(page, id); return state.selected.includes(id) && state.editReady }).toBe(true)
  await page.waitForTimeout(180)
  await page.mouse.dblclick(point.x, point.y)
  try { await expect.poll(async () => (await runtime(page, id)).opened.includes(id)).toBe(true) }
  catch (error) { console.log('GROUP_OPEN_DIAGNOSTIC', JSON.stringify(await runtime(page, id))); await page.screenshot({ path: test.info().outputPath('open-failure.png') }); throw error }
  expect((await runtime(page, id)).hitChildren).toBe(true)
}
async function close(page) {
  const outside = await page.evaluate(async () => {
    const { Leafer } = window.canvasQaEngine || await import('/__qa/canvas-engine.js')
    const app = Leafer.list.list.find(item => item.isApp), p = app.tree.getClientPointByWorld(app.tree.getWorldPoint({ x: 1160, y: 685 }))
    return { x: p.x, y: p.y }
  })
  await page.mouse.click(outside.x, outside.y)
  await page.getByRole('button', { name: '手型工具 (H / Space)', exact: true }).click()
  await page.getByRole('button', { name: '选择 (V / 1)', exact: true }).click()
  await expect.poll(async () => (await runtime(page)).opened).toEqual([])
}
async function flush(page) { await page.evaluate(() => { window.demo.handle.flush(); window.demo.handle.flush() }); await page.waitForTimeout(180) }
async function exported(page) {
  return page.evaluate(async () => {
    const png = await window.demo.handle.exportFile({ format: 'png' }), svg = await window.demo.handle.exportFile({ format: 'svg' })
    return { pngBytes: png.blob.size, svg: await svg.blob.text() }
  })
}

for (const type of ['phone', 'board']) for (const flag of ['missing', false, true]) test(`${type} group open/close preserves stored ${flag} flag, checkpoint, getValue and export without writes`, async ({ page, context }, info) => {
  const url = await seed(page, type, flag), baseline = await state(page), initialView = await value(page)
  const peer = await context.newPage(); await peer.goto(url); await peer.waitForFunction(() => window.demo?.handle)
  for (let round = 0; round < 2; round++) {
    await open(page); await flush(page)
    expect((await runtime(page)).hitChildren).toBe(true)
    expect(await state(page)).toEqual(baseline)
    expect(await value(page)).toEqual(initialView)
    const output = await exported(page); expect(output.pngBytes).toBeGreaterThan(0); expect(output.svg).toContain('<svg')
    await close(page); await flush(page)
    expect(await state(page)).toEqual(baseline)
    expect(await value(page)).toEqual(initialView)
    expect((await state(peer)).scene).toEqual(baseline.scene)
    expect((await state(peer)).writes).toBe(0)
  }
  await open(page)
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await page.waitForFunction(() => window.demo?.handle); await flush(page)
  expect(await state(page)).toEqual(baseline)
  expect(await value(page)).toEqual(initialView)
  await page.getByRole('button', { name: '切换只读', exact: true }).click()
  const { point } = await runtime(page); await page.mouse.dblclick(point.x, point.y); await flush(page)
  expect(await state(page)).toEqual(baseline)
  writeFileSync(info.outputPath('zero-write-group-evidence.json'), JSON.stringify({ type, flag, stored: ownFlag(byId(baseline.scene, 'flag-frame')), writes: 0, peerWrites: 0 }, null, 2))
})

test('explicit same-value hitChildren commands keep true/false and ordinary content changes in one transaction each', async ({ page, context }) => {
  const url = await seed(page, 'board', false), baseline = await state(page)
  const peer = await context.newPage(); await peer.goto(url); await peer.waitForFunction(() => window.demo?.handle)
  await open(page)
  expect((await runtime(page)).selected).toEqual(['flag-frame'])
  await page.evaluate(() => window.demo.handle.updateSelection({ hitChildren: true, fill: '#e9f5ec' }))
  const enabled = await state(page)
  expect(enabled.writes).toBe(1)
  expect(byId(enabled.scene, 'flag-frame')).toMatchObject({ hitChildren: true, fill: '#e9f5ec' })
  await expect.poll(async () => (await state(peer)).scene).toEqual(enabled.scene)
  await close(page)
  expect((await runtime(page)).hitChildren).toBe(false)
  expect(ownFlag(byId(await value(page), 'flag-frame'))).toEqual({ present: true, value: true })
  await page.evaluate(() => { window.demo.handle.select(['flag-frame']); window.demo.handle.updateSelection({ hitChildren: false, opacity: .73 }) })
  const disabled = await state(page)
  expect(disabled.writes).toBe(2)
  expect(byId(disabled.scene, 'flag-frame')).toMatchObject({ hitChildren: false, opacity: .73, fill: '#e9f5ec' })
  await expect.poll(async () => (await state(peer)).scene).toEqual(disabled.scene)
  expect((await state(peer)).writes).toBe(0)
  await page.evaluate(() => window.demo.handle.undo()); expect((await state(page)).scene).toEqual(enabled.scene)
  await page.evaluate(() => window.demo.handle.undo()); expect((await state(page)).scene).toEqual(baseline.scene)
  await page.evaluate(() => { window.demo.handle.redo(); window.demo.handle.redo() }); expect((await state(page)).scene).toEqual(disabled.scene)
  await flush(page)
  expect(ownFlag(byId(await value(page), 'flag-frame'))).toEqual({ present: true, value: false })
})

for (const [initial, next] of [['missing', true], [true, false], [false, 'missing']]) test(`foreign model ${initial}→${next} while open retains exact field intent and generates no echo`, async ({ page, context }) => {
  const url = await seed(page, 'board', initial), baseline = await state(page)
  const peer = await context.newPage(); await peer.goto(url); await peer.waitForFunction(() => window.demo?.handle)
  await open(page); await flush(page); expect(await state(page)).toEqual(baseline)
  await peer.evaluate(next => window.demo.model.patch('flag-frame', { hitChildren: next === 'missing' ? undefined : next }), next)
  const patched = await state(peer)
  expect(patched.writes).toBe(1)
  await expect.poll(async () => (await state(page)).scene).toEqual(patched.scene)
  const expected = ownFlag(byId(patched.scene, 'flag-frame'))
  expect(expected).toEqual(next === 'missing' ? { present: false, value: undefined } : { present: true, value: next })
  expect(ownFlag(byId(await value(page), 'flag-frame'))).toEqual(expected)
  await exported(page); await close(page); await flush(page)
  expect((await state(page)).scene).toEqual(patched.scene)
  expect((await state(page)).writes).toBe(0)
  expect((await state(peer)).writes).toBe(1)
  expect(ownFlag(byId(await value(page), 'flag-frame'))).toEqual(expected)
  await peer.evaluate(() => window.demo.handle.undo())
  await expect.poll(async () => (await state(page)).scene).toEqual(baseline.scene)
  await peer.evaluate(() => window.demo.handle.redo())
  await expect.poll(async () => (await state(page)).scene).toEqual(patched.scene)
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await page.waitForFunction(() => window.demo?.handle); await flush(page)
  expect((await state(page)).scene).toEqual(patched.scene)
  expect((await state(page)).writes).toBe(0)
  expect(ownFlag(byId(await value(page), 'flag-frame'))).toEqual(expected)
})

test('nested native groups close together without flag writes and ordinary child edits still converge', async ({ page, context }) => {
  const url = await seed(page, 'board', false, true), baseline = await state(page), initialView = await value(page)
  const peer = await context.newPage(); await peer.goto(url); await peer.waitForFunction(() => window.demo?.handle)
  await open(page); await open(page, 'nested-frame'); await flush(page)
  expect((await runtime(page)).opened.sort()).toEqual(['flag-frame', 'nested-frame'])
  expect(await state(page)).toEqual(baseline); expect(await value(page)).toEqual(initialView)
  await close(page); await flush(page)
  expect(await state(page)).toEqual(baseline); expect(await value(page)).toEqual(initialView)
  await page.evaluate(() => { window.demo.handle.select(['nested-content']); window.demo.handle.updateSelection({ fill: '#a7d8ff' }) })
  const edited = await state(page)
  expect(edited.writes).toBe(1)
  expect(byId(edited.scene, 'nested-content').fill).toBe('#a7d8ff')
  expect(ownFlag(byId(edited.scene, 'flag-frame'))).toEqual({ present: true, value: false })
  expect(ownFlag(byId(edited.scene, 'nested-frame'))).toEqual({ present: false, value: undefined })
  await expect.poll(async () => (await state(peer)).scene).toEqual(edited.scene)
  expect((await state(peer)).writes).toBe(0)
  await close(page); await flush(page); expect(await state(page)).toEqual(edited)
})

for (const flag of ['missing', false, true]) test(`real duplicate/copy/paste of opened and closed nested groups preserves explicit ${flag} intent in public selections and new IDs`, async ({ page, context }) => {
  const url = await seed(page, 'board', flag, true), baseline = await state(page)
  const peer = await context.newPage(); await peer.goto(url); await peer.waitForFunction(() => window.demo?.handle)
  const original = byId(baseline.scene, 'flag-frame')
  const expected = ownFlag(original), innerExpected = ownFlag(byId(baseline.scene, 'nested-frame'))
  const flags = frame => {
    expect(ownFlag(frame)).toEqual(expected)
    expect(ownFlag(frame.children.find(item => item.data?.containerType === 'board'))).toEqual(innerExpected)
  }
  await open(page); await open(page, 'nested-frame')
  await page.evaluate(() => window.demo.handle.select(['flag-frame']))
  flags((await page.evaluate(() => window.demo.handle.getSelection()))[0])
  flags((await page.evaluate(() => window.groupSelectionEventEvidence))[0])
  await page.getByRole('button', { name: '评论选中元素', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Boolean(window.demo.actionSelection))).toBe(true)
  flags((await page.evaluate(() => window.demo.actionSelection))[0])
  await page.locator('.canvas-app').focus(); await page.keyboard.press('ControlOrMeta+d'); await flush(page)
  const duplicated = await state(page), copy = duplicated.scene.children.find(item => item.data?.containerType === 'board' && item.id !== 'flag-frame')
  expect(copy).toBeTruthy(); flags(copy)
  expect(copy.id).not.toBe(original.id)
  expect(duplicated.writes).toBe(1)
  await expect.poll(async () => (await state(peer)).scene).toEqual(duplicated.scene)
  writeFileSync(test.info().outputPath('after-duplicate-scene.json'), JSON.stringify(duplicated, null, 2))
  await close(page)
  const closed = await state(page)
  writeFileSync(test.info().outputPath('after-close-scene.json'), JSON.stringify(closed, null, 2))
  expect(closed, 'Closing a copied container must retain both nested subtrees without another content update').toEqual(duplicated)
  await page.evaluate(() => window.demo.handle.select(['flag-frame']))
  flags((await page.evaluate(() => window.demo.handle.getSelection()))[0])
  await page.locator('.canvas-app').focus(); await page.keyboard.press('ControlOrMeta+c'); await page.keyboard.press('ControlOrMeta+v'); await flush(page)
  const pasted = await state(page), clones = pasted.scene.children.filter(item => item.data?.containerType === 'board' && item.id !== 'flag-frame')
  writeFileSync(test.info().outputPath('after-paste-scene.json'), JSON.stringify(pasted, null, 2))
  expect(clones).toHaveLength(2); clones.forEach(flags)
  expect(pasted.writes).toBe(2)
  const allIds = [], collect = nodes => nodes.forEach(node => { allIds.push(node.id); if (node.children) collect(node.children) })
  collect(pasted.scene.children); expect(new Set(allIds).size).toBe(allIds.length)
  await expect.poll(async () => (await state(peer)).scene).toEqual(pasted.scene)
  expect((await state(peer)).writes).toBe(0)
  await page.evaluate(() => window.demo.handle.undo()); expect((await state(page)).scene).toEqual(duplicated.scene)
  await page.evaluate(() => window.demo.handle.redo()); expect((await state(page)).scene).toEqual(pasted.scene)
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await page.waitForFunction(() => window.demo?.handle); await flush(page)
  expect((await state(page)).scene).toEqual(pasted.scene)
})

for (const pendingFlag of [false, true]) test(`pending native content and ${pendingFlag} flag survive open/close, while export rejects without flushing`, async ({ page }, info) => {
  await seed(page, 'board', false)
  const result = await page.evaluate(async pendingFlag => {
    const { Leafer } = window.canvasQaEngine || await import('/__qa/canvas-engine.js')
    const app = Leafer.list.list.find(item => item.isApp), frame = app.tree.children.find(item => item.id === 'flag-frame')
    // One synchronous turn models a native plugin's legitimate pending change,
    // then the public Editor group lifecycle before its 120ms content debounce.
    // No checkpoint/read helper is called here: checkpoint itself flushes.
    frame.set({ opacity: .47, hitChildren: pendingFlag })
    app.editor.openGroup(frame); app.editor.closeGroup(frame)
    const writesBefore = window.demo.allUpdates.length, modelBefore = window.demo.model.getValue().scene
    let error
    try { await window.demo.handle.exportFile({ format: 'svg' }) } catch (caught) { error = caught.code }
    const writesAfter = window.demo.allUpdates.length
    window.demo.handle.flush()
    return { error, writesBefore, writesAfter, modelBefore, after: window.demo.model.getValue().scene, writesFlushed: window.demo.allUpdates.length }
  }, pendingFlag)
  writeFileSync(info.outputPath('pending-content-export-evidence.json'), JSON.stringify({ pendingFlag, ...result }, null, 2))
  expect(result.error).toBe('PENDING_LOCAL_EDITS')
  expect(result.writesBefore).toBe(0); expect(result.writesAfter).toBe(0)
  expect(byId(result.modelBefore, 'flag-frame').opacity).toBeUndefined()
  expect(result.writesFlushed).toBe(1)
  expect(byId(result.after, 'flag-frame')).toMatchObject({ opacity: .47, hitChildren: pendingFlag })
})
