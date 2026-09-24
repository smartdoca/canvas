import { performance } from 'node:perf_hooks'
import { writeFile } from 'node:fs/promises'
import { CanvasModel } from '../../dist/model.js'
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const measure = fn => { const start = performance.now(); const value = fn(); return [performance.now() - start, value] }
const results = []
for (const count of [100, 1000, 5000, 10000]) {
  const children = Array.from({ length: count }, (_, i) => ({ id: `n-${i}`, tag: i % 5 ? 'Rect' : 'Text', x: i % 100 * 30, y: Math.floor(i / 100) * 30, width: 24, height: 24, fill: '#7799bb', ...(i % 5 ? {} : { text: `中文 ${i}` }) }))
  const [initializeMs, a] = measure(() => CanvasModel.initialize('benchmark', { version: 1, scene: { children } }))
  const [checkpointMs, checkpoint] = measure(() => a.checkpoint())
  const [restoreMs, b] = measure(() => CanvasModel.restore(checkpoint))
  const updates = []; a.onLocalUpdate(update => updates.push(update))
  const get = [], patch = [], remote = [], anchors = []
  for (let i = 0; i < 5; i++) {
    get.push(measure(() => a.getValue())[0])
    patch.push(measure(() => a.patch('n-1', { x: 50 + i }))[0])
    remote.push(measure(() => b.applyUpdate(updates.at(-1)))[0])
    anchors.push(measure(() => { for (let j = 0; j < 100; j++) a.resolveAnchor(a.captureAnchor([`n-${j}`])) })[0])
  }
  results.push({ count, initializeMs, checkpointMs, restoreMs, checkpointBytes: checkpoint.update.length, getValueMs: median(get), patchMs: median(patch), remoteMs: median(remote), resolve100AnchorsMs: median(anchors) })
  if (JSON.stringify(a.getValue()) !== JSON.stringify(b.getValue())) throw new Error('CONVERGENCE_FAILED')
  a.dispose(); b.dispose()
}
console.log(JSON.stringify(results, null, 2))
if (process.env.PERF_OUTPUT) await writeFile(process.env.PERF_OUTPUT, JSON.stringify(results, null, 2))
