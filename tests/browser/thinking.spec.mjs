import { test, expect } from './fixtures.mjs'

async function sourceHost(page) {
  await page.context().route('**/examples/doca/main.jsx', async route => {
    const response = await route.fetch()
    const source = (await response.text()).replaceAll('/dist/index.js', '/src/index.ts').replaceAll('/dist/model.js', '/src/model/index.ts').replaceAll('/dist/io.js', '/src/io/index.ts').replaceAll('/dist/index.css', '/src/index.css')
    await route.fulfill({ response, body: source })
  })
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
}
const value = page => page.evaluate(() => window.demo.model.getValue())
const maps = async page => (await value(page)).scene.children.filter(node => node.data?.kind === 'mindmap')
const nodes = group => group.children.filter(node => node.data?.kind === 'mind-node')
async function select(page, id) { await page.evaluate(id => window.demo.handle.select([id]), id); await page.locator('.canvas-app').focus() }
async function insertMap(page) {
  await page.getByRole('button', { name: '思维导图', exact: true }).click()
  const host = await page.locator('.canvas-host').boundingBox()
  await page.mouse.click(host.x + 700, host.y + 430)
  await expect.poll(async () => (await maps(page)).length).toBe(1)
  return (await maps(page))[0]
}

test('Feishu board chrome: white full canvas, left tools, template entry and responsive controls', async ({ page }, info) => {
  await page.goto('/')
  await page.locator('.canvas-view canvas').first().waitFor()
  for (const viewport of [{ width: 1440, height: 900 }, { width: 800, height: 640 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    const host = await page.locator('.canvas-host').boundingBox(), toolbar = await page.locator('.canvas-toolbar').boundingBox()
    expect(host).toMatchObject({ x: 0, y: 0, ...viewport })
    expect(toolbar.x).toBeLessThan(30); expect(toolbar.width).toBeCloseTo(52, 2)
    expect(toolbar.y + toolbar.height).toBeLessThan(viewport.height - 40)
    await expect(page.locator('.property-wrap')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '模板库', exact: true })).toBeVisible()
    const nav = await page.locator('.board-bottom-controls').boundingBox()
    expect(nav.x).toBeGreaterThan(80); expect(nav.x + nav.width).toBeLessThanOrEqual(viewport.width)
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: info.outputPath('feishu-empty.png') })
})

test('native mind map: child/sibling/parent keyboard editing, layout, collapse and own undo', async ({ page }, info) => {
  await sourceHost(page)
  const before = await page.evaluate(() => window.demo.allUpdates.length)
  const graph = await insertMap(page)
  expect(nodes(graph)).toHaveLength(4)
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(before + 1)
  const root = nodes(graph).find(node => node.data.root)
  await select(page, root.id)
  await page.keyboard.press('Tab')
  const input = page.locator('.leafer-text-editor')
  await expect(input).toBeVisible()
  await input.fill('产品方向')
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.demo.handle.flush())
  let latest = (await maps(page))[0]
  const child = nodes(latest).find(node => node.children[0].text === '产品方向')
  expect(child.data.parentId).toBe(root.id)
  await select(page, child.id)
  await page.keyboard.press('Enter')
  await expect(input).toBeVisible(); await input.fill('关键行动'); await page.keyboard.press('Escape')
  await page.evaluate(() => window.demo.handle.flush())
  latest = (await maps(page))[0]
  const sibling = nodes(latest).find(node => node.children[0].text === '关键行动')
  expect(sibling.data.parentId).toBe(root.id)
  await select(page, sibling.id)
  await page.keyboard.press('Shift+Tab')
  await expect(input).toBeVisible(); await input.fill('战略规划'); await page.keyboard.press('Escape')
  await page.evaluate(() => window.demo.handle.flush())
  latest = (await maps(page))[0]
  const parent = nodes(latest).find(node => node.children[0].text === '战略规划')
  expect(nodes(latest).find(node => node.id === sibling.id).data.parentId).toBe(parent.id)
  await select(page, root.id)
  await page.getByRole('button', { name: '布局', exact: true }).click()
  await page.getByRole('menuitemradio', { name: '组织架构图', exact: true }).click()
  expect((await maps(page))[0].data.layout).toBe('down')
  await page.getByRole('button', { name: '主题', exact: true }).click()
  await page.getByRole('menuitemradio', { name: '清新', exact: true }).click()
  expect((await maps(page))[0].data.theme).toBe('green')
  expect(nodes((await maps(page))[0]).find(node => node.data.root).fill).toBe('#25845b')
  await select(page, root.id)
  await page.keyboard.press('Meta+.')
  latest = (await maps(page))[0]
  expect(nodes(latest).filter(node => node.visible !== false)).toHaveLength(1)
  await page.evaluate(() => window.demo.handle.undo())
  expect(nodes((await maps(page))[0]).filter(node => node.visible !== false).length).toBeGreaterThan(1)
  await page.screenshot({ path: info.outputPath('mind-map-native.png') })
})

test('mind map copy preserves identities and relations, two replicas converge with no echo and readonly is inert', async ({ page, context }) => {
  await sourceHost(page)
  const graph = await insertMap(page), root = nodes(graph).find(node => node.data.root)
  const peer = await context.newPage(); await peer.goto(await page.evaluate(() => window.demo.link)); await peer.waitForFunction(() => window.demo?.handle)
  await select(page, root.id); await page.keyboard.press('Meta+d')
  await page.evaluate(() => window.demo.handle.flush())
  await expect.poll(async () => (await maps(peer)).length).toBe(2)
  const [original, copy] = await maps(peer), copiedIds = new Set(copy.children.map(node => node.id))
  expect(copy.id).not.toBe(original.id)
  expect(copy.children.some(node => original.children.some(old => old.id === node.id))).toBe(false)
  for (const node of nodes(copy)) if (node.data.parentId) expect(copiedIds.has(node.data.parentId)).toBe(true)
  for (const edge of copy.children.filter(node => node.data?.kind === 'mind-edge')) { expect(copiedIds.has(edge.data.sourceId)).toBe(true); expect(copiedIds.has(edge.data.targetId)).toBe(true) }
  expect(await peer.evaluate(() => window.demo.allUpdates.length)).toBe(0)
  await expect.poll(async () => JSON.stringify(await value(page)) === JSON.stringify(await value(peer))).toBe(true)
  const snapshot = await value(page)
  await page.evaluate(() => window.demo.setMode('readonly'))
  await select(page, root.id); await page.keyboard.press('Tab'); await page.keyboard.press('Enter')
  await expect(page.locator('.canvas-toolbar')).toHaveCount(0)
  await expect(page.locator('.node-quick-create')).toHaveCount(0)
  expect(await value(page)).toEqual(snapshot)
  await peer.close()
})

test('bound connectors follow shape moves and quick-create is one content transaction', async ({ page }) => {
  await sourceHost(page)
  await page.getByRole('button', { name: '图形 (M)', exact: true }).click()
  const host = await page.locator('.canvas-host').boundingBox()
  await page.mouse.click(host.x + 720, host.y + 410)
  await expect.poll(() => page.evaluate(() => window.demo.model.getValue().scene.children.filter(item => item.data?.kind === 'diagram-node').length)).toBe(1)
  const source = (await value(page)).scene.children.find(item => item.data?.kind === 'diagram-node')
  await select(page, source.id)
  const before = await page.evaluate(() => window.demo.allUpdates.length)
  await page.getByRole('button', { name: '快捷创建相连图形', exact: true }).click()
  let scene = (await value(page)).scene
  const connector = scene.children.find(item => item.data?.kind === 'connector')
  expect(connector.data.sourceId).toBe(source.id)
  expect(connector.data.targetId).toBeTruthy()
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(before + 1)
  const from = connector.data.from
  await select(page, source.id)
  await page.evaluate(() => { window.demo.handle.updateSelection({ x: 450, y: 300 }); window.demo.handle.flush() })
  scene = (await value(page)).scene
  const changed = scene.children.find(item => item.id === connector.id)
  expect(changed.data.from).not.toEqual(from)
  expect(changed.path).not.toBe(connector.path)
  await page.evaluate(() => window.demo.handle.undo())
  expect((await value(page)).scene.children.find(item => item.id === connector.id).path).toBe(connector.path)
})

test('dragging a connector between shapes binds both endpoints and stays editable', async ({ page }) => {
  await sourceHost(page)
  await page.evaluate(async () => {
    const { makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts')
    for (const x of [340, 700]) { const item = makeDiagram('rounded', x, 340); window.demo.handle.addElement(item.toJSON()); item.destroy() }
    window.demo.handle.flush()
  })
  await expect.poll(async () => (await value(page)).scene.children.filter(node => node.data?.kind === 'diagram-node').length).toBe(2)
  const shapes = (await value(page)).scene.children.filter(node => node.data?.kind === 'diagram-node')
  await page.getByRole('button', { name: '连线 (A)', exact: true }).click()
  const host = await page.locator('.canvas-host').boundingBox()
  await page.mouse.move(host.x + 420, host.y + 380); await page.mouse.down()
  await page.mouse.move(host.x + 780, host.y + 380, { steps: 16 }); await page.mouse.up()
  await page.evaluate(() => window.demo.handle.flush())
  const edge = (await value(page)).scene.children.find(node => node.data?.kind === 'connector')
  expect(edge.data.sourceId).toBe(shapes[0].id); expect(edge.data.targetId).toBe(shapes[1].id)
  expect(edge.path).toBeTruthy()
})

test('templates insert editable native objects and host find locates labels without built-in search UI', async ({ page }, info) => {
  await sourceHost(page)
  await page.evaluate(() => window.demo.model.remove(window.demo.model.getValue().scene.children.map(node => node.id)))
  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '模板库' })).toBeVisible()
  await page.getByRole('textbox', { name: '搜索模板', exact: true }).fill('思维导图')
  await page.getByRole('button', { name: '思维导图', exact: true }).last().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(async () => (await maps(page)).length).toBe(1)
  await page.screenshot({ path: info.outputPath('mind-template.png') })
  await expect(page.getByRole('button', { name: '搜索', exact: true })).toHaveCount(0)
  const matches = await page.evaluate(() => window.demo.handle.find('关键行动'))
  expect(matches).toHaveLength(1)
  expect(await page.evaluate(match => window.demo.handle.reveal(match), matches[0])).toBe(true)
  await page.getByRole('button', { name: '思维导图大纲', exact: true }).click()
  await expect(page.locator('.board-outline')).toContainText('关键行动')
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await expect(page.locator('.board-empty-hint')).toHaveCount(0)
})

test('table insertion, cell text, row/column growth and checkpoint restore retain native data', async ({ page }) => {
  await sourceHost(page)
  await page.getByRole('button', { name: '表格', exact: true }).click()
  const host = await page.locator('.canvas-host').boundingBox()
  await page.mouse.click(host.x + 700, host.y + 440)
  await expect.poll(() => page.evaluate(() => window.demo.model.getValue().scene.children.some(item => item.data?.kind === 'table'))).toBe(true)
  let table = (await value(page)).scene.children.find(item => item.data?.kind === 'table')
  expect(table.children).toHaveLength(9)
  await select(page, table.id)
  await page.locator('.table-insert-dot.is-row').last().click()
  await page.locator('.table-insert-dot.is-column').last().click()
  table = (await value(page)).scene.children.find(item => item.id === table.id)
  expect(table.data).toMatchObject({ rows: 4, columns: 4 })
  expect(table.children).toHaveLength(16)
  const cell = table.children[0]
  const box = await page.evaluate(id => window.demo.handle.revealElements([id]).bounds, cell.id)
  await page.locator('.canvas-host').dblclick({ position: { x: box.x + box.width / 2, y: box.y + box.height / 2 } })
  const input = page.locator('.leafer-text-editor')
  await expect(input).toBeVisible(); await input.fill('负责人'); await page.keyboard.press('Escape')
  await page.evaluate(() => window.demo.handle.flush())
  expect((await value(page)).scene.children.find(item => item.id === table.id).children[0].children[0].text).toBe('负责人')
  const before = await value(page)
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  expect(await value(page)).toEqual(before)
})

test('connector label is editable, follows endpoints, and survives an endpoint deletion with its connection', async ({ page }) => {
  await sourceHost(page)
  await page.getByRole('button', { name: '图形 (M)', exact: true }).click()
  const host = await page.locator('.canvas-host').boundingBox()
  await page.mouse.click(host.x + 720, host.y + 410)
  await expect.poll(() => page.evaluate(() => window.demo.model.getValue().scene.children.some(item => item.data?.kind === 'diagram-node'))).toBe(true)
  const source = (await value(page)).scene.children.find(item => item.data?.kind === 'diagram-node')
  await select(page, source.id)
  await page.getByRole('button', { name: '快捷创建相连图形', exact: true }).click()
  const connector = (await value(page)).scene.children.find(item => item.data?.kind === 'connector')
  await select(page, connector.id); await page.keyboard.press('Enter')
  const input = page.locator('.leafer-text-editor')
  await expect(input).toBeVisible(); await input.fill('提交审核'); await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  let scene = (await value(page)).scene
  const label = scene.children.find(item => item.data?.kind === 'connector-label')
  expect(label.children[0].text).toBe('提交审核')
  await select(page, source.id)
  await page.evaluate(() => { window.demo.handle.updateSelection({ x: 400, y: 300 }); window.demo.handle.flush() })
  scene = (await value(page)).scene
  expect(scene.children.find(item => item.id === label.id).x).not.toBe(label.x)
  await select(page, connector.data.targetId)
  await page.evaluate(() => { window.demo.handle.removeSelection(); window.demo.handle.flush() })
  scene = (await value(page)).scene
  expect(scene.children.some(item => item.id === connector.id)).toBe(true)
  expect(scene.children.some(item => item.id === label.id)).toBe(true)
  expect(scene.children.find(item => item.id === connector.id).data.targetId).toBeFalsy()
  await page.evaluate(() => window.demo.handle.undo())
  scene = (await value(page)).scene
  expect(scene.children.find(item => item.id === label.id).children[0].text).toBe('提交审核')
})

test('all eight templates produce schema-valid editable scenes and actual SVG exports', async ({ page }) => {
  await sourceHost(page)
  const result = await page.evaluate(async () => {
    const { createTemplate, templateIds } = await import('/src/editor/runtime/thinking/templates.ts')
    const { toPersistedCanvasScene } = await import('/src/model/index.ts')
    const { translate } = await import('/src/i18n/translate.ts')
    const output = []
    for (const id of templateIds) {
      const group = createTemplate(id, 700, 400, key => translate('zh', key))
      const before = window.demo.model.getValue().scene.children.length
      const added = window.demo.handle.addElement(toPersistedCanvasScene(group.toJSON()))
      group.destroy(); window.demo.handle.flush()
      window.demo.handle.select([added.id])
      const exported = await window.demo.handle.exportFile({ format: 'svg', scope: 'selection' })
      output.push({ id, added: window.demo.model.getValue().scene.children.length === before + 1, content: (await exported.blob.text()).includes('<svg'), size: exported.blob.size })
    }
    return output
  })
  expect(result).toHaveLength(8)
  for (const item of result) { expect(item.added, item.id).toBe(true); expect(item.content, item.id).toBe(true); expect(item.size, item.id).toBeGreaterThan(200) }
})
