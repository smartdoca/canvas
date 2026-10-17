import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

// Two independent browser realms and an ordered example-host transport. The
// configurable one-way delay is simulated; no backend or durable ACK is claimed.
const delayMs = Number(process.env.PERF_LATENCY_MS || 15)
const sizes = (process.env.PERF_COUNTS || '1000,5000,10000').split(',').map(Number)
const samples = Number(process.env.PERF_SAMPLES || 12)
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)]
const stats = values => ({ p50: percentile(values, .5), p95: percentile(values, .95), max: Math.max(...values) })
const browser = await chromium.launch({ executablePath: process.env.CANVAS_BROWSER || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const results = []
try {
  for (const count of sizes) {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    const a = await context.newPage(), b = await context.newPage(), errors = [], received = [], queues = [[], []], writes = [0, 0]
    for (const page of [a, b]) { page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) }) }
    const url = `${process.env.AIDCANVAS_TEST_URL || 'http://127.0.0.1:4179'}/examples/performance/?count=${count}`
    await a.goto(url); await a.waitForFunction(() => window.perf)
    const checkpoint = await a.evaluate(() => { const c = window.perf.model.checkpoint(); return { ...c, update: Array.from(c.update) } })
    await b.addInitScript(value => { window.__CANVAS_PERF_CHECKPOINT = value }, checkpoint)
    await b.goto(url); await b.waitForFunction(() => window.perf)
    let connected = true, delivery = Promise.resolve()
    const deliver = (source, update) => {
      delivery = delivery.then(async () => {
        if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs))
        const timing = await [b, a][source].evaluate(async payload => {
          const start = performance.now()
          window.perf.model.applyUpdate({ ...payload, update: Uint8Array.from(payload.update) })
          const applyMs = performance.now() - start
          await window.perf.frame()
          return { applyMs, paintedAt: performance.timeOrigin + performance.now() }
        }, update)
        received.push({ source, id: update.id, bytes: update.update.length, ...timing, latencyMs: timing.paintedAt - update.sentAt })
      })
    }
    for (const [source, page] of [a, b].entries()) {
      await page.exposeFunction('__sendPerfUpdate', update => {
        writes[source]++
        queues[source].push(update)
        if (connected) deliver(source, update)
      })
      await page.evaluate(() => {
        window.perf.model.onLocalUpdate(update => window.__sendPerfUpdate({ ...update, update: Array.from(update.update), sentAt: performance.timeOrigin + performance.now() }))
        window.perf.gaps = []; window.perf.running = true
        let last = performance.now()
        const tick = now => { window.perf.gaps.push(now - last); last = now; if (window.perf.running) requestAnimationFrame(tick) }
        requestAnimationFrame(tick)
      })
    }
    const settled = async () => {
      // Exposed function callbacks arrive after the synchronous editor command.
      await Promise.all([a, b].map(page => page.evaluate(() => window.perf.frame())))
      await delivery
    }
    const commandMs = await a.evaluate(async iterations => {
      const durations = []
      for (let i = 0; i < iterations; i++) {
        const start = performance.now(); window.perf.model.patch('n-1', { x: 40 + i }); durations.push(performance.now() - start)
        await window.perf.frame()
      }
      return durations
    }, samples)
    await settled()
    const patchMeasurements = [...received]
    assert.equal(writes[1], 0, 'Remote application echoed content')
    const nativeMs = await a.evaluate(async () => {
      window.perf.handle.select(['n-2'])
      const durations = []
      for (let i = 0; i < 6; i++) {
        const start = performance.now(); window.perf.handle.updateSelection({ x: 80 + i }); window.perf.handle.flush(); durations.push(performance.now() - start)
        await window.perf.frame()
      }
      return durations
    })
    await settled()
    connected = false
    const beforeOffline = queues.map(queue => queue.length)
    await Promise.all([a, b].map((page, side) => page.evaluate(side => {
      for (let i = 0; i < 8; i++) window.perf.model.patch(`n-${10 + side}`, { y: 60 + i })
      window.perf.model.editText('n-0', 0, 0, side ? '乙' : '甲')
    }, side)))
    const reconnectStart = Date.now()
    connected = true
    const buffered = queues.flatMap((queue, source) => queue.slice(beforeOffline[source]).map(update => ({ source, update })))
    // Replay original IDs/bytes and a duplicate, as an outbox would after a
    // lost receipt. The receiver must converge without a new local update.
    for (const { source, update } of buffered) deliver(source, update)
    if (buffered.length) deliver(buffered[0].source, buffered[0].update)
    await delivery
    const reconnectMs = Date.now() - reconnectStart
    const values = await Promise.all([a, b].map(page => page.evaluate(() => JSON.stringify(window.perf.model.getValue()))))
    assert.equal(values[0], values[1], 'Peers diverged after offline concurrent edits')
    assert.equal(writes[1], 9, 'Remote replay echoed writes')
    assert.equal(writes[0], samples + 6 + 9, 'Unexpected view-only/content updates')
    await b.evaluate(() => window.perf.model.setReadOnly(true))
    assert.equal(await b.evaluate(() => { try { window.perf.model.patch('n-1', { x: 1 }); return false } catch { return true } }), true)
    const gaps = await Promise.all([a, b].map(page => page.evaluate(() => { window.perf.running = false; return window.perf.gaps })))
    assert.deepEqual(errors, [])
    const result = { count, oneWayDelayMs: delayMs, samples, commandMs: stats(commandMs), nativeCommandMs: stats(nativeMs), receiverApplyAndProjectionMs: stats(patchMeasurements.map(x => x.applyMs)), visibleLatencyMs: stats(patchMeasurements.map(x => x.latencyMs)), updateBytes: stats(patchMeasurements.map(x => x.bytes)), frameGapMs: gaps.map(stats), reconnectMs, replayed: buffered.length + 1, writes, converged: true, errors }
    results.push(result); console.log(JSON.stringify(result))
    await context.close()
  }
  if (process.env.PERF_OUTPUT) await writeFile(process.env.PERF_OUTPUT, JSON.stringify(results, null, 2))
} finally { await browser.close() }
