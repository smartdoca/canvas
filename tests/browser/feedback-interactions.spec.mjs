import { test, expect } from './fixtures.mjs'

async function open(page) {
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.model.remove(window.demo.model.getValue().scene.children.map(n => n.id)))
}
const scene = page => page.evaluate(() => window.demo.model.getValue().scene.children)
const selected = page => page.evaluate(() => window.demo.handle.getSelection().map(n => n.id))
async function diagram(page, shape = 'rounded', x = 300, y = 220) {
  return page.evaluate(async ({ shape, x, y }) => {
    const { makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts')
    const node = makeDiagram(shape, x, y, '', 240, 120), id = node.id
    window.demo.handle.addElement(node.toJSON()); node.destroy(); window.demo.handle.flush()
    window.demo.handle.select([id]); return id
  }, { shape, x, y })
}

test('empty centered labels keep the caret on the same line before and after typing', async ({ page }, info) => {
  await open(page); const id = await diagram(page)
  await page.locator('.canvas-host').dblclick({ position: { x: 420, y: 280 } })
  const input = page.locator('.canvas-plain-text-editor')
  await expect(input).toBeFocused()
  const empty = await input.evaluate(el => {
    const css = getComputedStyle(el), box = el.getBoundingClientRect()
    return { top: box.top, height: box.height, padding: parseFloat(css.paddingTop), line: parseFloat(css.lineHeight), display: css.display }
  })
  expect(empty.display).toBe('block')
  expect(empty.padding + empty.line / 2).toBeCloseTo(empty.height / 2, 0)
  await page.screenshot({ path: info.outputPath('empty-centered-caret.png'), caret: 'initial' })
  await page.keyboard.insertText('Ag')
  const typed = await input.evaluate(el => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().toJSON() })
  expect(Math.abs(typed.y + typed.height / 2 - empty.top - empty.height / 2)).toBeLessThan(2)
  await page.keyboard.press('Enter'); await page.keyboard.insertText('second line')
  await expect(input).toHaveText('Ag\nsecond line', { useInnerText: true })
  await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  expect((await scene(page)).find(n => n.id === id).children[1].text).toBe('Ag\nsecond line')
})

test('ordered list markers share the first text baseline with larger and mixed leaves', async ({ page }, info) => {
  await open(page)
  await page.evaluate(() => {
    const value = [
      { type: 'paragraph', block: 'number', children: [{ text: 'Reverse proxy', fontSize: 32 }] },
      { type: 'paragraph', block: 'number', children: [{ text: 'SSL', fontSize: 24 }, { text: ' certificate with wrapping content', fontSize: 32 }] },
      { type: 'paragraph', block: 'number', children: [{ text: '域名解析', fontSize: 32 }] },
    ]
    window.demo.handle.addElement({ id: 'list-note', tag: 'Frame', name: 'note', x: 340, y: 180, width: 400, height: 420, fill: '#fff2a8', data: { kind: 'note' }, children: [{ id: 'list-label', tag: 'Text', name: 'text', x: 16, y: 16, width: 368, height: 388, fontSize: 16, text: value.map(p => p.children.map(l => l.text).join('')).join('\n'), data: { richText: { version: 1, value } } }] })
    window.demo.handle.select(['list-label'])
  })
  await page.locator('.canvas-app').focus(); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowRight')
  const offsets = await page.locator('.rich-list-row').evaluateAll(rows => rows.slice(0, 2).map(row => {
    const rect = el => { const range = document.createRange(); range.selectNodeContents(el); return range.getBoundingClientRect() }
    const marker = rect(row.querySelector('.rich-list-marker')), text = rect(row.querySelector('[data-slate-string]'))
    return Math.abs(marker.bottom - text.bottom)
  }))
  for (const offset of offsets) expect(offset).toBeLessThan(1)
  await page.screenshot({ path: info.outputPath('ordered-list-baselines.png') })
})

test('port clicks and small pointer jitter never leave a connector draft', async ({ page }) => {
  await open(page); const id = await diagram(page)
  const port = page.getByRole('button', { name: '从右侧创建连线', exact: true }), before = await scene(page)
  const updates = await page.evaluate(() => window.demo.allUpdates.length)
  const b = await port.boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2
  await page.mouse.move(x, y); await page.mouse.down()
  await expect(page.locator('.graph-gesture-preview')).toHaveCount(0)
  await page.mouse.move(x + 2, y + 1); await page.mouse.up()
  await page.mouse.move(x + 180, y + 70)
  await expect(page.locator('.graph-gesture-preview,.graph-create-picker')).toHaveCount(0)
  const host = await page.locator('.canvas-host').boundingBox()
  await page.mouse.click(host.x + 760, host.y + 500)
  await page.evaluate(() => window.demo.handle.flush())
  expect(await scene(page)).toEqual(before)
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
  await page.evaluate(id => window.demo.handle.select([id]), id)
  await port.click(); await page.mouse.move(x + 150, y + 80)
  await expect(page.locator('.graph-gesture-preview,.graph-create-picker')).toHaveCount(0)
})

for (const readonly of [false, true]) test(`select all accepts either platform modifier alone (readonly=${readonly})`, async ({ page }) => {
  await open(page); const first = await diagram(page), second = await diagram(page, 'rounded', 740, 400)
  if (readonly) await page.evaluate(() => window.demo.setMode('readonly'))
  for (const key of ['Meta+a', 'Control+a', 'Control+Meta+a', 'Meta+Shift+a', 'Control+Alt+a']) {
    await page.evaluate(id => window.demo.handle.select([id]), first)
    await page.locator('.canvas-app').focus(); await page.keyboard.press(key)
    expect((await selected(page)).sort()).toEqual((key === 'Meta+a' || key === 'Control+a' ? [first, second] : [first]).sort())
  }
})

test('twelve outline ports bind quarter points through drag, resize, undo and reopen', async ({ page }, info) => {
  await open(page); const source = await diagram(page), target = await diagram(page, 'diamond', 780, 380)
  await page.evaluate(id => window.demo.handle.select([id]), source)
  await expect(page.locator('.graph-port.is-selected')).toHaveCount(12)
  const from = page.locator(`.graph-port[data-node-id="${source}"][data-port-x="1"][data-port-y="0.25"]`), b = await from.boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down()
  const host = await page.locator('.canvas-host').boundingBox()
  // Diamond's upper left outline quarter; the anchor still records its side.
  await page.mouse.move(host.x + 820, host.y + 420, { steps: 14 })
  await expect(page.locator('.graph-gesture-preview')).toBeVisible(); await page.mouse.up()
  let edge = (await scene(page)).find(n => n.data?.kind === 'connector')
  expect(edge.data).toMatchObject({ sourceId: source, targetId: target, sourceAnchor: { x: 1, y: .25 }, targetAnchor: { x: 0, y: .25 } })
  expect(edge.data.from).toEqual({ x: 540, y: 250 })
  expect(edge.data.to.x).toBeCloseTo(820); expect(edge.data.to.y).toBeCloseTo(420)
  await page.evaluate(id => { window.demo.handle.select([id]); window.demo.handle.updateSelection({ width: 320, height: 160 }) }, source)
  edge = (await scene(page)).find(n => n.id === edge.id)
  expect(edge.data.from).toEqual({ x: 620, y: 260 })
  await page.evaluate(() => window.demo.handle.undo())
  expect((await scene(page)).find(n => n.id === edge.id).data.from).toEqual({ x: 540, y: 250 })
  const before = await scene(page)
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await page.waitForFunction(() => window.demo?.handle)
  expect(await scene(page)).toEqual(before)
  for (const shape of ['ellipse', 'diamond']) {
    const id = await diagram(page, shape, 300, 220)
    const outline = await page.locator(`.graph-port[data-node-id="${id}"]`).evaluateAll(ports => ports.map(port => {
      const x = (parseFloat(port.style.left) - 420) / 120, y = (parseFloat(port.style.top) - 280) / 60
      return { x, y }
    }))
    expect(outline).toHaveLength(12)
    for (const { x, y } of outline) expect(shape === 'ellipse' ? x * x + y * y : Math.abs(x) + Math.abs(y)).toBeCloseTo(1, 3)
  }
  await page.screenshot({ path: info.outputPath('expanded-outline-ports.png') })
})


test('legacy diagram wrappers do not gain a Frame title or a second painted rectangle', async ({ page }, info) => {
  await open(page)
  const ids = await page.evaluate(async () => {
    const { makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts')
    const node = makeDiagram('rounded', 320, 220, 'video_books', 360, 180, '#ffe5e3', '#cc4944')
    node.name = 'frame'; node.fill = '#cc4944'
    node.add({ tag: 'Text', name: 'frame-title', text: 'Frame', x: 10, y: 8, fontSize: 13, fill: '#6257e8' })
    const other = makeDiagram('rounded', 760, 460, 'video_book_dot_progress')
    for (const item of [node, other]) window.demo.handle.addElement(item.toJSON())
    const ids = { node: node.id, other: other.id }; node.destroy(); other.destroy(); window.demo.handle.flush(); window.demo.handle.select([ids.node]); return ids
  })
  let node = (await scene(page)).find(n => n.id === ids.node)
  expect(node.name).toBe('diagram-node'); expect(node.fill).toBe('transparent')
  expect(node.children.map(n => n.name)).toEqual(['diagram-body', 'text'])
  expect(node.children[0].fill).toBe('#ffe5e3')
  await page.getByRole('button', { name: '填充', exact: true }).click()
  await page.getByRole('button', { name: '填充 #3370ff', exact: true }).click()
  await expect(page.getByRole('menu', { name: '填充', exact: true })).toHaveCount(0)
  await page.evaluate(() => window.demo.handle.updateSelection({ width: 460, height: 240 }))
  node = (await scene(page)).find(n => n.id === ids.node)
  expect(node.fill).toBe('transparent'); expect(node.children[0]).toMatchObject({ fill: '#3370ff', width: 460, height: 240 })
  await expect.poll(() => page.locator(`.graph-port[data-node-id="${ids.node}"][data-port-x="1"][data-port-y="0.5"]`).evaluate(port => [parseFloat(port.style.left), parseFloat(port.style.top)])).toEqual([780, 340])
  await page.screenshot({ path: info.outputPath('legacy-diagram-repaired.png') })
  const saved = await scene(page)
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await page.waitForFunction(() => window.demo?.handle)
  expect(await scene(page)).toEqual(saved)
})
