import { test, expect } from './fixtures.mjs'

const previews = page => page.evaluate(() => window.demo.resourceLog.filter(e => e.type === 'preview'))
const value = page => page.evaluate(() => window.demo.model.getValue())
async function open(page, mimeType = 'image/png') {
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  return page.evaluate(async mimeType => {
    window.demo.model.remove(window.demo.model.getValue().scene.children.map(n => n.id))
    const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 32
    const c = canvas.getContext('2d'); c.fillStyle = '#3370ff'; c.fillRect(0, 0, 48, 32)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType))
    await window.demo.handle.insertImageFile(new File([blob], mimeType === 'image/png' ? 'idea.png' : 'idea.jpg', { type: mimeType }), { x: 340, y: 240, width: 180 })
    window.demo.handle.flush(); window.demo.handle.select([])
    return window.demo.model.getValue().scene.children[0]
  }, mimeType)
}
async function click(page, x = 420, y = 290, options) { await page.locator('.canvas-host').click({ position: { x, y }, ...options }) }
async function readClipboard(page) {
  return page.evaluate(async () => {
    try {
    const items = await navigator.clipboard.read()
    if (!items[0]?.types.includes('image/png')) return { types: items[0]?.types }
    const blob = await items[0].getType('image/png')
    const bitmap = await createImageBitmap(blob), canvas = document.createElement('canvas')
    canvas.width = bitmap.width; canvas.height = bitmap.height
    const c = canvas.getContext('2d'); c.drawImage(bitmap, 0, 0); bitmap.close()
    return { types: items[0].types, width: canvas.width, height: canvas.height, pixel: [...c.getImageData(20, 20, 1, 1).data], bytes: [...new Uint8Array(await blob.arrayBuffer())] }
    } catch (error) { if (error.name === 'InvalidStateError') return { pending: true }; throw error }
  })
}

for (const readonly of [false, true]) test(`canvas image selects first, previews next, and resets after deselection (${readonly ? 'readonly' : 'editable'})`, async ({ page, context }) => {
  const image = await open(page)
  const peer = await context.newPage(); await peer.goto(await page.evaluate(() => window.demo.link)); await peer.waitForFunction(() => window.demo?.handle)
  if (readonly) await page.evaluate(() => window.demo.setMode('readonly'))
  const before = await value(page), updates = await page.evaluate(() => window.demo.allUpdates.length)
  await click(page); expect(await previews(page)).toHaveLength(0)
  expect(await page.evaluate(() => window.demo.handle.getSelection().map(n => n.id))).toEqual([image.id])
  await click(page); expect(await previews(page)).toHaveLength(1)
  expect((await previews(page))[0].resource).toMatchObject({ kind: 'image', id: image.id, path: image.data.resourcePath, name: 'idea.png', width: 48, height: 32 })
  await click(page, 950, 600); await click(page); expect(await previews(page)).toHaveLength(1)
  await click(page); expect(await previews(page)).toHaveLength(2)
  expect(await value(page)).toEqual(before); expect(await value(peer)).toEqual(before)
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
})

test('moving, resizing, panning and modified clicks never preview an image', async ({ page }) => {
  await open(page); await click(page)
  const host = await page.locator('.canvas-host').boundingBox()
  await page.mouse.move(host.x + 420, host.y + 290); await page.mouse.down()
  await page.mouse.move(host.x + 480, host.y + 330, { steps: 12 }); await page.mouse.up()
  expect(await previews(page)).toHaveLength(0)
  await page.evaluate(() => window.demo.handle.flush())
  const moved = (await value(page)).scene.children[0]
  expect(moved.x).toBeGreaterThan(340); expect(moved.y).toBeGreaterThan(240)
  await click(page, 580, 400); expect(await previews(page)).toHaveLength(0)
  await page.mouse.move(host.x + 580, host.y + 400); await page.mouse.down()
  await page.mouse.move(host.x + 640, host.y + 440, { steps: 12 }); await page.mouse.up()
  expect(await previews(page)).toHaveLength(0)
  await page.evaluate(() => window.demo.handle.flush())
  expect((await value(page)).scene.children[0].width).toBeGreaterThan(moved.width)
  await click(page, 470, 320, { modifiers: ['Shift'] }); expect(await previews(page)).toHaveLength(0)
  await page.keyboard.down('Space'); await click(page, 470, 320); await page.keyboard.up('Space')
  expect(await previews(page)).toHaveLength(0)
})

for (const [mime, readonly] of [['image/png', false], ['image/jpeg', false], ['image/png', true]]) test(`right-click copies actual ${mime} pixels as PNG with authorization and without content writes (${readonly ? 'readonly' : 'editable'})`, async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const image = await open(page, mime), before = await value(page), updates = await page.evaluate(() => window.demo.allUpdates.length)
  if (readonly) await page.evaluate(() => window.demo.setMode('readonly'))
  await page.evaluate(() => navigator.clipboard.writeText('before-image-copy'))
  await click(page, 420, 290, { button: 'right' })
  await page.getByRole('menuitem', { name: '复制图片', exact: true }).click()
  await expect.poll(() => readClipboard(page)).toMatchObject({ types: ['image/png'], width: 48, height: 32 })
  const first = await readClipboard(page)
  expect(first.pixel[3]).toBe(255); expect(first.pixel[2]).toBeGreaterThan(245)
  expect(await page.evaluate(() => window.demo.resourceLog.filter(e => e.type === 'download').map(e => e.path))).toContain(image.data.resourcePath)
  await page.evaluate(() => { window.demo.resourceControls.denyDownload = true })
  await click(page, 420, 290, { button: 'right' }); await page.getByRole('menuitem', { name: '复制图片', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.demo.errors.at(-1))).toContain('DOWNLOAD_DENIED')
  expect(await readClipboard(page)).toEqual(first)
  expect(await previews(page)).toHaveLength(0); expect(await value(page)).toEqual(before)
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
})

test('rich-image context menu copies image bytes through the same host authorization', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const image = await open(page)
  await page.evaluate(async image => {
    const { makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts')
    const card = makeDiagram('rounded', 340, 180, 'Image', 300, 280)
    card.name = 'card'; card.data = { kind: 'card' }
    const label = card.children[1]
    label.text = 'Image\n\uFFFC'; label.verticalAlign = 'top'
    label.data = { richText: { version: 1, value: [{ type: 'paragraph', children: [{ text: 'Image' }] }, { type: 'paragraph', resource: { id: 'rich-image', kind: 'image', path: image.data.resourcePath, name: 'idea.png', width: 120, height: 80 }, children: [{ text: '' }] }] } }
    window.demo.model.remove([image.id]); window.demo.handle.addElement(card.toJSON()); card.destroy(); window.demo.handle.flush()
  }, image)
  await page.locator('.canvas-host').dblclick({ position: { x: 380, y: 206 } })
  const img = page.locator('[data-resource-kind=image] img'); await expect(img).toBeVisible()
  const before = await value(page), updates = await page.evaluate(() => window.demo.allUpdates.length)
  await page.evaluate(() => navigator.clipboard.writeText('before-rich-image-copy'))
  await img.click({ button: 'right' }); await page.getByRole('menuitem', { name: '复制图片', exact: true }).click()
  await expect.poll(() => readClipboard(page)).toMatchObject({ types: ['image/png'], width: 48, height: 32 })
  expect(await value(page)).toEqual(before); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
})

test('clipboard rejection is reported without changing the image', async ({ page }) => {
  await open(page); const before = await value(page)
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: () => Promise.reject(new Error('CLIPBOARD_DENIED')) } }) })
  await click(page, 420, 290, { button: 'right' }); await page.getByRole('menuitem', { name: '复制图片', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.demo.errors.at(-1))).toContain('CLIPBOARD_DENIED')
  expect(await value(page)).toEqual(before)
})
