import { test, expect } from './fixtures.mjs'

test('mind map idle, selection, view panels, pan/zoom and mode changes produce zero content writes for 60 seconds', async ({ page, context }) => {
  test.setTimeout(90000)
  await context.route('**/examples/doca/main.jsx', async route => {
    const response = await route.fetch()
    await route.fulfill({ response, body: (await response.text()).replaceAll('/dist/index.js', '/src/index.ts').replaceAll('/dist/model.js', '/src/model/index.ts').replaceAll('/dist/io.js', '/src/io/index.ts').replaceAll('/dist/index.css', '/src/index.css') })
  })
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(async () => {
    const { makeMindMap } = await import('/src/editor/runtime/thinking/scene.ts')
    const graph = makeMindMap(400, 350, '静默验证', '分支')
    window.demo.handle.addElement(graph.toJSON()); graph.destroy(); window.demo.handle.flush()
    window.idleRoot = window.demo.model.getValue().scene.children.find(item => item.data?.kind === 'mindmap').children.find(item => item.data?.root).id
    window.idleBaseline = JSON.stringify(window.demo.model.getValue())
    window.idleUpdates = window.demo.allUpdates.length
    window.idleHandle = window.demo.handle
    window.idleReady = window.demo.readyCount
  })
  const peer = await context.newPage(); await peer.goto(await page.evaluate(() => window.demo.link)); await peer.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.handle.select([window.idleRoot]))
  await page.getByRole('button', { name: '更多样式', exact: true }).click()
  await page.getByRole('button', { name: '思维导图大纲', exact: true }).click()
  await page.getByRole('button', { name: '思维导图大纲', exact: true }).click()
  await page.setViewportSize({ width: 800, height: 640 }); await page.setViewportSize({ width: 1280, height: 800 })
  await page.getByRole('button', { name: '放大', exact: true }).click()
  await page.locator('.canvas-host').click({ position: { x: 900, y: 600 } }); await page.mouse.wheel(0, 60)
  await page.evaluate(() => window.demo.setMode('readonly'))
  await expect(page.locator('.canvas-toolbar')).toHaveCount(0)
  await page.evaluate(() => window.demo.setMode('edit'))
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(10000)
    expect(await page.evaluate(() => JSON.stringify(window.demo.model.getValue()))).toBe(await page.evaluate(() => window.idleBaseline))
    expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(await page.evaluate(() => window.idleUpdates))
    expect(await peer.evaluate(() => window.demo.allUpdates.length)).toBe(0)
  }
  expect(await page.evaluate(() => window.demo.handle === window.idleHandle && window.demo.readyCount === window.idleReady)).toBe(true)
  await peer.close()
})
