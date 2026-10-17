import { test, expect } from './fixtures.mjs'

const table = page => page.evaluate(() => window.demo.model.getValue().scene.children.find(n => n.id === 'growing-table'))
async function open(page) {
  await page.goto('/examples/doca/'); await page.waitForFunction(() => window.demo?.handle)
  await page.evaluate(() => {
    window.demo.model.remove(window.demo.model.getValue().scene.children.map(n => n.id))
    window.demo.handle.addElement({ id: 'growing-table', tag: 'Group', name: 'board-table', x: 350, y: 230, editable: true, data: { kind: 'table', rows: 3, columns: 3, columnWidths: [140, 140, 140], rowHeights: [46, 46, 46] }, children: Array.from({ length: 9 }, (_, index) => {
      const row = Math.floor(index / 3), column = index % 3
      return { id: `growing-cell-${index}`, tag: 'Frame', name: 'table-cell', x: column * 140, y: row * 46, width: 140, height: 46, fill: row === 0 ? '#eaf1ff' : '#fff', stroke: '#cfd3d8', strokeWidth: 1, hitChildren: false, data: { kind: 'table-cell', row, column }, children: [{ id: index === 0 ? 'growing-label' : `growing-label-${index}`, tag: 'Text', name: 'text', text: ['原始内容', '同一行', '第三列'][index] || '', x: 12, y: 10, width: 116, height: 26, fontFamily: 'Arial, "PingFang SC", sans-serif', fontSize: 14, fontWeight: row === 0 ? 600 : 400, verticalAlign: 'top', editable: true, data: { kind: 'cell-label' } }] }
    }) })
    window.demo.handle.flush()
    window.demo.handle.revealElements(['growing-label'], { maxZoom: 1, padding: 100 })
    window.demo.handle.select(['growing-label'])
  })
  await page.locator('.canvas-app').focus(); await page.keyboard.press('Enter')
  await expect(page.locator('[data-slate-editor]')).toBeFocused()
}

for (const width of [1280, 390]) test(`${width}px: multiline cell grows the shared row, stays unscrolled and persists through peer, undo and reopen`, async ({ page, context }, info) => {
  await page.setViewportSize({ width, height: 844 }); await open(page)
  const peer = await context.newPage(); await peer.goto(await page.evaluate(() => window.demo.link)); await peer.waitForFunction(() => window.demo?.handle)
  const original = await table(page), input = page.locator('[data-slate-editor]')
  const content = '你好就是你\n阿瑟费\n内容撑高整行\n后续行保持对齐'
  await input.fill(content); await page.evaluate(() => window.demo.handle.flush())
  const grown = await table(page), height = grown.data.rowHeights[0]
  expect(height).toBeGreaterThan(46)
  expect(grown.children.filter(cell => cell.data.row === 0).every(cell => cell.height === height && cell.children[0].height === height - 20)).toBe(true)
  expect(grown.children.filter(cell => cell.data.row === 1).every(cell => cell.y === height)).toBe(true)
  await expect(input).toHaveCSS('overflow-y', 'clip')
  expect(await input.evaluate(el => el.scrollTop === 0 && el.scrollHeight <= el.clientHeight + 1)).toBe(true)
  expect(await page.locator('.canvas-app').evaluate(el => el.scrollTop)).toBe(0)
  await expect.poll(() => table(peer)).toEqual(grown)
  await page.keyboard.press('Meta+z'); await expect(input).toHaveText('原始内容'); expect(await table(page)).toEqual(original)
  await page.keyboard.press('Meta+Shift+z'); await expect(input).toContainText('后续行保持对齐'); expect(await table(page)).toEqual(grown)
  await page.screenshot({ path: info.outputPath('table-content-grown.png') })
  await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  const saved = await table(page), writes = await page.evaluate(() => window.demo.allUpdates.length)
  const ready = await page.evaluate(() => window.demo.readyCount)
  await page.evaluate(() => { const reopen = window.demo.openDocument, checkpoint = window.demo.closeDocument(); reopen(checkpoint) })
  await page.waitForFunction(ready => window.demo?.readyCount > ready && !window.demo.model.isDisposed, ready)
  expect(await table(page)).toEqual(saved)
  await page.evaluate(() => window.demo.handle.select(['growing-label'])); await page.locator('.canvas-app').focus(); await page.keyboard.press('Enter')
  await expect(input).toContainText('后续行保持对齐')
  await page.keyboard.press('Escape'); await page.evaluate(() => window.demo.handle.flush())
  expect(await table(page)).toEqual(saved); expect(await page.evaluate(() => window.demo.allUpdates.length)).toBe(writes)
  await peer.close()
})
