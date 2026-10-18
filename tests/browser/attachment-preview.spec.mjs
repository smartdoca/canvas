import { test, expect } from './fixtures.mjs'
test.setTimeout(30000)

const scene = page => page.evaluate(() => window.demo.model.getValue())
const previews = page => page.evaluate(() => window.demo.resourceLog.filter(entry => entry.type === 'preview'))
const previewIcon = 'M15 3h6v6m0-6-7 7M9 21H3v-6m0 6 7-7'
async function open(page) {
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.model.remove(window.demo.model.getValue().scene.children.map(item => item.id)))
}
async function insert(page) {
  await page.evaluate(async () => { await window.demo.handle.insertAttachmentFile(new File(['attachment preview test'], '验收附件.txt', { type: 'text/plain' }), { x: 340, y: 260 }); window.demo.handle.flush() })
  await expect(page.locator('.selection-actions')).toBeVisible()
  await expect(page.locator('.native-attachment-actions, .attachment-actions')).toHaveCount(0)
}

test('file toolbar preview preserves selection and data, and readonly toolbar downloads require host authorization', async ({ page, context }, info) => {
  await open(page); await insert(page)
  const toolbar = page.locator('.selection-actions')
  await expect(toolbar.getByRole('button', { name: '预览附件', exact: true }).locator('svg path')).toHaveAttribute('d', previewIcon)
  await expect(toolbar.getByRole('button', { name: '下载', exact: true })).toBeVisible()
  const before = await scene(page), updates = await page.evaluate(() => window.demo.allUpdates.length)
  const selected = await page.evaluate(() => window.demo.handle.getSelection().map(item => item.id))
  const peer = await context.newPage(); await peer.goto(await page.evaluate(() => window.demo.link)); await peer.waitForFunction(() => window.demo?.handle)
  await expect.poll(() => scene(peer)).toEqual(before)
  await toolbar.getByRole('button', { name: '预览附件', exact: true }).click()
  let calls = await previews(page)
  expect(calls).toHaveLength(1); expect(calls.every(call => call.source === 'attachment')).toBe(true)
  expect(calls[0].resource).toMatchObject({ kind: 'attachment', path: expect.stringMatching(/^asset-/), name: '验收附件.txt', mimeType: 'text/plain', size: 23 })
  expect(await page.evaluate(() => window.demo.handle.getSelection().map(item => item.id))).toEqual(selected)
  expect(await page.evaluate(() => window.demo.resourceLog.filter(entry => ['display', 'download'].includes(entry.type)))).toEqual([])
  await page.evaluate(() => window.demo.setMode('readonly'))
  await toolbar.getByRole('button', { name: '预览附件', exact: true }).click()
  calls = await previews(page); expect(calls).toHaveLength(2)
  await expect(toolbar.getByRole('button', { name: '删除', exact: true })).toHaveCount(0)
  await page.evaluate(() => { window.demo.resourceControls.denyDownload = true })
  await toolbar.getByRole('button', { name: '下载', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.demo.errors.at(-1))).toContain('DOWNLOAD_DENIED')
  await page.evaluate(() => { window.demo.resourceControls.denyDownload = false })
  const downloaded = page.waitForEvent('download'); await toolbar.getByRole('button', { name: '下载', exact: true }).click()
  expect((await downloaded).suggestedFilename()).toBe('验收附件.txt')
  expect(await scene(page)).toEqual(before); expect(await scene(peer)).toEqual(before)
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
  await page.screenshot({ path: info.outputPath('attachment-readonly-actions.png') })
})

test('preview reads the latest attachment prop, falls back to the generic prop, and routes sync and async errors to onError', async ({ page, context }) => {
  await context.route('**/main.jsx*', async route => {
    const response = await route.fetch()
    let source = await response.text()
    if (!process.env.AIDCANVAS_TEST_URL) source = source.replaceAll('/dist/index.js', '/src/index.ts').replaceAll('/dist/model.js', '/src/model/index.ts').replaceAll('/dist/io.js', '/src/io/index.ts').replaceAll('/dist/index.css', '/src/index.css')
    source = source.replace('const editor = useRef(null);', 'const editor = useRef(null); const [previewMode, setPreviewMode] = useState("first"); window.previewTest = { setPreviewMode };')
    source = source.replace(/onAttachmentPreview: \(resource\) => \{[\s\S]*?\n\s*\},(?=\n\s*onResourcePreview:)/, `onAttachmentPreview: previewMode === 'fallback' ? undefined : resource => {
      if (previewMode === 'sync') throw new Error('PREVIEW_SYNC');
      if (previewMode === 'async') return Promise.reject(new Error('PREVIEW_ASYNC'));
      resourceLog.push({ type: 'preview', source: previewMode, resource });
    },`)
    expect(source).toContain("source: previewMode")
    await route.fulfill({ response, body: source })
  })
  await open(page); await insert(page)
  const button = page.locator('.selection-actions').getByRole('button', { name: '预览附件', exact: true })
  const before = await scene(page), ready = await page.evaluate(() => window.demo.readyCount)
  for (const mode of ['first', 'second', 'fallback']) {
    await page.evaluate(mode => window.previewTest.setPreviewMode(mode), mode)
    await button.click()
    expect((await previews(page)).at(-1).source).toBe(mode === 'fallback' ? 'resource' : mode)
  }
  for (const mode of ['sync', 'async']) {
    await page.evaluate(mode => window.previewTest.setPreviewMode(mode), mode); await button.click()
    await expect.poll(() => page.evaluate(() => window.demo.errors.at(-1))).toBe(`Error: PREVIEW_${mode.toUpperCase()}`)
  }
  expect(await previews(page)).toHaveLength(3); expect(await scene(page)).toEqual(before)
  expect(await page.evaluate(() => window.demo.readyCount)).toBe(ready)
})

test('rich attachment preview uses the attachment prop and preserves the rich document', async ({ page }) => {
  await open(page)
  const resource = { id: 'rich-file', kind: 'attachment', path: 'stable-file', name: '正文附件.txt', size: 1024, mimeType: 'text/plain' }
  await page.evaluate(resource => {
    window.demo.handle.addElement({ id: 'card', tag: 'Frame', name: 'card', x: 340, y: 220, width: 320, height: 200, editable: true, hitChildren: false, fill: '#fff', data: { kind: 'card' }, children: [{ id: 'label', tag: 'Text', name: 'text', x: 16, y: 16, width: 288, height: 168, fontSize: 16, fill: '#1f2329', editable: true, text: '\uFFFC\n继续编辑', data: { richText: { version: 1, value: [{ type: 'paragraph', resource, children: [{ text: '' }] }, { type: 'paragraph', children: [{ text: '继续编辑' }] }] } } }] })
    window.demo.handle.flush()
  }, resource)
  const bounds = await page.evaluate(() => window.demo.handle.revealElements(['label']).bounds)
  await page.locator('.canvas-host').dblclick({ position: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } })
  const input = page.locator('[data-slate-editor]'); await expect(input).toBeVisible()
  await page.keyboard.press('ArrowRight'); await expect(page.locator('.slate-format-toolbar')).toBeHidden()
  await input.locator('.rich-file-chip').click()
  const before = await scene(page), updates = await page.evaluate(() => window.demo.allUpdates.length)
  await input.getByRole('button', { name: '预览附件', exact: true }).click()
  expect((await previews(page)).at(-1)).toEqual({ type: 'preview', source: 'attachment', resource })
  expect(await scene(page)).toEqual(before); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
  await expect(page.locator('.attachment-actions, .native-attachment-actions')).toHaveCount(0)
})

test('narrow file toolbar keeps its size and follows the file beyond both viewport edges', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page); await insert(page)
  await page.evaluate(() => {
    const id = window.demo.model.getValue().scene.children[0].id
    window.demo.handle.revealElements([id], { padding: 100, maxZoom: .35 })
    window.demo.handle.select([]); window.demo.handle.select([id])
  })
  const placement = () => page.evaluate(() => {
    const host = document.querySelector('.canvas-host').getBoundingClientRect(), bar = document.querySelector('.selection-actions').getBoundingClientRect()
    const origin = window.demo.handle.clientToScene({ x: host.x, y: host.y }), next = window.demo.handle.clientToScene({ x: host.x + 1, y: host.y + 1 }), scale = 1 / (next.x - origin.x)
    const file = window.demo.model.getValue().scene.children[0]
    return { x: bar.x + bar.width / 2 - host.x - (file.x + file.width / 2 - origin.x) * scale, y: bar.bottom - host.y - (file.y - origin.y) * scale, width: bar.width, height: bar.height, left: bar.x, right: bar.right }
  })
  await expect.poll(async () => Math.abs((await placement()).y + 20)).toBeLessThan(1)
  const anchor = await placement(), before = await scene(page)
  await page.mouse.move(350, 650)
  for (const [dx, edge] of [[600, 'left'], [-600], [-600, 'right'], [600]]) {
    for (let step = 0; step < 4; step++) {
      const origin = await page.evaluate(() => window.demo.handle.clientToScene({ x: 200, y: 200 }))
      await page.mouse.wheel(dx, 0)
      await expect.poll(() => page.evaluate(() => window.demo.handle.clientToScene({ x: 200, y: 200 }))).not.toEqual(origin)
      await expect.poll(async () => { const actual = await placement(); return Math.max(...['x', 'y', 'width', 'height'].map(key => Math.abs(actual[key] - anchor[key]))) }).toBeLessThan(1)
    }
    if (edge === 'left') expect((await placement()).right).toBeLessThan(0)
    if (edge === 'right') expect((await placement()).left).toBeGreaterThan(390)
  }
  expect(await scene(page)).toEqual(before)
})
