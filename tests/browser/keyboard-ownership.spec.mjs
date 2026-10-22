import { writeFileSync } from 'node:fs'
import { test, expect } from './fixtures.mjs'

const read = page => page.evaluate(() => ({ scene: window.demo.model.getValue().scene, updates: window.demo.allUpdates.length, selection: window.demo.handle.getSelection() }))
async function open(page) {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.handle.select(['rect-a']))
  expect((await read(page)).selection.map(item => item.id)).toEqual(['rect-a'])
}
async function field(page, kind, inside = false) {
  await page.evaluate(({ kind, inside }) => {
    const node = document.createElement(kind === 'input' || kind === 'textarea' ? kind : 'div')
    node.id = 'keyboard-draft'; node.setAttribute('aria-label', 'Host keyboard draft')
    if (!['input', 'textarea'].includes(kind)) node.setAttribute('contenteditable', kind === 'empty' ? '' : kind)
    Object.assign(node.style, { position: 'fixed', zIndex: '20000', top: '80px', right: '20px', width: '220px', height: '70px', background: 'white', border: '1px solid #555' })
    ;(inside ? document.querySelector('.canvas-app') : document.body).append(node)
  }, { kind, inside })
  const input = page.locator('#keyboard-draft'); await input.fill('Host draft'); await input.click()
  return input
}

test('external comment textarea Backspace retains the selected canvas object and zero writes', async ({ page }, info) => {
  await open(page); const initial = await read(page), input = await field(page, 'textarea')
  expect(await read(page)).toEqual(initial)
  await input.press('End'); await input.press('Backspace')
  await expect(input).toHaveValue('Host draf')
  await page.waitForTimeout(350)
  expect(await read(page)).toEqual(initial)
  writeFileSync(info.outputPath('keyboard-ownership.json'), JSON.stringify({ baseline: initial, after: await read(page) }, null, 2))
})

for (const inside of [false, true]) for (const kind of ['input', 'textarea', 'true', 'empty', 'plaintext-only']) test(`${inside ? 'same canvas control' : 'host field'} ${kind} owns editing, arrows, selection, undo and native clipboard`, async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await open(page); const baseline = await read(page), input = await field(page, kind, inside)
  for (const key of ['End', 'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'Shift+ArrowRight', 'ControlOrMeta+a', 'ControlOrMeta+z', 'ControlOrMeta+Shift+z', 'Control+a', 'Meta+a', 'Enter', 'Escape', 'Space']) {
    await input.press(key)
    expect(await read(page), key).toEqual(baseline)
  }
  await input.fill('Only this draft')
  await input.press('ControlOrMeta+a'); await input.press('ControlOrMeta+c'); await input.press('ControlOrMeta+x')
  await expect.poll(() => input.evaluate(node => 'value' in node ? node.value : node.textContent)).toBe('')
  expect(await read(page)).toEqual(baseline)
  await input.press('ControlOrMeta+v')
  await expect.poll(() => input.evaluate(node => 'value' in node ? node.value : node.textContent)).toBe('Only this draft')
  await page.waitForTimeout(250)
  expect(await read(page)).toEqual(baseline)
  await expect(input).toBeFocused()
})

test('focused canvas nudge has one native transform, Delete undo/redo and real clipboard still work', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await open(page); const start = await read(page)
  const canvas = page.locator('.canvas-app'); await canvas.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await read(page)).selection[0]?.x).toBe(start.selection[0].x + 1)
  await page.keyboard.press('Shift+ArrowDown')
  await expect.poll(async () => (await read(page)).selection[0]?.y).toBe(start.selection[0].y + 10)
  await page.evaluate(() => window.demo.handle.flush())
  const moved = await read(page)
  await page.keyboard.press('Delete')
  await expect.poll(async () => (await read(page)).scene.children.length).toBe(2)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await read(page)).scene).toEqual(moved.scene)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await read(page)).scene.children.length).toBe(2)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await read(page)).scene).toEqual(moved.scene)
  await page.evaluate(() => window.demo.handle.select(['rect-a']))
  await canvas.focus(); await page.keyboard.press('ControlOrMeta+c'); await page.keyboard.press('ControlOrMeta+v')
  await expect.poll(async () => (await read(page)).scene.children.length).toBe(4)
  const copied = await read(page); expect(copied.selection).toHaveLength(1); expect(copied.selection[0].id).not.toBe('rect-a')
  await page.keyboard.press('ControlOrMeta+x')
  await expect.poll(async () => (await read(page)).scene.children.length).toBe(3)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await read(page)).scene).toEqual(copied.scene)
  await page.keyboard.press('ControlOrMeta+a'); expect((await read(page)).selection).toHaveLength(4)
})

test('a host-prevented current canvas key and readonly editing keys produce no content writes', async ({ page }) => {
  await open(page); const baseline = await read(page)
  await page.evaluate(() => {
    window.keyboardPrevent = event => { if (event.key === 'Delete' || event.key.startsWith('Arrow')) event.preventDefault() }
    document.addEventListener('keydown', window.keyboardPrevent, true)
  })
  await page.locator('.canvas-app').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Delete')
  expect(await read(page)).toEqual(baseline)
  await page.evaluate(() => { document.removeEventListener('keydown', window.keyboardPrevent, true); window.demo.setMode('readonly') })
  await page.waitForFunction(() => window.demo.model.readOnly && document.querySelector('.canvas-app').classList.contains('is-readonly'))
  await page.locator('.canvas-app').focus()
  const readonly = await read(page)
  for (const key of ['ArrowRight', 'Shift+ArrowDown', 'Delete', 'Backspace', 'ControlOrMeta+z', 'ControlOrMeta+Shift+z', 'ControlOrMeta+d']) await page.keyboard.press(key)
  expect(await read(page)).toEqual(readonly)
  await page.evaluate(() => window.demo.setMode('edit'))
  await page.waitForFunction(() => !window.demo.model.readOnly && !document.querySelector('.canvas-app').classList.contains('is-readonly'))
  await page.locator('.canvas-app').focus(); await page.keyboard.press('ArrowRight')
  expect((await read(page)).selection[0].x).toBe(baseline.selection[0].x + 1)
})

test('an open format dropdown does not consume host autofocus arrows or Enter', async ({ page }) => {
  await open(page); const input = await field(page, 'input')
  await page.evaluate(() => window.demo.handle.select(['text-a']))
  const font = page.locator('.selection-actions').getByRole('combobox', { name: '字体大小', exact: true })
  await font.click(); await expect(page.getByRole('listbox')).toBeVisible()
  const baseline = await read(page)
  // Programmatic host autofocus deliberately does not dismiss via pointerdown.
  await input.focus(); await input.press('ArrowDown'); await input.press('ArrowUp'); await input.press('Enter'); await input.press('Escape')
  await expect(input).toBeFocused(); await expect(page.getByRole('listbox')).toBeVisible()
  expect(await read(page)).toEqual(baseline)
})

test('Space belongs to its focused canvas and releases after focus changes and blur', async ({ page }) => {
  await open(page); const input = await field(page, 'textarea')
  const content = await page.evaluate(() => ({ scene: window.demo.model.getValue().scene, updates: window.demo.allUpdates.length }))
  const position = () => page.evaluate(() => window.demo.handle.clientToScene({ x: 1000, y: 650 }))
  const before = await position()
  const drag = async () => { await page.mouse.move(1050, 650); await page.mouse.down(); await page.mouse.move(1110, 690, { steps: 5 }); await page.mouse.up() }
  await input.focus(); await page.keyboard.down('Space'); await drag(); await page.keyboard.up('Space')
  expect(await position()).toEqual(before)
  await page.locator('.canvas-app').focus(); await page.keyboard.down('Space'); await drag()
  const panned = await position(); expect(panned).not.toEqual(before)
  await input.focus(); await page.keyboard.up('Space')
  await expect(page.locator('.canvas-stage')).not.toHaveClass(/is-panning/)
  await drag(); expect(await position()).toEqual(panned)
  await page.locator('.canvas-app').focus(); await page.keyboard.down('Space')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.locator('.canvas-stage')).not.toHaveClass(/is-panning/)
  await page.keyboard.up('Space')
  expect(await page.evaluate(() => ({ scene: window.demo.model.getValue().scene, updates: window.demo.allUpdates.length }))).toEqual(content)
})

const pairState = page => page.evaluate(() => ({ ...Object.fromEntries(Object.entries(window.keyboardHosts).map(([name, host]) => [name, { scene: host.model.getValue().scene, updates: host.updates.length, selection: host.handle.getSelection() }])), errors: window.keyboardErrors }))
for (const kind of ['table', 'note', 'mind']) test(`two canvases: retained ${kind} selection cannot consume another canvas keys or native clipboard`, async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']); await page.setViewportSize({ width: 1800, height: 1100 })
  await page.goto(`/tests/browser/data/keyboard-host.html?kind=${kind}`); await page.waitForFunction(() => window.keyboardHosts?.first?.handle && window.keyboardHosts?.second?.handle)
  await page.evaluate(kind => {
    window.keyboardHosts.first.handle.select([`keyboard-${kind}-${kind === 'note' ? '0' : '1'}`])
    window.keyboardHosts.second.handle.select(['second-rect'])
  }, kind)
  const baseline = await pairState(page); expect(baseline.first.updates).toBe(0); expect(baseline.second.updates).toBe(0)
  const comment = page.getByRole('textbox', { name: 'Host comment', exact: true }); await comment.click(); await comment.press('Backspace'); await comment.press('Delete'); await comment.press('ArrowRight'); await comment.press('ControlOrMeta+a')
  expect(await pairState(page)).toEqual(baseline)
  await page.locator('#second .canvas-app').focus(); await page.keyboard.press('F2'); await page.keyboard.type('q')
  await expect(page.locator('#first [data-slate-editor],#first .canvas-plain-text-editor')).toHaveCount(0)
  expect((await pairState(page)).first).toEqual(baseline.first)
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await pairState(page)).second.scene.children[0].x).toBe(281)
  await page.keyboard.press('ControlOrMeta+c'); await page.keyboard.press('ControlOrMeta+v')
  await expect.poll(async () => (await pairState(page)).second.scene.children.length).toBe(2)
  expect((await pairState(page)).first).toEqual(baseline.first)
  await page.keyboard.press('Delete')
  await expect.poll(async () => (await pairState(page)).second.scene.children.length).toBe(1)
  const after = await pairState(page); expect(after.first).toEqual(baseline.first); expect(after.errors).toEqual([])
})

test('a focused keyboard nudge owns one container membership change with undo, peer convergence and reopen', async ({ page, context }) => {
  await open(page)
  const url = await page.evaluate(() => {
    const model = window.demo.model.constructor.initialize(crypto.randomUUID(), { version: 1, scene: { tag: 'Leafer', children: [
      { id: 'nudge-board', tag: 'Frame', name: 'frame', x: 400, y: 150, width: 300, height: 220, fill: '#ffffff', stroke: '#b8bec9', strokeWidth: 1, editable: true, hitChildren: false, data: { kind: 'container', containerType: 'board', title: 'Keyboard target' }, children: [] },
      { id: 'nudge-rect', tag: 'Rect', name: 'rect', x: 394, y: 200, width: 10, height: 10, fill: '#5075aa', editable: true },
    ] } })
    const checkpoint = model.checkpoint(), target = new URL('/examples/doca/', location.origin)
    target.searchParams.set('epoch', checkpoint.epochId); target.searchParams.set('checkpoint', btoa(String.fromCharCode(...checkpoint.update))); model.dispose(); return target.href
  })
  await page.goto(url); await page.waitForFunction(() => window.demo?.handle)
  const peer = await context.newPage(); await peer.goto(url); await peer.waitForFunction(() => window.demo?.handle)
  await page.bringToFront(); await page.evaluate(() => window.demo.handle.select(['nudge-rect'])); await page.locator('.canvas-app').focus()
  const before = await read(page)
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await read(page)).scene.children.find(item => item.id === 'nudge-board').children?.find(item => item.id === 'nudge-rect')?.x).toBe(-5)
  const moved = await read(page); expect(moved.updates - before.updates).toBe(1)
  await expect.poll(async () => (await read(peer)).scene).toEqual(moved.scene); expect((await read(peer)).updates).toBe(0)
  await page.keyboard.press('ControlOrMeta+z'); await expect.poll(async () => (await read(page)).scene).toEqual(before.scene)
  await page.keyboard.press('ControlOrMeta+Shift+z'); await expect.poll(async () => (await read(page)).scene).toEqual(moved.scene)
  await expect.poll(async () => (await read(peer)).scene).toEqual(moved.scene); expect((await read(peer)).updates).toBe(0)
  const ready = await page.evaluate(() => { const ready = window.demo.readyCount, reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint); return ready })
  await page.waitForFunction(ready => window.demo.readyCount > ready, ready)
  expect((await read(page)).scene).toEqual(moved.scene)
  await peer.close()
})

test('real image clipboard stays with a focused host control, while focused canvas paste still uploads once', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']); await open(page)
  const baseline = await read(page)
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 8
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#3281de'; ctx.fillRect(0, 0, 8, 8)
    const image = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': image })])
    const control = document.createElement('div'); control.id = 'host-image-control'; control.setAttribute('role', 'textbox'); control.tabIndex = 0
    control.textContent = 'Host-controlled input'; Object.assign(control.style, { position: 'fixed', top: '80px', right: '20px', zIndex: '20000', background: 'white' })
    document.querySelector('.canvas-app').append(control)
    window.keyboardPasteEvents = []
    document.addEventListener('paste', event => window.keyboardPasteEvents.push({ id: event.target.id, files: event.clipboardData.files.length }), true)
    control.focus()
  })
  await page.keyboard.press('ControlOrMeta+v')
  await expect.poll(() => page.evaluate(() => window.keyboardPasteEvents.some(event => event.id === 'host-image-control' && event.files === 1))).toBe(true)
  await page.waitForTimeout(350)
  expect(await read(page)).toEqual(baseline)
  expect(await page.evaluate(() => window.demo.resourceLog.filter(event => event.type === 'upload').length)).toBe(0)
  await page.locator('.canvas-app').focus(); await page.keyboard.press('ControlOrMeta+v')
  await expect.poll(async () => (await read(page)).scene.children.length).toBe(baseline.scene.children.length + 1)
  expect(await page.evaluate(() => window.demo.resourceLog.filter(event => event.type === 'upload').length)).toBe(1)
})
