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
async function openStyles(page) { if (!(await page.locator('.property-wrap').isVisible())) await page.getByRole('button', { name: '更多样式', exact: true }).click() }
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

test('modern connectable shapes keep native styling, copy, undo and peer checkpoints without the retired rough controls', async ({ page, context }, info) => {
  await open(page)
  const second = await context.newPage(); await second.goto(await page.evaluate(() => window.demo.link)); await second.waitForFunction(() => window.demo?.handle)
  const id = await page.evaluate(async () => { const { makeDiagram } = await import('/src/editor/runtime/thinking/scene.ts'); const item = makeDiagram('rounded', 500, 400, '现代图形'); const id = window.demo.handle.addElement(item.toJSON()).id; item.destroy(); return id })
  await openStyles(page); await expect(page.getByRole('button', { name: '手绘', exact: true })).toHaveCount(0)
  await page.evaluate(() => { window.demo.handle.updateSelection({ rotation: 30, opacity: .8 }); window.demo.handle.flush() })
  await page.getByRole('button', { name: '复制', exact: true }).click(); await page.evaluate(() => window.demo.handle.flush())
  const count = (await projection(page)).scene.children.length
  await expect.poll(async () => (await projection(second)).scene.children.length).toBe(count)
  await page.evaluate(() => window.demo.handle.undo()); await expect.poll(async () => (await projection(second)).scene.children.length).toBe(count - 1)
  await page.evaluate(() => window.demo.handle.redo()); await expect.poll(async () => (await projection(second)).scene.children.length).toBe(count)
  const saved = await projection(page)
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) }); await page.waitForFunction(() => window.demo?.handle)
  expect(await projection(page)).toEqual(saved); expect(saved.scene.children.find(n => n.id === id).rotation).toBe(30)
  await assertSafe(page); await page.screenshot({ path: info.outputPath('modern-shape-native.png') }); await second.close()
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
  await page.evaluate(() => window.demo.handle.updateSelection({ fill: '#ffc9c9' }))
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
