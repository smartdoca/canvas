// node examples/server.mjs — no DOM or mock browser globals required.
import assert from 'node:assert/strict'
import { CanvasModel } from 'aidcanvas/model'

const authority = CanvasModel.initialize('example-epoch', { version: 1, scene: { children: [{ id: 'box', tag: 'Rect', x: 0, fill: 'red' }] } })
const checkpoint = authority.checkpoint()
const a = CanvasModel.restore(checkpoint), b = CanvasModel.restore(checkpoint)
const outboxA = [], outboxB = []
a.onLocalUpdate(update => outboxA.push(update))
b.onLocalUpdate(update => outboxB.push(update))
a.patch('box', { x: 100 })
b.patch('box', { fill: 'blue' })
for (const update of [...outboxA, ...outboxB]) {
  // Real backend: check ACL + message dedup, merge/validate in transaction,
  // persist checkpoint/update + projection + seq atomically, THEN send durable ACK.
  authority.applyUpdate(update)
}
a.applyUpdate(authority.diff(a.stateVector()))
b.applyUpdate(authority.diff(b.stateVector()))
const restored = CanvasModel.restore(authority.checkpoint())
assert.deepEqual(a.getValue(), b.getValue())
assert.deepEqual(restored.getValue(), authority.getValue())
console.log(JSON.stringify({ merged: restored.getValue(), localUpdates: [outboxA.length, outboxB.length], checkpointBytes: authority.checkpoint().update.length }, null, 2))
for (const model of [a, b, authority, restored]) model.dispose()
