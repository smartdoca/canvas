import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CanvasModel } from '../dist/model.js'

test('text presence is ephemeral, relative to original characters and bound to epoch/text identity', () => {
  const a = CanvasModel.initialize('presence-test', { version: 1, scene: { children: [{ id: 'a', tag: 'Text', text: '甲乙丙' }, { id: 'b', tag: 'Text', text: '另一个' }] } })
  const b = CanvasModel.restore(a.checkpoint()), original = a.checkpoint(), updates = []
  a.onLocalUpdate(update => updates.push(update))
  const selection = a.captureTextPresence('a', { anchor: 1, focus: 3 })
  assert.deepEqual(b.resolveTextPresence(selection), { anchor: 1, focus: 3 })
  assert.deepEqual(a.checkpoint(), original)
  assert.deepEqual(updates, [])
  b.editText('a', 0, 0, '新增')
  assert.deepEqual(b.resolveTextPresence(selection), { anchor: 3, focus: 5 })
  assert.equal(b.resolveTextPresence({ ...selection, epochId: 'wrong' }), undefined)
  assert.equal(b.resolveTextPresence({ ...selection, elementId: 'b' }), undefined)
  for (const anchor of ['invalid', '{}', 'null', '[]', 'a'.repeat(2049)]) assert.equal(b.resolveTextPresence({ ...selection, anchor }), undefined)
  assert.equal(a.captureTextPresence('a', { anchor: -1, focus: 1 }), undefined)
  assert.equal(a.captureTextPresence('a', { anchor: 0, focus: 99 }), undefined)
  b.remove(['a']); assert.equal(b.resolveTextPresence(selection), undefined)
  a.setReadOnly(true); assert.equal(a.captureTextPresence('a', { anchor: 0, focus: 1 }), undefined)
  a.dispose(); b.dispose()
})
