// node node_modules/aidcanvas/examples/history.mjs
import assert from 'node:assert/strict'
import { CanvasModel, createHistoryRestore, switchCanvasEpoch } from 'aidcanvas/model'

const current = CanvasModel.initialize('live-epoch', { version: 1, scene: { children: [{ id: 'box', tag: 'Rect', x: 10 }] } })
const history = current.checkpoint() // Doca stores original bytes + business history ID.
const anchor = current.captureAnchor(['box'])
current.patch('box', { x: 200 })

// Authority: acquire room write barrier, settle/extract pending work, preserve pre-rollback history.
const recoveryCopy = current.checkpoint()
const restoredCheckpoint = createHistoryRestore(history, 'new-server-epoch')
// Doca must atomically persist restoredCheckpoint + room epoch and invalidate the old room before broadcasting.
const restored = switchCanvasEpoch(current, restoredCheckpoint, 0)
assert.equal(restored.getValue().scene.children[0].x, 10)
assert.equal(restored.resolveAnchor(anchor).valid, false)
assert.throws(() => restored.applyUpdate(recoveryCopy), /EPOCH/)
console.log('History restore: PASS; original element IDs retained, old epoch anchors/updates rejected')
restored.dispose(); current.dispose()
