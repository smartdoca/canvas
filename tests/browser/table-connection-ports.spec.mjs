import { writeFileSync } from 'node:fs'
import { test, expect } from './fixtures.mjs'

const SOURCE = 'ts', TARGET = 'tt'
const scene = page => page.evaluate(() => window.demo.model.getValue().scene)
const writes = page => page.evaluate(() => window.demo.allUpdates.length)
const checkpoint = page => page.evaluate(() => {
  const value = window.demo.model.checkpoint()
  return { ...value, update: Array.from(value.update) }
})
const connectors = value => value.children.filter(node => node.data?.kind === 'connector')
const ports = page => page.locator(`.graph-port[data-node-id="${SOURCE}"]`)

// Seed the public model directly: projecting or selecting this input must not
// become an edit, and the tests must also run against the installed tarball.
function table(id, x, y, rows = 3, columns = 3) {
  return { id, tag: 'Group', name: 'board-table', x, y, editable: true, hitSelf: false, data: { kind: 'table', rows, columns }, children: Array.from({ length: rows * columns }, (_, index) => {
    const row = Math.floor(index / columns), column = index % columns, cell = `${id}-c${row}-${column}`
    return { id: cell, tag: 'Frame', name: 'table-cell', x: column * 140, y: row * 46, width: 140, height: 46, fill: row === 0 ? '#eaf1ff' : '#ffffff', stroke: '#cfd3d8', strokeWidth: 1, editable: false, hitChildren: false, data: { kind: 'table-cell', row, column }, children: [{ id: `${cell}-label`, tag: 'Text', name: 'text', text: `Cell ${row + 1},${column + 1}`, x: 12, y: 10, width: 116, height: 26, fill: '#1f2329', fontFamily: 'Arial', fontSize: 14, fontWeight: row === 0 ? 600 : 400, verticalAlign: 'top', editable: true, data: { kind: 'cell-label' } }] }
  }) }
}
function diagram() {
  return { id: TARGET, tag: 'Frame', name: 'diagram-node', x: 950, y: 540, width: 240, height: 138, fill: 'transparent', editable: true, hitChildren: false, data: { kind: 'diagram-node', shape: 'rounded' }, children: [
    { id: `${TARGET}-body`, tag: 'Rect', name: 'diagram-body', x: 0, y: 0, width: 240, height: 138, fill: '#ffffff', stroke: '#646a73', strokeWidth: 1.5, cornerRadius: 8, editable: false, data: { kind: 'diagram-body' } },
    { id: `${TARGET}-label`, tag: 'Text', name: 'text', text: 'Target', x: 14, y: 12, width: 212, height: 114, fontSize: 16, fill: '#1f2329', textAlign: 'center', verticalAlign: 'middle', editable: true, data: { kind: 'node-label' } },
  ] }
}
async function open(page, context, target = 'diagram') {
  const modules = []
  page.on('request', request => modules.push(new URL(request.url()).pathname))
  await page.setViewportSize({ width: 1600, height: 1100 })
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
  const seeded = await page.evaluate(value => {
    const model = window.demo.model.constructor.initialize(crypto.randomUUID(), { version: 1, scene: value })
    const checkpoint = model.checkpoint(), original = model.getValue().scene, url = new URL('/examples/doca/', location.origin)
    url.searchParams.set('epoch', checkpoint.epochId)
    url.searchParams.set('checkpoint', btoa(String.fromCharCode(...checkpoint.update)))
    model.dispose()
    return { url: url.href, original }
  }, { tag: 'Leafer', children: [table(SOURCE, 280, 340), target === 'table' ? table(TARGET, 950, 540, 2, 2) : diagram()] })
  await page.goto(seeded.url)
  await page.waitForFunction(() => window.demo?.handle)
  const peer = await context.newPage()
  await peer.setViewportSize({ width: 1600, height: 1100 })
  await peer.goto(seeded.url)
  await peer.waitForFunction(() => window.demo?.handle)
  expect(await scene(page)).toEqual(seeded.original)
  expect(await scene(peer)).toEqual(seeded.original)
  expect(await writes(page)).toBe(0); expect(await writes(peer)).toBe(0)
  return { peer, original: seeded.original, modules }
}
async function point(page, id, x = .5, y = .5) {
  return page.evaluate(async ({ id, x, y }) => {
    const { Leafer } = window.canvasQaEngine || await import('/__qa/canvas-engine.js')
    const app = Leafer.list.list.find(item => item.isApp)
    const visit = nodes => { for (const node of nodes) { if (node.id === id) return node; const found = visit(node.children || []); if (found) return found } }
    const bounds = visit(app.tree.children).getBounds('box', 'world')
    const p = app.tree.getClientPointByWorld({ x: bounds.x + bounds.width * x, y: bounds.y + bounds.height * y })
    return { x: p.x, y: p.y }
  }, { id, x, y })
}
async function editFirstCell(page) {
  const p = await point(page, `${SOURCE}-c0-0`)
  await page.mouse.click(p.x, p.y)
  await expect(page.locator('[data-slate-editor]')).toBeFocused()
  await expect(ports(page)).toHaveCount(0)
}
async function selectTableWithHand(page) {
  await editFirstCell(page)
  await page.locator('.rich-object-move-handle').click()
  await expect(page.locator('[data-slate-editor]')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.demo.handle.getSelection().map(node => node.id))).toEqual([SOURCE])
  await page.mouse.move(1300, 850)
  return availablePorts(page)
}
async function hoverPorts(page) {
  await page.evaluate(() => window.demo.handle.select([]))
  await page.mouse.move(1300, 850)
  await expect(ports(page)).toHaveCount(0)
  const p = await point(page, `${SOURCE}-c0-0`)
  await page.mouse.move(p.x, p.y)
  return availablePorts(page)
}
async function availablePorts(page) {
  await expect(ports(page)).toHaveCount(12)
  const bounds = { first: await point(page, SOURCE, 0, 0), last: await point(page, SOURCE, 1, 1) }
  const actual = await ports(page).evaluateAll(elements => elements.map(port => {
    const b = port.getBoundingClientRect(), center = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    return { x: Number(port.dataset.portX), y: Number(port.dataset.portY), center, visible: b.width > 0 && b.height > 0 && getComputedStyle(port).visibility !== 'hidden', hit: document.elementFromPoint(center.x, center.y)?.closest('.graph-port') === port }
  }))
  expect(actual.map(({ x, y }) => `${x},${y}`).sort()).toEqual(['.5,0', '1,.5', '.5,1', '0,.5', '.25,0', '1,.25', '.25,1', '0,.25', '.75,0', '1,.75', '.75,1', '0,.75'].map(value => value.split(',').map(Number).join(',')).sort())
  for (const port of actual) {
    expect(port.visible, `Port ${port.x},${port.y} is visible`).toBe(true)
    expect(port.hit, `Port ${port.x},${port.y} receives a real pointer at its center`).toBe(true)
    expect(port.center.x).toBeCloseTo(bounds.first.x + (bounds.last.x - bounds.first.x) * port.x, 0)
    expect(port.center.y).toBeCloseTo(bounds.first.y + (bounds.last.y - bounds.first.y) * port.y, 0)
  }
  return actual
}
function assertPackage(modules) {
  if (!process.env.CANVAS_PACKAGE_CONSUMER) return
  expect(modules.some(path => path.startsWith('/assets/') && path.endsWith('.js'))).toBe(true)
  expect(modules.some(path => path.startsWith('/src/') || path.startsWith('/__qa/'))).toBe(false)
}
async function stable(page) {
  await page.evaluate(() => window.demo.handle.flush())
  await page.waitForTimeout(180)
}
async function converge(peer, expected) {
  await expect.poll(() => scene(peer)).toEqual(expected)
  await stable(peer)
  expect(await scene(peer)).toEqual(expected)
  expect(await writes(peer)).toBe(0)
}
async function finalState(page, peer, modules) {
  await converge(peer, await scene(page))
  expect(await page.evaluate(() => window.demo.errors)).toEqual([])
  expect(await peer.evaluate(() => window.demo.errors)).toEqual([])
  assertPackage(modules)
}
async function reopen(page) {
  const ready = await page.evaluate(() => window.demo.readyCount)
  await page.evaluate(() => { const open = window.demo.openDocument, checkpoint = window.demo.closeDocument(); open(checkpoint) })
  await page.waitForFunction(ready => window.demo?.readyCount > ready && !window.demo.model.isDisposed, ready)
  await stable(page)
}

test('hover exposes temporary table ports, the hand retains them for sixty idle seconds, and cell editing, ranges and readonly hide them', async ({ page, context }, info) => {
  const { peer, original, modules } = await open(page, context)
  const hoveredPorts = await hoverPorts(page)
  await page.mouse.move(1300, 850)
  await expect(ports(page)).toHaveCount(0)
  const selectedPorts = await selectTableWithHand(page), beforeCheckpoint = await checkpoint(page)
  await page.screenshot({ path: info.outputPath('hand-selected-table-with-ports.png') })
  // Selection/focus overlays remain view state even after autosave/idle timers.
  await page.waitForTimeout(60000)
  await expect(page.locator('[data-slate-editor]')).toHaveCount(0)
  await availablePorts(page)
  await stable(page)
  expect(await scene(page)).toEqual(original)
  expect(await checkpoint(page)).toEqual(beforeCheckpoint)
  await converge(peer, original)
  expect(await writes(page)).toBe(0); expect(await writes(peer)).toBe(0)

  await editFirstCell(page)
  await page.mouse.move(1300, 850)
  await expect(ports(page)).toHaveCount(0)
  const next = await point(page, `${SOURCE}-c1-1`)
  await page.keyboard.down('Shift'); await page.mouse.click(next.x, next.y); await page.keyboard.up('Shift')
  await expect(page.locator('[data-slate-editor]')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.demo.handle.getSelection().map(node => node.id).sort())).toEqual([`${SOURCE}-c0-0`, `${SOURCE}-c0-1`, `${SOURCE}-c1-0`, `${SOURCE}-c1-1`].sort())
  await page.mouse.move(1300, 850)
  await expect(ports(page)).toHaveCount(0)
  const overRange = await point(page, `${SOURCE}-c0-0`)
  await page.mouse.move(overRange.x, overRange.y)
  await availablePorts(page)
  await page.mouse.move(1300, 850)
  await expect(ports(page)).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('selected-cell-range-without-ports.png') })
  await stable(page)
  expect(await scene(page)).toEqual(original)
  expect(await writes(page)).toBe(0); expect(await writes(peer)).toBe(0)

  await page.evaluate(() => window.demo.setMode('readonly'))
  await expect(page.locator('.graph-port')).toHaveCount(0)
  await page.evaluate(id => window.demo.handle.select([id]), SOURCE)
  await page.mouse.move(overRange.x, overRange.y)
  await expect(page.locator('.graph-port')).toHaveCount(0)
  await stable(page)
  expect(await scene(page)).toEqual(original)
  expect(await writes(page)).toBe(0); expect(await writes(peer)).toBe(0)
  await finalState(page, peer, modules)
  writeFileSync(info.outputPath('table-port-visibility.json'), JSON.stringify({ hoveredPorts, selectedPorts, original, writes: await writes(page), peerWrites: await writes(peer) }, null, 2))
  await peer.close()
})

test('table port clicks, jitter and interrupted drags never write content or obstruct table axes and resizing', async ({ page, context }, info) => {
  const { peer, original, modules } = await open(page, context)
  const results = []
  for (const mode of ['click', 'jitter', 'Escape', 'pointercancel', 'blur', 'readonly']) await test.step(mode, async () => {
    if (mode === 'Escape' || mode === 'blur') await hoverPorts(page)
    else await selectTableWithHand(page)
    const before = await checkpoint(page)
    const port = page.locator(`.graph-port[data-node-id="${SOURCE}"][data-port-x="1"][data-port-y="0.25"]`)
    const box = await port.boundingBox(), start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await page.mouse.move(start.x, start.y); await page.mouse.down()
    if (mode === 'click' || mode === 'jitter') {
      if (mode === 'jitter') await page.mouse.move(start.x + 2, start.y + 1)
      await expect(page.locator('.graph-gesture-preview')).toHaveCount(0)
    } else {
      const destination = await point(page, TARGET, 0, .25)
      await page.mouse.move(destination.x, destination.y, { steps: 12 })
      await expect(page.locator('.graph-gesture-preview')).toBeVisible()
      expect(await scene(page)).toEqual(original)
      if (mode === 'Escape') await page.keyboard.press('Escape')
      if (mode === 'pointercancel') await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })))
      if (mode === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')))
      if (mode === 'readonly') await page.evaluate(() => window.demo.setMode('readonly'))
      await expect(page.locator('.graph-gesture-preview')).toHaveCount(0)
    }
    await page.mouse.up(); await page.mouse.move(1300, 850)
    await expect(page.locator('.graph-gesture-preview,.graph-create-picker')).toHaveCount(0)
    await stable(page)
    expect(await scene(page)).toEqual(original)
    expect(await checkpoint(page)).toEqual(before)
    await converge(peer, original)
    expect(await writes(page)).toBe(0); expect(await writes(peer)).toBe(0)
    results.push({ mode, writes: await writes(page), peerWrites: await writes(peer) })
  })

  await page.evaluate(() => window.demo.setMode('edit'))
  await selectTableWithHand(page)
  const axes = await page.locator('.table-axis-rail').evaluateAll(elements => elements.map(element => {
    const b = element.getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
    return { label: element.getAttribute('aria-label'), hit: element.contains(hit), interceptedBy: hit?.className }
  }))
  for (const axis of axes) expect(axis.hit, `${axis.label} center intercepted by ${axis.interceptedBy}`).toBe(true)
  await page.locator('.table-axis-rail.is-column').nth(1).click()
  const menu = page.locator('.table-axis-menu')
  await expect(menu).toBeVisible()
  const actions = await menu.locator('[role=menuitem]').evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect()
    return [box.x + box.width / 2, box.x + box.width - 8].every(x => element.contains(document.elementFromPoint(x, box.y + box.height / 2)))
  }))
  expect(actions.length).toBeGreaterThan(0)
  expect(actions.every(Boolean), 'Table menu actions stay above connection targets').toBe(true)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  // Normal clicks and a real separator drag must still reach the lower table
  // overlay when the graph overlay is raised to expose the boundary ports.
  await page.locator('.table-axis-rail.is-column').first().click()
  await expect.poll(() => page.evaluate(() => window.demo.handle.getSelection().map(node => node.id).sort())).toEqual([`${SOURCE}-c0-0`, `${SOURCE}-c1-0`, `${SOURCE}-c2-0`].sort())
  await page.locator('.table-axis-rail.is-row').nth(1).click()
  await expect.poll(() => page.evaluate(() => window.demo.handle.getSelection().map(node => node.id).sort())).toEqual([`${SOURCE}-c1-0`, `${SOURCE}-c1-1`, `${SOURCE}-c1-2`].sort())
  await page.keyboard.press('Escape')
  await page.evaluate(id => window.demo.handle.select([id]), `${SOURCE}-c1-1`)
  await stable(page)
  expect(await scene(page)).toEqual(original)
  expect(await writes(page)).toBe(0); expect(await writes(peer)).toBe(0)
  const boundary = page.locator('.table-boundary.is-column').first(), box = await boundary.boundingBox()
  const x = box.x + box.width / 2, y = box.y + box.height * .7
  expect(await boundary.evaluate((element, p) => element.contains(document.elementFromPoint(p.x, p.y)), { x, y })).toBe(true)
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 35, y, { steps: 8 }); await page.mouse.up()
  await stable(page)
  const resized = await scene(page), source = resized.children.find(node => node.id === SOURCE)
  expect(source.data.columnWidths).toEqual([175, 140, 140])
  expect(connectors(resized)).toHaveLength(0)
  expect(await writes(page)).toBe(1)
  await converge(peer, resized)
  expect(await writes(peer)).toBe(0)
  await page.evaluate(() => window.demo.handle.undo())
  await expect.poll(() => scene(page)).toEqual(original)
  await converge(peer, original)
  expect(await writes(page)).toBe(2); expect(await writes(peer)).toBe(0)
  await finalState(page, peer, modules)
  writeFileSync(info.outputPath('table-port-cancellations.json'), JSON.stringify({ results, resized, writes: await writes(page), peerWrites: await writes(peer) }, null, 2))
  await page.screenshot({ path: info.outputPath('table-axes-remain-operable.png') })
  await peer.close()
})

test('cancelling a port drag after genuine cell input preserves the edit, peer state and text undo history', async ({ page, context }, info) => {
  const { peer, original, modules } = await open(page, context)
  await editFirstCell(page)
  const input = page.locator('[data-slate-editor]')
  await page.keyboard.press('End'); await page.keyboard.insertText(' typed')
  await expect(input).toHaveText('Cell 1,1 typed')
  await expect(input).toBeFocused()
  await expect(ports(page)).toHaveCount(0)
  // The visible hand, rather than a hidden port, finishes the pending cell edit.
  await page.locator('.rich-object-move-handle').click()
  await expect(input).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.demo.handle.getSelection().map(node => node.id))).toEqual([SOURCE])
  const edited = await scene(page), committed = await writes(page)
  expect(edited.children.find(node => node.id === SOURCE).children[0].children[0].text).toBe('Cell 1,1 typed')
  expect(committed).toBe(1)
  const editedCheckpoint = await checkpoint(page)
  await converge(peer, edited)
  await page.mouse.move(1300, 850)
  await availablePorts(page)

  const port = page.locator(`.graph-port[data-node-id="${SOURCE}"][data-port-x="1"][data-port-y="0.25"]`)
  const box = await port.boundingBox(), destination = await point(page, TARGET, 0, .25)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down()
  await expect(input).toHaveCount(0)
  await page.mouse.move(destination.x, destination.y, { steps: 12 })
  await expect(page.locator('.graph-gesture-preview')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.graph-gesture-preview,.graph-create-picker')).toHaveCount(0)
  await page.mouse.up(); await stable(page)
  expect(await scene(page)).toEqual(edited)
  expect(await checkpoint(page)).toEqual(editedCheckpoint)
  expect(connectors(await scene(page))).toHaveLength(0)
  expect(await writes(page)).toBe(committed); expect(await writes(peer)).toBe(0)
  await converge(peer, edited)

  await page.evaluate(() => window.demo.handle.undo())
  await expect.poll(() => scene(page)).toEqual(original)
  await converge(peer, original)
  expect(await writes(page)).toBe(committed + 1); expect(await writes(peer)).toBe(0)
  await page.evaluate(() => window.demo.handle.redo())
  await expect.poll(() => scene(page)).toEqual(edited)
  await converge(peer, edited)
  expect(await writes(page)).toBe(committed + 2); expect(await writes(peer)).toBe(0)
  await reopen(page)
  expect(await scene(page)).toEqual(edited)
  await converge(peer, edited)
  expect(connectors(await scene(page))).toHaveLength(0)
  expect(await writes(page)).toBe(committed + 2); expect(await writes(peer)).toBe(0)
  await finalState(page, peer, modules)
  writeFileSync(info.outputPath('table-port-cancel-after-input.json'), JSON.stringify({ original, edited, committed, writes: await writes(page), peerWrites: await writes(peer) }, null, 2))
  await page.screenshot({ path: info.outputPath('edited-table-after-cancelled-connection.png') })
  await peer.close()
})

for (const target of ['diagram', 'table']) test(`a real table ${target === 'diagram' ? 'hand' : 'hover'} quarter-port drag binds the whole ${target}, converges without echo and survives undo, redo and reopen`, async ({ page, context }, info) => {
  const { peer, original, modules } = await open(page, context, target)
  if (target === 'diagram') await selectTableWithHand(page)
  else await hoverPorts(page)
  const port = page.locator(`.graph-port[data-node-id="${SOURCE}"][data-port-x="1"][data-port-y="0.25"]`)
  const b = await port.boundingBox(), destination = await point(page, TARGET, 0, .25)
  expect(b).toBeTruthy()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down()
  await expect(page.locator('[data-slate-editor]')).toHaveCount(0)
  await page.mouse.move(destination.x, destination.y, { steps: 16 })
  await expect(page.locator('.graph-gesture-preview')).toBeVisible()
  expect(await scene(page)).toEqual(original)
  expect(await writes(page)).toBe(0); expect(await writes(peer)).toBe(0)
  await page.screenshot({ path: info.outputPath(`table-to-${target}-draft.png`) })
  await page.mouse.up(); await stable(page)
  const after = await scene(page), edges = connectors(after)
  expect(after.children).toHaveLength(original.children.length + 1)
  expect(edges).toHaveLength(1)
  const edge = edges[0]
  expect(edge.data).toMatchObject({ sourceId: SOURCE, targetId: TARGET, sourceAnchor: { x: 1, y: .25 }, targetAnchor: { x: 0, y: .25 } })
  expect(edge.data.from.x).toBeCloseTo(700); expect(edge.data.from.y).toBeCloseTo(374.5)
  expect(edge.data.to.x).toBeCloseTo(950); expect(edge.data.to.y).toBeCloseTo(target === 'table' ? 563 : 574.5)
  expect(after.children.find(node => node.id === SOURCE)).toEqual(original.children[0])
  expect(after.children.find(node => node.id === TARGET)).toEqual(original.children[1])
  expect(await writes(page)).toBe(1)
  await converge(peer, after)
  expect(await writes(peer)).toBe(0)

  await page.evaluate(() => window.demo.handle.undo())
  await expect.poll(() => scene(page)).toEqual(original)
  await converge(peer, original)
  expect(await writes(page)).toBe(2); expect(await writes(peer)).toBe(0)
  await page.evaluate(() => window.demo.handle.redo())
  await expect.poll(() => scene(page)).toEqual(after)
  await converge(peer, after)
  expect(await writes(page)).toBe(3); expect(await writes(peer)).toBe(0)

  await reopen(page)
  expect(await scene(page)).toEqual(after)
  await converge(peer, after)
  expect(await writes(page)).toBe(3); expect(await writes(peer)).toBe(0)
  await selectTableWithHand(page)
  await page.screenshot({ path: info.outputPath(`table-to-${target}-reopened.png`) })
  await page.keyboard.press('Escape'); await stable(page)
  expect(await scene(page)).toEqual(after)
  expect(await writes(page)).toBe(3); expect(await writes(peer)).toBe(0)
  await finalState(page, peer, modules)
  writeFileSync(info.outputPath(`table-to-${target}-connection.json`), JSON.stringify({ original, after, edge, writes: await writes(page), peerWrites: await writes(peer) }, null, 2))
  await peer.close()
})
