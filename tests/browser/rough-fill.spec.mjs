import { test, expect } from './fixtures.mjs'

async function open(page) {
  await page.addInitScript(() => {
    window.renderTextures = []
    const original = HTMLCanvasElement.prototype.toDataURL
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      const result = original.apply(this, args)
      window.renderTextures.push(result)
      return result
    }
  })
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
}
const projection = page => page.evaluate(() => window.demo.model.getValue())
const assertSafe = async page => {
  const result = await page.evaluate(() => ({
    value: JSON.stringify(window.demo.handle.getValue()),
    model: JSON.stringify(window.demo.model.getValue()),
    updates: window.demo.allUpdates.map(u => new TextDecoder().decode(u.update)),
    checkpoint: new TextDecoder().decode(window.demo.model.checkpoint().update), errors: window.demo.errors,
  }))
  expect(result.errors).toEqual([])
  for (const text of [result.value, result.model, result.checkpoint, ...result.updates]) expect(text).not.toMatch(/data:image|blob:|[?&](?:signature|token)=/i)
}

test('native rectangle -> rough fills/color, styles, rotate/scale/copy/undo, two pages and checkpoint are safe', async ({ page, context }, testInfo) => {
  await open(page)
  const second = await context.newPage(); await second.goto(await page.evaluate(() => window.demo.link)); await second.waitForFunction(() => window.demo?.handle)
  await page.getByRole('button', { name: /^矩形/ }).click()
  const host = await page.locator('.canvas-host').boundingBox()
  await page.mouse.move(host.x + 360, host.y + 400); await page.mouse.down()
  await page.mouse.move(host.x + 500, host.y + 500, { steps: 10 }); await page.mouse.up()
  await expect.poll(() => page.evaluate(() => window.demo.model.getValue().scene.children.length)).toBe(4)
  const id = await page.evaluate(() => window.demo.model.getValue().scene.children.find(x => !['rect-a', 'rect-b', 'text-a'].includes(x.id)).id)
  await page.evaluate(id => window.demo.handle.select([id]), id)
  await page.getByRole('button', { name: '手绘', exact: true }).click()
  for (const [label, style] of [['斜线填充', 'hachure'], ['交叉填充', 'cross-hatch'], ['锯齿填充', 'zigzag'], ['点状填充', 'dots'], ['全部填充', 'solid'], ['斜线填充', 'hachure']]) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await page.getByRole('button', { name: '#ffc9c9', exact: true }).click()
    await page.evaluate(() => window.demo.handle.flush())
    await expect.poll(async () => JSON.stringify(await projection(page)) === JSON.stringify(await projection(second))).toBe(true)
    const node = (await projection(page)).scene.children.find(x => x.id === id)
    expect(node.data.roughFillStyle).toBe(style); expect(node.fill).toBe('#ffc9c9'); expect(node.data.roughSeed).toBeGreaterThan(0)
    await assertSafe(page)
    await page.screenshot({ path: testInfo.outputPath(`${style}.png`) })
    const saved = await projection(page), updates = await page.evaluate(() => window.demo.allUpdates.length)
    await page.evaluate(() => { window.lastTexture = window.renderTextures.at(-1); window.texturesBefore = window.renderTextures.length; const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
    if (style !== 'solid') await expect.poll(() => page.evaluate(() => window.renderTextures.slice(window.texturesBefore).includes(window.lastTexture)), { message: `deterministic ${style}` }).toBe(true)
    await page.waitForTimeout(180)
    expect(await projection(page)).toEqual(saved)
    expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(updates)
    await page.evaluate(id => window.demo.handle.select([id]), id)
  }
  await page.getByRole('button', { name: '标准', exact: true }).click()
  await page.evaluate(() => window.demo.handle.flush())
  expect((await projection(page)).scene.children.find(x => x.id === id).fill).toBe('#ffc9c9')
  await page.getByRole('button', { name: '手绘', exact: true }).click()
  await page.evaluate(() => window.demo.handle.flush())
  await page.evaluate(() => { window.demo.handle.updateSelection({ rotation: 32, scaleX: 1.4, scaleY: 0.8, fill: '#a5d8ff' }); window.demo.handle.flush() })
  await second.evaluate(id => window.demo.model.patch(id, { stroke: '#1971c2' }), id)
  await expect.poll(() => page.evaluate(id => window.demo.model.getValue().scene.children.find(x => x.id === id).stroke, id)).toBe('#1971c2')
  await page.getByRole('button', { name: '复制', exact: true }).click()
  await page.evaluate(() => window.demo.handle.flush())
  await expect.poll(() => second.evaluate(() => window.demo.model.getValue().scene.children.length)).toBe(5)
  expect((await projection(second)).scene.children.find(x => x.id === id).fill).toBe('#a5d8ff')
  await page.evaluate(() => window.demo.handle.undo())
  await expect.poll(() => second.evaluate(() => window.demo.model.getValue().scene.children.length)).toBe(4)
  await page.evaluate(() => window.demo.handle.redo())
  await expect.poll(() => second.evaluate(() => window.demo.model.getValue().scene.children.length)).toBe(5)
  await assertSafe(page)
  const count = await page.evaluate(() => window.demo.allUpdates.length)
  await page.getByRole('button', { name: '放大', exact: true }).click()
  await page.mouse.wheel(0, 80); await page.waitForTimeout(400)
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(count)
  const saved = await projection(page)
  await page.evaluate(() => { window.texturesBefore = window.renderTextures.length; const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await expect.poll(() => page.evaluate(() => window.renderTextures.length > window.texturesBefore)).toBe(true)
  expect(await projection(page)).toEqual(saved)
  expect(saved.scene.children.find(x => x.id === id).stroke).toBe('#1971c2')
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(count)
  await assertSafe(page); await second.close()
})

test('removed layers options are inert; readonly selection/comment actions and top actions retain dynamic permissions', async ({ page }) => {
  await open(page)
  await page.evaluate(() => { window.savedHandle = window.demo.handle; window.demo.setLayersPosition('left'); window.demo.setMode('readonly'); window.demo.setShowToolbar(false) })
  await expect(page.locator('.layers-panel')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '打开评论', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '打开评论', exact: true }).click()
  expect(await page.evaluate(() => window.demo.topActionClicks)).toBe(1)
  const b = await page.evaluate(() => window.demo.handle.revealElements(['rect-a']).bounds)
  await page.locator('.canvas-host').click({ position: { x: b.x + b.width / 2, y: b.y + b.height / 2 } })
  await expect(page.getByRole('button', { name: '评论选中元素', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '评论选中元素', exact: true }).click()
  expect(await page.evaluate(() => window.demo.actionSelection.map(x => x.id))).toEqual(['rect-a'])
  await expect(page.getByRole('button', { name: '删除', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '复制', exact: true })).toHaveCount(0)
  await expect(page.locator('.property-wrap')).toHaveCount(0)
  await page.evaluate(() => window.demo.setCanComment(false))
  await expect(page.getByRole('button', { name: '评论选中元素', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '评论选中元素', exact: true })).toHaveAttribute('title', '没有评论权限')
  await expect(page.getByRole('button', { name: '打开评论', exact: true })).toBeDisabled()
  await page.keyboard.press('Delete')
  await page.evaluate(() => { window.demo.handle.updateSelection({ x: 999 }); window.demo.handle.removeSelection(); window.demo.setLayersPosition('right') })
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(0)
  expect(await page.evaluate(() => window.demo.handle === window.savedHandle && window.demo.readyCount === 1)).toBe(true)
})

test('host simulated server rejection preserves original outbox bytes/id and error through close/reopen', async ({ page }) => {
  await open(page)
  await page.evaluate(() => { window.demo.transportControls.reject = true; window.demo.handle.select(['rect-a']) })
  await page.getByRole('button', { name: '手绘', exact: true }).click()
  await page.getByRole('button', { name: '斜线填充', exact: true }).click()
  await page.getByRole('button', { name: '#ffc9c9', exact: true }).click()
  await page.evaluate(() => window.demo.handle.flush())
  await expect(page.locator('.save-status')).toHaveText('保存失败')
  const queue = await page.evaluate(() => window.demo.outbox.map(u => ({ id: u.id, bytes: [...u.update] })))
  expect(queue.length).toBeGreaterThan(0)
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await page.waitForTimeout(350)
  expect(await page.evaluate(() => window.demo.outbox.map(u => ({ id: u.id, bytes: [...u.update] })))).toEqual(queue)
  await expect(page.locator('.save-status')).toHaveText('保存失败')
  await assertSafe(page)
})
