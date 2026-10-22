import { test, expect } from './fixtures.mjs'

const scene = page => page.evaluate(() => window.demo.model.getValue().scene)
const live = page => page.evaluate(() => window.demo.handle.getValue().scene)

async function openLegacyCheckpoint(page, kind) {
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
  const seed = await page.evaluate(kind => {
    const scene = { tag: 'Leafer', children: [{ id: 'old-video-books', tag: 'Frame', name: 'frame', x: 320, y: 220, width: 360, height: 180, fill: '#cc4944', stroke: '#cc4944', strokeWidth: 1, editable: true, ...(kind ? { data: { kind } } : {}), children: [
      { id: 'old-body', tag: 'Rect', name: 'diagram-body', x: 0, y: 0, width: 360, height: 180, cornerRadius: 12, fill: '#ffe5e3', stroke: '#cc4944', strokeWidth: 1 },
      { id: 'old-label', tag: 'Text', name: 'text', x: 14, y: 12, width: 332, height: 156, text: 'video_books\nid: UUID\nname: TEXT', fontSize: 18, fill: '#222222', editable: true },
      { id: 'old-default-title', tag: 'Text', name: 'frame-title', text: 'Frame', x: 10, y: 8, fontSize: 13, fill: '#6257e8' },
    ] }] }
    const model = window.demo.model.constructor.initialize(crypto.randomUUID(), { version: 1, scene }), checkpoint = model.checkpoint()
    const url = new URL('/examples/doca/', location.origin)
    url.searchParams.set('epoch', checkpoint.epochId)
    url.searchParams.set('checkpoint', btoa(String.fromCharCode(...checkpoint.update)))
    const original = model.getValue().scene
    model.dispose()
    return { url: url.href, original }
  }, kind)
  await page.goto(seed.url)
  await page.waitForFunction(() => window.demo?.handle)
  return seed.original
}

for (const sourceKind of ['', 'diagram-node']) test(`legacy diagram checkpoint shares native and detached export projection (kind=${sourceKind || 'name-only'})`, async ({ page }, info) => {
  const modules = []
  page.on('request', request => modules.push(new URL(request.url()).pathname))
  await page.setViewportSize({ width: 1440, height: 1000 })
  const original = await openLegacyCheckpoint(page, sourceKind)
  expect(await scene(page)).toEqual(original)
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(0)
  for (const stage of ['initial', 'field-edit', 'resize']) {
    if (stage === 'field-edit') await page.evaluate(() => window.demo.model.patch('old-label', { text: 'video_books\nid: UUID\nname: TEXT\nprogress: INT' }))
    if (stage === 'resize') await page.evaluate(() => { window.demo.handle.select(['old-video-books']); window.demo.handle.updateSelection({ width: 460, height: 240 }); window.demo.handle.flush(); window.demo.handle.select([]) })
    const expectedWidth = stage === 'resize' ? 460 : 360, expectedHeight = stage === 'resize' ? 240 : 180
    const rendered = (await live(page)).children[0]
    expect(rendered).toMatchObject({ name: 'diagram-node', fill: 'transparent', stroke: 'transparent', width: expectedWidth, height: expectedHeight })
    expect(rendered.children.map(node => node.name)).toEqual(['diagram-body', 'text'])
    expect(rendered.children[0]).toMatchObject({ width: expectedWidth, height: expectedHeight, fill: '#ffe5e3' })
    const beforeExport = await scene(page), updates = await page.evaluate(() => window.demo.allUpdates.length)
    // The original model remains authoritative and retains its historical fields/IDs.
    expect(beforeExport.children[0]).toMatchObject({ name: 'frame', fill: '#cc4944' })
    expect(beforeExport.children[0].children.map(node => node.id)).toEqual(['old-body', 'old-label', 'old-default-title'])
    for (const entry of ['editor', 'io']) {
      const exported = await page.evaluate(async entry => {
        const result = entry === 'editor'
          ? await window.demo.handle.exportFile({ format: 'svg', background: 'transparent', scale: 1 })
          : await window.demo.io.exportCanvasFile({ scene: window.demo.model.getValue().scene }, { format: 'svg', background: 'transparent', scale: 1 })
        const svg = await result.blob.text(), xml = new DOMParser().parseFromString(svg, 'image/svg+xml')
        const drawing = document.importNode(xml.documentElement, true)
        drawing.style.cssText = 'position:fixed;left:-10000px;top:-10000px'
        document.body.append(drawing)
        try {
          const paths = [...drawing.querySelectorAll('path')], body = paths[1].getBBox()
          return { svg, texts: [...drawing.querySelectorAll('text')].map(node => node.textContent), wrapperFill: paths[0].getAttribute('fill'), bodyFill: paths[1].getAttribute('fill'), body: { width: body.width, height: body.height } }
        } finally { drawing.remove() }
      }, entry)
      expect(exported.texts).not.toContain('Frame')
      expect(exported.texts.join('')).toContain('video_books')
      if (stage !== 'initial') expect(exported.texts.join('')).toContain('progress: INT')
      expect(exported.wrapperFill).toBe('transparent')
      expect(exported.bodyFill).toBe('#ffe5e3')
      expect(exported.body).toEqual({ width: expectedWidth, height: expectedHeight })
      await info.attach(`${stage}-${entry}.svg`, { body: exported.svg, contentType: 'image/svg+xml' })
      expect(await scene(page)).toEqual(beforeExport)
      expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
    }
  }
  await page.screenshot({ path: info.outputPath('legacy-checkpoint-after-fields-and-resize.png') })
  if (process.env.CANVAS_PACKAGE_CONSUMER) {
    expect(modules.some(path => path.startsWith('/assets/') && path.endsWith('.js'))).toBe(true)
    expect(modules.some(path => path.startsWith('/src/') || path.startsWith('/__qa/'))).toBe(false)
  }
})

test('detached diagram projection keeps authored Frame titles and explicit containers', async ({ page }) => {
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
  const results = await page.evaluate(async () => {
    const base = { tag: 'Frame', name: 'frame', x: 100, y: 100, width: 300, height: 180, fill: '#cc4944', children: [
      { id: 'control-body', tag: 'Rect', name: 'diagram-body', width: 300, height: 180, fill: '#ffe5e3' },
      { id: 'control-title', tag: 'Text', name: 'frame-title', text: 'Frame', x: 10, y: 8, fontSize: 13, fill: '#6257e8', data: { containerPart: 'title' } },
    ] }
    const fixtures = [
      { ...base, id: 'authored-title-diagram' },
      { ...base, id: 'explicit-board', data: { kind: 'container', containerType: 'board' } },
    ]
    const results = []
    for (const node of fixtures) {
      const source = { tag: 'Leafer', children: [node] }, before = JSON.stringify(source)
      const result = await window.demo.io.exportCanvasFile({ scene: source }, { format: 'svg', background: 'transparent', scale: 1 })
      const xml = new DOMParser().parseFromString(await result.blob.text(), 'image/svg+xml')
      results.push({ texts: [...xml.querySelectorAll('text')].map(item => item.textContent), fill: xml.querySelector('path').getAttribute('fill'), unchanged: JSON.stringify(source) === before })
    }
    return results
  })
  expect(results).toEqual([
    { texts: ['Frame'], fill: 'transparent', unchanged: true },
    { texts: ['Frame'], fill: '#cc4944', unchanged: true },
  ])
})
