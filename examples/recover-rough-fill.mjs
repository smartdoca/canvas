// Offline, explicit recovery rehearsal. Run: node examples/recover-rough-fill.mjs
// NO network, writes to disk, ACK, queue removal, or replacement of the live model.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as Y from 'yjs'
import { CanvasModel, toPersistedCanvasScene } from 'aidcanvas/model'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const initial = { version: 1, scene: { tag: 'Leafer', children: [
  { id: 'rough', tag: 'Rect', name: 'rect', width: 100, height: 80, fill: '#ffffff' },
  { id: 'peer', tag: 'Text', text: 'accepted text' },
] } }
const authority = CanvasModel.initialize('recovery-rehearsal', initial)
const acceptedBase = authority.getValue().scene
// Simulate the old runtime in quarantine, including an update depending on the rejected one.
const quarantine = new Y.Doc(), oldOutbox = []
Y.applyUpdate(quarantine, authority.checkpoint().update)
quarantine.on('update', update => oldOutbox.push({ id: `old-${oldOutbox.length}`, update: update.slice() }))
const props = quarantine.getMap('elements').get('rough').get('props')
quarantine.transact(() => {
  props.set('data', { roughMode: true, roughSeed: 81, roughOriginalFill: '#ffc9c9', roughFillStyle: 'hachure' })
  props.set('fill', { type: 'image', url: 'data:image/png;base64,rejected-cache' })
})
props.set('rotation', 35) // This transaction depends on the previous client clock.
const archive = { checkpointHash: digest(Y.encodeStateAsUpdate(quarantine)), queue: oldOutbox.map(u => ({ id: u.id, hash: digest(u.update) })) }
// Obtain this scene via OLD runtime getValue(), in isolation, not by importing unsafe bytes into the new model.
const quarantinedScene = structuredClone(acceptedBase)
Object.assign(quarantinedScene.children[0], props.toJSON())
authority.editText('peer', 13, 0, ' + remote')
const candidate = CanvasModel.restore(authority.checkpoint()), proposed = []
candidate.onLocalUpdate(u => proposed.push(u))
// REQUIRED: human/host reviews the semantic diff against acceptedBase. Never infer a missing base.
// This rehearsal has no local text changes; do not replay text snapshots over concurrent Y.Text edits.
candidate.applyScene(toPersistedCanvasScene(quarantinedScene), toPersistedCanvasScene(acceptedBase))
assert.equal(proposed.length, 1)
assert.doesNotMatch(Buffer.from(proposed[0].update).toString(), /data:image|rejected-cache/)
assert.equal(candidate.getValue().scene.children[1].text, 'accepted text + remote')
assert.equal(candidate.getValue().scene.children[0].rotation, 35)
assert.equal(candidate.getValue().scene.children[0].fill, '#ffc9c9')
assert.deepEqual(oldOutbox.map(u => ({ id: u.id, hash: digest(u.update) })), archive.queue)
assert.equal(digest(Y.encodeStateAsUpdate(quarantine)), archive.checkpointHash)
// A separate test replica stands for an authority dry-run; nothing is sent or acknowledged.
const dryRun = CanvasModel.restore(authority.checkpoint())
dryRun.applyUpdate(proposed[0]); dryRun.applyUpdate(proposed[0])
assert.deepEqual(dryRun.getValue(), candidate.getValue())
console.log(JSON.stringify({ result: 'PASS: quarantined originals unchanged; reviewed semantic replay has NEW ID/bytes; remote text retained', archive, proposedId: proposed[0].id }, null, 2))
;[authority, candidate, dryRun].forEach(m => m.dispose()); quarantine.destroy()
