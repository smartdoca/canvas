import { writeFile, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { test, expect } from './fixtures.mjs'

async function open(page) {
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 60
    const context = canvas.getContext('2d'); context.fillStyle = '#cc3311'; context.fillRect(0, 0, 60, 60); context.fillStyle = '#1133cc'; context.fillRect(60, 0, 60, 60)
    window.files = {}
    for (const [type, ext] of [['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp']]) window.files[ext] = new File([await new Promise(resolve => canvas.toBlob(resolve, type))], `sample.${ext}`, { type })
    window.files.svg = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" viewBox="0 0 120 60"><path fill="#339955" d="M0 0h120v60H0Z"/><text x="5" y="35" font-size="20">中文 😀</text></svg>'], 'sample.svg', { type: 'image/svg+xml' })
  })
}
const value = page => page.evaluate(() => window.demo.model.getValue())

test('real PNG/JPEG/WebP/SVG detection, aspect fit, one local operation, undo/redo, same-account sync and reload', async ({ page, context }) => {
  await open(page)
  const second = await context.newPage(); await second.goto(await page.evaluate(() => window.demo.link)); await second.waitForFunction(() => window.demo?.handle)
  for (const ext of ['png', 'jpg', 'webp', 'svg']) {
    const count = await page.evaluate(() => window.demo.allUpdates.length)
    const result = await page.evaluate(async ext => {
      const parsed = await window.demo.io.parseCanvasFile(window.files[ext])
      const inserted = await window.demo.handle.insertImageFile(window.files[ext], { x: 17, y: 23, width: 240, height: 100 })
      return { parsed: { kind: parsed.kind, format: parsed.format, width: parsed.width, height: parsed.height }, inserted }
    }, ext)
    expect(result.parsed.width / result.parsed.height).toBe(2)
    expect(result.inserted.element.width).toBe(200); expect(result.inserted.element.height).toBe(100)
    expect(result.inserted.element.x).toBe(17); expect(result.inserted.element.y).toBe(23)
    expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(count + 1)
    await expect.poll(async () => JSON.stringify(await value(page)) === JSON.stringify(await value(second))).toBe(true)
    await page.evaluate(() => window.demo.handle.undo())
    expect((await value(page)).scene.children.some(n => n.id === result.inserted.elementId)).toBe(false)
    await page.evaluate(() => window.demo.handle.redo())
    await expect.poll(async () => JSON.stringify(await value(page)) === JSON.stringify(await value(second))).toBe(true)
    const saved = await value(page)
    await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
    expect(await value(page)).toEqual(saved)
    expect(JSON.stringify(saved)).not.toMatch(/data:image|blob:/)
  }
  const centered = await page.evaluate(async () => {
    const box = document.querySelector('.canvas-host').getBoundingClientRect(), center = window.demo.handle.clientToScene({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
    return { center, result: await window.demo.handle.insertImageFile(window.files.png) }
  })
  expect(centered.result.element.x + centered.result.element.width / 2).toBeCloseTo(centered.center.x)
  expect(centered.result.element.y + centered.result.element.height / 2).toBeCloseTo(centered.center.y)
  expect(await second.evaluate(() => window.demo.allUpdates.length)).toBe(0)
})

test('parse for a NEW canvas is separate from active model, SVG stays one portable vector asset', async ({ page }) => {
  await open(page)
  const before = await value(page)
  const result = await page.evaluate(async () => {
    const parsed = await window.demo.io.parseCanvasFile(window.files.svg)
    const resource = await window.demo.resources.uploadImage(parsed.resources[0].blob, { source: 'api' })
    const value = window.demo.io.createCanvasImportValue(parsed, { [parsed.resources[0].id]: resource.path })
    return { value, source: await parsed.resources[0].blob.text() }
  })
  expect(result.value.scene.children).toHaveLength(1)
  expect(result.value.scene.children[0].tag).toBe('Image')
  expect(result.value.scene.children[0].data.assetKind).toBe('vector')
  expect(result.source).toContain('<path')
  expect(result.value).not.toHaveProperty('epochId')
  expect(await value(page)).toEqual(before)
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(0)
})

test('unsafe SVG is sanitized without network; corrupted, spoofed, oversize and editor metadata fail explicitly', async ({ page }) => {
  await open(page)
  const external = []; page.on('request', request => { if (request.url().includes('evil.example')) external.push(request.url()) })
  const result = await page.evaluate(async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" onload="alert(1)"><script>alert(1)</script><foreignObject><div>bad</div></foreignObject><style>@import "https://evil.example/a.css";</style><image href="https://evil.example/a.png" width="10" height="10"/><path style="fill:red;stroke:url(https://evil.example/a)" d="M0 0H90V40H0Z" onclick="alert(1)"/></svg>'
    const safe = await window.demo.io.parseCanvasFile(new Blob([svg], { type: 'image/svg+xml' }))
    const errors = []
    const bad = [new File([window.files.png], 'fake.jpg', { type: 'image/png' }), new File([window.files.png], 'fake.png', { type: 'image/jpeg' }), new Blob(['broken'], { type: 'image/png' }), new Blob([new Uint8Array(11 * 1024 * 1024)], { type: 'image/png' }), new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="20000" height="20000"/>'], { type: 'image/svg+xml' }), new Blob(['<!DOCTYPE svg [<!ENTITY x "bad">]><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>'], { type: 'image/svg+xml' }), new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><use href="#cycle" id="cycle"/></svg>'], { type: 'image/svg+xml' }), new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><metadata>{"format":"aidcanvas","version":999}</metadata></svg>'], { type: 'image/svg+xml' })]
    for (const file of bad) { try { await window.demo.io.parseCanvasFile(file); errors.push('NOT_REJECTED') } catch (e) { errors.push(e.code || e.name) } }
    const controller = new AbortController(); controller.abort()
    try { await window.demo.io.parseCanvasFile(window.files.png, { signal: controller.signal }) } catch (e) { errors.push(e.code) }
    return { svg: await safe.resources[0].blob.text(), warnings: safe.warnings, errors }
  })
  expect(result.svg).not.toMatch(/script|onload|onclick|foreignObject|evil.example|<style/)
  expect(result.svg).toContain('fill="red"')
  expect(result.warnings.length).toBeGreaterThan(0)
  expect(result.errors).toEqual(['FILE_EXTENSION_MISMATCH', 'FILE_MIME_MISMATCH', 'INVALID_SVG', 'FILE_TOO_LARGE', 'IMAGE_DIMENSIONS_EXCEEDED', 'SVG_DTD_FORBIDDEN', 'SVG_REFERENCE_CYCLE', 'EDITABLE_SVG_UNSUPPORTED', 'CANCELLED'])
  expect(external).toEqual([])
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(0)
})

test('upload failure, explicit cancellation, permission revocation and disposal never insert late', async ({ page }) => {
  await open(page)
  for (const scenario of ['failure', 'cancel', 'readonly', 'dispose']) {
    await page.evaluate(scenario => {
      window.demo.resourceControls.failUpload = scenario === 'failure'; window.demo.resourceControls.hold = scenario !== 'failure'
      window.controller = new AbortController()
      window.pendingImport = window.demo.handle.insertImageFile(window.files.png, { signal: window.controller.signal }).then(() => 'INSERTED', e => e.code || e.message)
    }, scenario)
    if (scenario !== 'failure') {
      await expect.poll(() => page.evaluate(() => typeof window.demo.resourceControls.complete)).toBe('function')
      await page.evaluate(scenario => { if (scenario === 'cancel') window.controller.abort(); if (scenario === 'readonly') window.demo.setMode('readonly'); if (scenario === 'dispose') window.saved = window.demo.closeDocument() }, scenario)
      if (scenario === 'readonly') await expect(page.locator('.canvas-app')).toHaveClass(/is-readonly/)
      await page.evaluate(() => window.demo.resourceControls.complete())
    }
    expect(await page.evaluate(() => window.pendingImport)).not.toBe('INSERTED')
    expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(0)
    if (scenario === 'readonly') { await page.evaluate(() => window.demo.setMode('edit')); await expect(page.locator('.canvas-app')).not.toHaveClass(/is-readonly/) }
    if (scenario === 'dispose') await page.evaluate(() => window.demo.openDocument(window.saved))
    await page.evaluate(() => window.demo.resourceControls.complete = null)
  }
  expect((await value(page)).scene.children).toHaveLength(3)
})

test('true vector SVG and PNG open independently: Chinese/emoji, group transforms, arrows, rough, shadow and embedded images; export has zero writes', async ({ page, context }, testInfo) => {
  await open(page)
  for (const ext of ['png', 'jpg', 'webp', 'svg']) {
    const bytes = await page.evaluate(async ext => [...new Uint8Array(await window.files[ext].arrayBuffer())], ext)
    await writeFile(testInfo.outputPath(`input.${ext}`), Buffer.from(bytes))
  }
  await page.evaluate(async () => {
    window.demo.model.remove(['rect-a', 'rect-b', 'text-a'])
    window.demo.model.add({ id: 'group', tag: 'Group', x: 80, y: 80, rotation: 12, children: [
      { id: 'box', tag: 'Rect', name: 'rect', width: 180, height: 90, fill: '#ffc9c9', stroke: '#aa1111', strokeWidth: 4, shadow: { x: 8, y: 10, blur: 8, color: '#777777' } },
      { id: 'text', tag: 'Text', x: 5, y: 20, text: '中文 😀\nVector text', fontSize: 20, fill: '#111111' },
    ] })
    window.demo.model.add({ id: 'arrow', tag: 'Arrow', name: 'arrow', x: 80, y: 260, width: 200, height: 50, stroke: '#2255aa', strokeWidth: 6, startArrow: 'circle', endArrow: 'triangle' })
    window.demo.model.add({ id: 'rough', tag: 'Rect', name: 'rect', x: 330, y: 80, width: 160, height: 100, stroke: '#225522', fill: '#b2f2bb', data: { roughMode: true, roughSeed: 321, roughOriginalFill: '#b2f2bb', roughFillStyle: 'cross-hatch', roughStrokeStyle: 1 } })
    await window.demo.handle.insertImageFile(window.files.png, { x: 330, y: 240, width: 160 })
    await window.demo.handle.insertImageFile(window.files.svg, { x: 330, y: 350, width: 160 })
    window.demo.handle.select(['group', 'rough'])
    window.demo.setAnchors([{ anchorId: 'COMMENT-PRIVATE', anchor: window.demo.model.captureAnchor(['rough']) }])
  })
  await page.waitForTimeout(250)
  const before = await page.evaluate(() => ({ value: window.demo.model.getValue(), selection: window.demo.handle.getSelection().map(x => x.id), updates: window.demo.allUpdates.length, undo: window.demo.model.canUndo, redo: window.demo.model.canRedo, state: document.querySelector('.save-status').textContent }))
  for (const format of ['svg', 'png']) {
    const result = await page.evaluate(async format => {
      const r = await window.demo.handle.exportFile({ format, scale: 2, background: 'transparent', filename: '中文画板' })
      return { bytes: [...new Uint8Array(await r.blob.arrayBuffer())], filename: r.filename, mimeType: r.mimeType, width: r.width, height: r.height, warnings: r.warnings }
    }, format)
    expect(result.width).toBeGreaterThan(600); expect(result.height).toBeGreaterThan(400)
    const file = testInfo.outputPath(`real-output.${format}`); await writeFile(file, Buffer.from(result.bytes))
    const viewer = await context.newPage(); await viewer.goto(pathToFileURL(file).href)
    if (format === 'svg') {
      const source = await readFile(file, 'utf8')
      expect(source).toContain('<path'); expect(source).toContain('<text'); expect(source).toContain('中文'); expect(source).toContain('😀'); expect(source).toContain('<pattern'); expect(source).toContain('<filter')
      expect(source).not.toMatch(/COMMENT-PRIVATE|epochId|resourcePath|blob:|http:\/\/127|<metadata/)
      expect(await viewer.locator('svg > g').count()).toBeGreaterThan(2)
      expect(result.warnings.some(w => w.code === 'FONT_NOT_EMBEDDED_SYSTEM_FALLBACK')).toBe(true)
    } else {
      await expect.poll(() => viewer.locator('img').evaluate(e => e.naturalWidth)).toBe(result.width)
      expect(await viewer.locator('img').evaluate(e => e.naturalHeight)).toBe(result.height)
    }
    await viewer.setViewportSize({ width: Math.min(1400, result.width + 32), height: Math.min(1100, result.height + 32) })
    await viewer.screenshot({ path: testInfo.outputPath(`${format}-independent-viewer.png`) })
    await viewer.close()
  }
  const after = await page.evaluate(() => ({ value: window.demo.model.getValue(), selection: window.demo.handle.getSelection().map(x => x.id), updates: window.demo.allUpdates.length, undo: window.demo.model.canUndo, redo: window.demo.model.canRedo, state: document.querySelector('.save-status').textContent }))
  expect(after).toEqual(before)
})

test('host picker, drop and clipboard files share insertion; Cmd/Ctrl+V is not swallowed', async ({ page }) => {
  await open(page)
  const bytes = await page.evaluate(async () => [...new Uint8Array(await window.files.png.arrayBuffer())])
  await page.getByLabel('宿主选择图片').setInputFiles({ name: 'picker.png', mimeType: 'image/png', buffer: Buffer.from(bytes) })
  await expect.poll(() => page.evaluate(() => window.demo.allUpdates.length)).toBe(1)
  for (const kind of ['drop', 'paste']) {
    await page.evaluate(kind => {
      const element = document.querySelector('.canvas-host'), data = new DataTransfer(); data.items.add(window.files.png)
      const event = kind === 'drop' ? new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data, clientX: 200, clientY: 200 }) : new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data })
      element.dispatchEvent(event)
    }, kind)
    await expect.poll(() => page.evaluate(() => window.demo.allUpdates.length)).toBe(kind === 'drop' ? 2 : 3)
  }
  expect(await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true })
    document.querySelector('.canvas-host').dispatchEvent(event); return event.defaultPrevented
  })).toBe(false)
  expect(await page.locator('input[accept="application/json"]').count()).toBe(0)
})

test('readonly export, asset authorization failure and in-flight export cancellation leave model and undo untouched', async ({ page }) => {
  await open(page)
  await page.evaluate(async () => { await window.demo.handle.insertImageFile(window.files.png); window.demo.setMode('readonly') })
  await expect(page.locator('.canvas-app')).toHaveClass(/is-readonly/)
  const result = await page.evaluate(async () => {
    const before = JSON.stringify(window.demo.model.getValue()), updates = window.demo.allUpdates.length, errors = []
    const ok = await window.demo.handle.exportFile({ format: 'svg' })
    window.demo.resourceControls.failRead = true
    try { await window.demo.handle.exportFile({ format: 'png' }) } catch (e) { errors.push(e.code) }
    window.demo.resourceControls.failRead = false
    const controller = new AbortController()
    const pending = window.demo.handle.exportFile({ format: 'png', signal: controller.signal, readAsset: () => { queueMicrotask(() => controller.abort()); return new Promise(() => {}) } })
    try { await pending } catch (e) { errors.push(e.code) }
    return { size: ok.blob.size, errors, unchanged: before === JSON.stringify(window.demo.model.getValue()), updates: window.demo.allUpdates.length - updates }
  })
  expect(result.size).toBeGreaterThan(0); expect(result.errors).toEqual(['ASSET_READ_FAILED', 'CANCELLED']); expect(result.unchanged).toBe(true); expect(result.updates).toBe(0)
})

test('bounded SVG references, explicit editable-data fallback, nested selection and all rough fills export deterministically', async ({ page }) => {
  await open(page)
  const result = await page.evaluate(async () => {
    const io = window.demo.io
    const parsed = await io.parseCanvasFile(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><defs><path id="p" d="M0 0h40v40H0Z"/></defs><use href="#p" x="20" fill="green"/></svg>'], { type: 'image/svg+xml' }))
    const degraded = await io.parseCanvasFile(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><metadata>{"format":"aidcanvas","version":999}</metadata><rect width="20" height="20" fill="red"/></svg>'], { type: 'image/svg+xml' }), { ignoreEditableData: true })
    const source = { scene: { children: [{ id: 'g', tag: 'Group', x: 20, y: 20, rotation: 25, children: [
      { id: 'yes', tag: 'Rect', width: 80, height: 80, fill: '#ff0000' }, { id: 'no', tag: 'Text', x: 100, text: 'PRIVATE-UNSELECTED' },
    ] }] } }
    const selection = await io.exportCanvasFile(source, { format: 'svg', scope: 'selection', elementIds: ['yes'] })
    const patterns = []
    for (const style of ['hachure', 'cross-hatch', 'zigzag-line', 'dots', 'solid']) {
      const scene = { scene: { children: [{ id: 'r', tag: 'Rect', name: 'rect', width: 100, height: 70, rotation: 20, scaleX: 1.2, fill: '#ffc9c9', stroke: '#333333', data: { roughMode: true, roughSeed: 781, roughOriginalFill: '#ffc9c9', roughFillStyle: style } }] } }
      const a = await io.exportCanvasFile(scene, { format: 'svg' }), b = await io.exportCanvasFile(scene, { format: 'svg' })
      const text = await a.blob.text(); patterns.push({ style, deterministic: text === await b.blob.text(), pattern: text.includes('<pattern'), raster: text.includes('data:image') })
    }
    return { safe: await parsed.resources[0].blob.text(), degraded: degraded.warnings, selection: await selection.blob.text(), patterns }
  })
  expect(result.safe).toContain('href="#p"'); expect(result.degraded.some(w => w.code === 'EDITABLE_DATA_IGNORED')).toBe(true)
  expect(result.selection).not.toContain('PRIVATE-UNSELECTED'); expect(result.selection).toContain('matrix(')
  for (const p of result.patterns) { expect(p.deterministic).toBe(true); expect(p.raster).toBe(false); expect(p.pattern).toBe(p.style !== 'solid') }
})

test('scope, transparent/color background, scale and memory limits, empty states, pending input and cancellation are explicit', async ({ page }) => {
  await open(page)
  const result = await page.evaluate(async () => {
    const io = window.demo.io, errors = []
    const scene = { scene: { children: [{ id: 'r', tag: 'Rect', x: 10, y: 20, width: 100, height: 50, fill: '#ff0000' }] } }
    const transparent = await io.exportCanvasFile(scene, { format: 'png' }), colored = await io.exportCanvasFile(scene, { format: 'png', background: '#00ff00', scale: 2 })
    const firstPixel = async blob => { const image = await createImageBitmap(blob), c = document.createElement('canvas'); c.width = c.height = 1; c.getContext('2d').drawImage(image, 0, 0); image.close(); return [...c.getContext('2d').getImageData(0, 0, 1, 1).data] }
    const testCases = [
      [{ scene: { children: [] } }, { format: 'svg' }],
      [scene, { format: 'png', scope: 'selection', elementIds: [] }],
      [scene, { format: 'svg', scope: 'selection', elementIds: ['missing'] }],
      [scene, { format: 'png', scale: 10 }],
      [{ scene: { children: [{ id: 'huge', tag: 'Rect', width: 20000, height: 20000 }] } }, { format: 'png' }],
      [scene, { format: 'svg', preserveEditData: true }],
    ]
    const controller = new AbortController(); controller.abort(); testCases.push([scene, { format: 'png', signal: controller.signal }])
    for (const [source, options] of testCases) { try { await io.exportCanvasFile(source, options); errors.push('NOT_REJECTED') } catch(e) { errors.push(e.code) } }
    window.demo.handle.select(['rect-a'])
    const selected = await window.demo.handle.exportFile({ format: 'svg', scope: 'selection' })
    window.demo.handle.updateSelection({ x: 999 })
    try { await window.demo.handle.exportFile({ format: 'png' }) } catch(e) { errors.push(e.code) }
    return { errors, transparent: await firstPixel(transparent.blob), colored: await firstPixel(colored.blob), dimensions: [transparent.width, transparent.height, colored.width, colored.height], selected: await selected.blob.text() }
  })
  expect(result.errors).toEqual(['EMPTY_CANVAS', 'EMPTY_SELECTION', 'SELECTION_NOT_FOUND', 'EXPORT_SCALE_EXCEEDED', 'EXPORT_DIMENSIONS_EXCEEDED', 'EDITABLE_SVG_UNSUPPORTED', 'CANCELLED', 'PENDING_LOCAL_EDITS'])
  expect(result.transparent[3]).toBe(0); expect(result.colored).toEqual([0, 255, 0, 255])
  expect(result.dimensions[2]).toBe(result.dimensions[0] * 2)
  expect(result.selected).not.toContain('hello canvas'); expect(result.selected).not.toContain('#50aa88')
})
