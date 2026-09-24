import { test, expect } from './fixtures.mjs'

async function open(page) {
  await page.goto('/examples/doca/')
  await page.waitForFunction(() => window.demo?.handle)
}
const value = page => page.evaluate(() => window.demo.model.getValue())
async function openText(page) {
  const bounds = await page.evaluate(() => window.demo.handle.revealElements(['text-a']).bounds)
  await page.locator('.canvas-host').dblclick({ position: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } })
  const input = page.locator('.leafer-text-editor')
  await expect(input).toBeVisible(); await input.focus()
  return input
}

test('permanent comments: marker/card bidirectional activation, readonly, partial/all deletion and resolution', async ({ page, context }) => {
  await open(page)
  const second = await context.newPage(); await second.goto(await page.evaluate(() => window.demo.link)); await second.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => window.demo.setAnchors([
    { anchorId: 'c1', anchor: window.demo.model.captureAnchor(['rect-a', 'rect-b']) },
    { anchorId: 'c2', anchor: window.demo.model.captureAnchor(['text-a']) },
  ]))
  await expect(page.locator('[data-anchor-id="c1"] [data-anchor-element]')).toHaveCount(2)
  await page.getByRole('button', { name: '评论 c1', exact: true }).click()
  await expect(page.getByRole('button', { name: 'c1', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => window.demo.lastAnchorClick.elementIds)).toEqual(['rect-a', 'rect-b'])
  await page.getByRole('button', { name: 'c2', exact: true }).click()
  await expect(page.locator('[data-anchor-id="c2"]')).toHaveAttribute('data-active', 'true')
  expect(await page.evaluate(() => window.demo.handle.getSelection())).toEqual([])
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(0)
  await page.evaluate(() => window.demo.setMode('readonly'))
  await page.getByRole('button', { name: 'c1', exact: true }).click()
  await expect(page.getByRole('button', { name: '评论 c1', exact: true })).toBeVisible()
  await second.evaluate(() => window.demo.model.remove(['rect-a']))
  await expect(page.locator('[data-anchor-id="c1"] [data-anchor-element]')).toHaveCount(1)
  await page.getByRole('button', { name: '评论 c1', exact: true }).click()
  expect(await page.evaluate(() => window.demo.lastAnchorClick.elementIds)).toEqual(['rect-b'])
  await second.evaluate(() => window.demo.model.remove(['rect-b']))
  await expect(page.locator('[data-anchor-id="c1"]')).toHaveCount(0)
  await page.evaluate(() => window.demo.setAnchors([{ anchorId: 'c2', anchor: window.demo.model.captureAnchor(['text-a']), resolved: true }]))
  await expect(page.locator('[data-anchor-id]')).toHaveCount(0)
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(0)
  await second.close()
})

test('reveal transformed nested group fits actual decoration geometry without selecting or writing, including readonly', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    window.demo.model.add({ id: 'outer', tag: 'Group', x: 5000, y: -3200, rotation: 38, scaleX: 1.8, scaleY: 0.7, children: [
      { id: 'inner', tag: 'Group', x: 100, y: 200, rotation: -22, children: [{ id: 'deep', tag: 'Rect', width: 2500, height: 600, fill: '#3377dd' }] },
    ] })
    window.demo.setAnchors([{ anchorId: 'deep-comment', anchor: window.demo.model.captureAnchor(['deep']) }])
    window.beforeReveal = window.demo.allUpdates.length
    window.savedHandle = window.demo.handle
  })
  for (const readonly of [false, true]) {
    if (readonly) { await page.evaluate(() => window.demo.setMode('readonly')); await expect(page.locator('.canvas-app')).toHaveClass(/is-readonly/) }
    const result = await page.evaluate(() => window.demo.handle.revealAnchor(window.demo.model.captureAnchor(['deep', 'missing']), { padding: 60 }))
    expect(result.revealed).toBe(true); expect(result.missingIds).toEqual(['missing'])
    await expect.poll(async () => {
      const box = await page.locator('[data-anchor-element="deep"]').boundingBox(), host = await page.locator('.canvas-host').boundingBox()
      return box.x >= host.x + 58 && box.y >= host.y + 58 && box.x + box.width <= host.x + host.width - 58 && box.y + box.height <= host.y + host.height - 58
    }).toBe(true)
  }
  expect(await page.evaluate(() => window.demo.handle.getSelection())).toEqual([])
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => window.beforeReveal === window.demo.allUpdates.length && window.savedHandle === window.demo.handle)).toBe(true)
})

test('immediate unmount/reopen preserves the last debounced edit and active native text input', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    window.demo.handle.select(['rect-a']); window.demo.handle.updateSelection({ x: 799 })
    const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument()
    reopen(checkpoint)
  })
  await expect.poll(() => page.evaluate(() => window.demo.model.getValue().scene.children.find(x => x.id === 'rect-a').x)).toBe(799)
  const input = await openText(page)
  await input.fill('最后一次中文输入')
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await expect.poll(() => page.evaluate(() => window.demo.model.getValue().scene.children.find(x => x.id === 'text-a').text)).toBe('最后一次中文输入')
  expect(await page.evaluate(() => window.demo.errors)).toEqual([])
})

test('native text input concurrent with remote insertion preserves both, stays editable, own undo preserves peer', async ({ page, context }) => {
  await open(page)
  const second = await context.newPage(); await second.goto(await page.evaluate(() => window.demo.link)); await second.waitForFunction(() => window.demo?.handle)
  const input = await openText(page)
  await input.fill('hello 本地 canvas')
  await second.evaluate(() => window.demo.model.editText('text-a', 0, 0, '远端 '))
  await expect.poll(async () => JSON.stringify(await value(page)) === JSON.stringify(await value(second))).toBe(true)
  await expect(input).toHaveText('远端 hello 本地 canvas')
  expect(await input.evaluate(e => document.activeElement === e)).toBe(true)
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.demo.handle.undo())
  await expect.poll(() => second.evaluate(() => window.demo.model.getValue().scene.children.find(x => x.id === 'text-a').text)).toBe('远端 hello canvas')
  await second.close()
})

test('Chromium IME composition with remote insertion: candidate DOM retained, commit converges, close/reopen retains Chinese', async ({ page, context }) => {
  await open(page)
  const second = await context.newPage(); await second.goto(await page.evaluate(() => window.demo.link)); await second.waitForFunction(() => window.demo?.handle)
  const input = await openText(page)
  await input.evaluate(e => { const r = document.createRange(); r.selectNodeContents(e); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r) })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.imeSetComposition', { text: 'zhongwen', selectionStart: 8, selectionEnd: 8 })
  await expect(input).toContainText('zhongwen')
  await second.evaluate(() => window.demo.model.editText('text-a', 0, 0, '远端 '))
  await expect.poll(() => page.evaluate(() => window.demo.model.getValue().scene.children.find(x => x.id === 'text-a').text.startsWith('远端 '))).toBe(true)
  await expect(input).not.toContainText('远端') // DOM is intentionally frozen for the active candidate.
  expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(0) // No provisional pinyin transaction.
  await cdp.send('Input.insertText', { text: '中文' })
  await expect(input).toHaveText('远端 hello canvas中文')
  await page.evaluate(() => window.demo.handle.flush())
  await expect.poll(async () => JSON.stringify(await value(page)) === JSON.stringify(await value(second))).toBe(true)
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.demo.handle.undo())
  await expect.poll(() => second.evaluate(() => window.demo.model.getValue().scene.children.find(x => x.id === 'text-a').text)).toBe('远端 hello canvas')
  await page.evaluate(() => window.demo.handle.redo())
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await expect.poll(() => page.evaluate(() => window.demo.model.getValue().scene.children.find(x => x.id === 'text-a').text)).toBe('远端 hello canvas中文')
  await second.close()
})

test('package CSS cannot style host brand/toast/icon classes outside its namespace', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    const host = document.createElement('div'); host.id = 'host-css-probe'
    host.innerHTML = '<span class="brand">brand</span><span class="toast">toast</span><span class="i-icon">icon</span>'
    document.body.appendChild(host)
  })
  expect(await page.locator('#host-css-probe .brand').evaluate(e => getComputedStyle(e).display)).toBe('inline')
  expect(await page.locator('#host-css-probe .toast').evaluate(e => getComputedStyle(e).position)).toBe('static')
  expect(await page.locator('#host-css-probe .i-icon').evaluate(e => getComputedStyle(e).display)).toBe('inline')
})

test('checkpoint closes pending composition before readonly; remote text deletion cannot resurrect from native DOM', async ({ page, context }) => {
  await open(page)
  const second = await context.newPage(); await second.goto(await page.evaluate(() => window.demo.link)); await second.waitForFunction(() => window.demo?.handle)
  const input = await openText(page)
  await input.fill('已输入的中文')
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.imeSetComposition', { text: '候选', selectionStart: 2, selectionEnd: 2 })
  await page.evaluate(() => { window.closingCheckpoint = window.demo.model.checkpoint(); window.demo.setMode('readonly') })
  await expect(input).toHaveCount(0)
  await expect(page.locator('.canvas-app')).toHaveClass(/is-readonly/)
  const stored = await page.evaluate(() => window.demo.model.getValue())
  expect(stored.scene.children.find(x => x.id === 'text-a').text).toContain('候选')
  await page.waitForTimeout(200)
  expect(await page.evaluate(() => window.demo.model.getValue())).toEqual(stored)
  await page.evaluate(() => window.demo.setMode('edit'))
  await expect(page.locator('.canvas-app')).not.toHaveClass(/is-readonly/)
  const reopened = await openText(page)
  await reopened.fill('待删除的最后输入')
  await second.evaluate(() => window.demo.model.remove(['text-a']))
  await expect.poll(() => page.evaluate(() => window.demo.model.getValue().scene.children.some(x => x.id === 'text-a'))).toBe(false)
  await expect(reopened).toHaveCount(0)
  await page.evaluate(() => window.demo.handle.flush())
  expect((await value(page)).scene.children.some(x => x.id === 'text-a')).toBe(false)
  await second.close()
})

test('double-click creates a new editable text with stable model identity before its first input', async ({ page }) => {
  await open(page)
  await page.locator('.canvas-host').dblclick({ position: { x: 200, y: 400 } })
  const input = page.locator('.leafer-text-editor')
  await expect(input).toBeVisible(); await input.fill('新建中文文本')
  await page.evaluate(() => window.demo.handle.flush())
  const text = await page.evaluate(() => window.demo.model.find('新建中文文本')[0])
  expect(text.elementId).toBeTruthy()
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  expect(await page.evaluate(() => window.demo.model.find('新建中文文本')[0].elementId)).toBe(text.elementId)
})
