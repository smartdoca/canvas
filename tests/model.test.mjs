import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import * as Y from 'yjs'
import { CanvasModel, toPersistedCanvasScene, visibleRemoteSelections, switchCanvasEpoch, createHistoryRestore } from '../dist/model.js'

test('rough render caches are removed before initialize/diff; every style, clone, undo and checkpoint stays canonical', () => {
  const f = fixture()
  for (const style of ['hachure', 'cross-hatch', 'zigzag', 'dots', 'solid']) {
    const base = f.a.getValue().scene, native = structuredClone(base)
    Object.assign(native.children[0], { fill: { type: 'image', url: 'data:image/png;base64,render-only' }, rotation: 35, scaleX: 1.5,
      data: { roughMode: true, roughOriginalFill: '#ffc9c9', roughFillStyle: style, roughSeed: 1234 } })
    const normalized = toPersistedCanvasScene(native)
    assert.equal(normalized.children[0].fill, '#ffc9c9')
    assert.match(native.children[0].fill.url, /^data:/) // no caller mutation
    f.a.applyScene(native, base)
    for (const update of f.qa) assert.doesNotMatch(Buffer.from(update.update).toString(), /data:image|blob:|render-only/)
    f.sync()
    assert.equal(node(f.server, 'r1').data.roughFillStyle, style)
    const restored = CanvasModel.restore(f.server.checkpoint())
    assert.deepEqual(restored.getValue(), f.a.getValue()); restored.dispose()
  }
  const copyId = f.a.add({ ...node(f.a, 'r1'), id: 'rough-copy' })
  f.sync(); f.a.undo(); f.sync(); assert.equal(node(f.b, copyId), undefined)
  f.a.redo(); f.sync(); assert.equal(node(f.b, copyId).fill, '#ffc9c9')
  f.done()
})

test('raw unsafe updates fail closed without echo or mutation; stable image resources still work', () => {
  const f = fixture(), before = f.a.checkpoint()
  for (const url of ['data:image/png;base64,cache', 'blob:https://example/uuid', 'https://example/image?signature=secret']) {
    assert.throws(() => f.a.add({ tag: 'Image', data: { resourcePath: url } }), /UNSAFE_RESOURCE_URL/)
    const bad = new Y.Doc(); Y.applyUpdate(bad, before.update)
    bad.getMap('elements').get('r1').get('props').set('fill', { type: 'image', url })
    const update = { ...before, update: Y.encodeStateAsUpdate(bad) }
    assert.throws(() => f.a.applyUpdate(update), /UNSAFE_RESOURCE_URL/)
    assert.throws(() => CanvasModel.restore(update), /UNSAFE_RESOURCE_URL/)
    assert.deepEqual(f.a.checkpoint(), before)
    assert.equal(f.qa.length, 0); bad.destroy()
  }
  f.a.add({ tag: 'Image', data: { resourcePath: 'assets/stable-id', sourceUrl: 'blob:display-only' }, url: 'data:image/png,display' })
  f.sync(); assert.equal(f.b.getValue().scene.children.at(-1).url, 'assets/stable-id')
  f.done()
})

const initial = { version: 1, scene: { tag: 'Leafer', children: [
  { id: 'r1', tag: 'Rect', x: 0, y: 0, fill: 'red', width: 80, height: 50 },
  { id: 'r2', tag: 'Rect', x: 100, y: 0, width: 40, height: 40 },
  { id: 't1', tag: 'Text', text: 'hello world', x: 0, y: 100 },
] } }
const fixture = () => {
  const server = CanvasModel.initialize('epoch-1', initial)
  const a = CanvasModel.restore(server.checkpoint()), b = CanvasModel.restore(server.checkpoint())
  const qa = [], qb = []
  a.onLocalUpdate(u => qa.push(u)); b.onLocalUpdate(u => qb.push(u))
  const sync = () => { qa.splice(0).forEach(u => { b.applyUpdate(u); server.applyUpdate(u) }); qb.splice(0).forEach(u => { a.applyUpdate(u); server.applyUpdate(u) }) }
  const done = () => [server, a, b].forEach(m => m.dispose())
  return { server, a, b, qa, qb, sync, done }
}
const node = (model, id) => {
  const visit = n => n.id === id ? n : (n.children || []).map(visit).find(Boolean)
  return visit(model.getValue().scene)
}

test('targeted patch equals formal scene adapter, is atomic on invalid fields and keeps caller data isolated', () => {
  const a = CanvasModel.initialize('patch-perf', { version: 1, scene: { children: [{ id: 'r', tag: 'Rect', fill: 'red', x: 1 }, { id: 't', tag: 'Text', text: '中文' }] } })
  const b = CanvasModel.restore(a.checkpoint())
  for (const [id, patch] of [['r', { x: 20, rotation: 30 }], ['r', { x: undefined, data: { roughMode: true, roughOriginalFill: '#ffc9c9' }, fill: { type: 'image', url: 'data:image/png,cache' } }], ['t', { text: '中文 😀' }]]) {
    const base = b.getValue().scene, next = structuredClone(base)
    Object.assign(next.children.find(n => n.id === id), patch)
    b.applyScene(next, base); a.patch(id, patch)
    assert.deepEqual(a.getValue(), b.getValue())
  }
  const before = a.checkpoint()
  assert.throws(() => a.patch('r', { x: 50, surprise: true }), /UNKNOWN_ELEMENT_PROPERTY/)
  assert.deepEqual(a.checkpoint(), before)
  const data = { label: 'safe' }; a.patch('r', { data }); data.label = 'mutated'
  assert.equal(node(a, 'r').data.label, 'safe')
  a.dispose(); b.dispose()
})

test('patch and anchor resolution do not enumerate the whole scene; missing/deleted and epoch semantics remain', () => {
  const m = CanvasModel.initialize('indexed', { version: 1, scene: { children: [{ id: 'r', tag: 'Rect' }, { id: 'g', tag: 'Group', children: [{ id: 'c', tag: 'Rect' }] }] } })
  const anchor = m.captureAnchor(['r', 'c', 'missing']), get = m.getValue.bind(m)
  m.getValue = () => { throw new Error('WHOLE_SCENE_ENUMERATION') }
  assert.equal(m.patch('r', { x: 22 }), true)
  assert.deepEqual(m.resolveAnchor(anchor), { valid: true, partial: true, elementIds: ['r', 'c'] })
  assert.equal(m.resolveAnchor({ ...anchor, epochId: 'other' }).valid, false)
  m.getValue = get; m.remove(['g'])
  assert.deepEqual(m.resolveAnchor(anchor).elementIds, ['r'])
  m.dispose()
})

test('browser-free package entry, initial identity and checkpoint roundtrip', () => {
  assert.equal(typeof globalThis.window, 'undefined')
  const f = fixture()
  assert.deepEqual(f.a.getValue(), f.b.getValue())
  assert.deepEqual([...f.a.stateVector()], [...f.server.stateVector()])
  assert.equal(f.qa.length, 0)
  f.done()
})
test('concurrent different elements and attributes merge; remote has no echo', () => {
  const f = fixture()
  f.a.patch('r1', { x: 20 }); f.a.patch('r2', { fill: 'blue' }); f.b.patch('r1', { fill: 'green' })
  f.sync()
  assert.deepEqual(f.a.getValue(), f.b.getValue())
  assert.equal(node(f.a, 'r1').x, 20); assert.equal(node(f.a, 'r1').fill, 'green')
  assert.equal(f.qa.length + f.qb.length, 0)
  f.done()
})
test('concurrent same attribute is deterministic independent of delivery order', () => {
  const f = fixture()
  f.a.patch('r1', { x: 10 }); f.b.patch('r1', { x: 30 }); f.sync()
  assert.deepEqual(f.a.getValue(), f.b.getValue()); f.done()
})
test('character-level concurrent insertion and deletion; own undo preserves peer changes', () => {
  const f = fixture()
  f.a.editText('t1', 5, 0, ' A'); f.b.editText('t1', 5, 0, ' B'); f.sync()
  assert.match(node(f.a, 't1').text, /A/); assert.match(node(f.a, 't1').text, /B/)
  f.a.undo(); f.sync()
  assert.equal(node(f.a, 't1').text, 'hello B world')
  f.a.redo(); f.sync(); assert.deepEqual(f.a.getValue(), f.b.getValue()); f.done()
})
test('undo property only reverts this session, not a remote property', () => {
  const f = fixture()
  f.a.patch('r1', { x: 50 }); f.b.patch('r1', { fill: 'black' }); f.sync()
  f.a.undo(); f.sync()
  assert.equal(node(f.a, 'r1').x, 0); assert.equal(node(f.a, 'r1').fill, 'black'); f.done()
})
test('delete wins concurrent property updates; repeated deletion sync produces no local update', () => {
  const f = fixture()
  f.a.remove(['r1']); f.b.patch('r1', { x: 999 }); f.sync()
  assert.equal(node(f.a, 'r1'), undefined)
  for (let i = 0; i < 10; i++) { f.b.applyUpdate(f.a.diff(f.b.stateVector())); f.a.applyUpdate(f.b.diff(f.a.stateVector())) }
  assert.equal(f.qa.length + f.qb.length, 0)
  f.a.undo(); f.sync(); assert.equal(node(f.a, 'r1').x, 999); f.done()
})
test('disconnect with local pending updates, pull first then replay original bytes/id', () => {
  const f = fixture()
  f.a.patch('r1', { x: 20 }); const pending = f.qa[0], bytes = [...pending.update], id = pending.id
  f.b.patch('r2', { fill: 'pink' }); f.server.applyUpdate(f.qb[0])
  f.a.applyUpdate(f.server.diff(f.a.stateVector()))
  assert.equal(node(f.a, 'r1').x, 20)
  f.server.applyUpdate(pending); f.server.applyUpdate(pending)
  assert.equal(pending.id, id); assert.deepEqual([...pending.update], bytes)
  f.b.applyUpdate(f.server.diff(f.b.stateVector()))
  assert.deepEqual(f.a.getValue(), f.b.getValue()); f.done()
})
test('group/reparent and sibling ordering converge; concurrent cycles have deterministic projection', () => {
  const f = fixture()
  f.a.add({ id: 'g1', tag: 'Group', children: [] }); f.a.add({ id: 'g2', tag: 'Group', children: [] }); f.sync()
  f.a.place('r1', 'g1'); f.b.patch('r1', { fill: 'yellow' }); f.sync()
  assert.equal(node(f.a, 'g1').children[0].fill, 'yellow')
  f.a.place('g1', 'g2'); f.b.place('g2', 'g1'); f.sync()
  assert.deepEqual(f.a.getValue(), f.b.getValue())
  assert.ok(node(f.a, 'r1')); f.done()
})
test('simultaneous inserts and reorder retain every element exactly once', () => {
  const f = fixture()
  f.a.add({ id: 'a', tag: 'Rect' }); f.b.add({ id: 'b', tag: 'Rect' }); f.sync()
  f.a.place('r2', null, 'r1'); f.b.place('t1', null, 'r1'); f.sync()
  assert.deepEqual(f.a.getValue(), f.b.getValue())
  assert.equal(new Set(f.a.getValue().scene.children.map(x => x.id)).size, 5); f.done()
})
test('invalid epoch/schema and invalid model update are rejected before applying', () => {
  const f = fixture(), before = f.a.getValue()
  assert.throws(() => f.a.applyUpdate({ ...f.b.checkpoint(), epochId: 'other' }), /EPOCH/)
  assert.throws(() => f.a.applyUpdate({ ...f.b.checkpoint(), schemaVersion: 2 }), /SCHEMA/)
  const bad = new Y.Doc(); Y.applyUpdate(bad, f.a.checkpoint().update)
  bad.getMap('elements').get('r1').set('props', 'bad')
  assert.throws(() => f.a.applyUpdate({ ...f.a.checkpoint(), update: Y.encodeStateAsUpdate(bad) }), /SCHEMA/)
  assert.deepEqual(f.a.getValue(), before); bad.destroy(); f.done()
})
test('compaction checkpoint and late unacknowledged update retain original CRDT identities', () => {
  const f = fixture()
  f.a.editText('t1', 0, 0, 'pending ')
  f.b.patch('r2', { fill: 'green' }); f.server.applyUpdate(f.qb[0])
  const restored = CanvasModel.restore(f.server.checkpoint())
  restored.applyUpdate(f.qa[0]); f.sync()
  assert.deepEqual(restored.getValue(), f.a.getValue())
  assert.deepEqual([...restored.stateVector()], [...f.a.stateVector()]); restored.dispose(); f.done()
})
test('readOnly stops model writes, accepts remote; search replacement is one undo', () => {
  const f = fixture()
  f.a.setReadOnly(true); assert.throws(() => f.a.patch('r1', { x: 1 }), /READONLY/)
  f.b.patch('r1', { x: 2 }); f.sync(); assert.equal(node(f.a, 'r1').x, 2)
  assert.equal(f.a.find('HELLO').length, 1); f.a.setReadOnly(false)
  const match = f.a.find('hello')[0]; f.a.patch('r2', { x: 3 }); assert.equal(f.a.replace(match, 'stale'), false)
  assert.equal(f.a.replaceAll('o', 'O'), 2); f.a.undo(); assert.equal(node(f.a, 't1').text, 'hello world'); f.done()
})
test('formal snapshot adapter only writes changed fields; viewport/selection idle is not content', () => {
  const f = fixture(), base = f.a.getValue().scene, next = structuredClone(base)
  next.children[0].x = 45
  f.a.applyScene(next, base); assert.equal(f.qa.length, 1)
  const unchanged = f.a.getValue().scene
  f.a.applyScene({ ...unchanged, x: 100, scale: 3 }, unchanged)
  assert.equal(f.qa.length, 1); f.done()
})
test('stable asset IDs roundtrip and session-level presence/anchor invalidation', () => {
  const f = fixture()
  f.a.add({ id: 'img', tag: 'Image', url: 'https://signed?secret=1', data: { resourcePath: 'asset-1', sourceUrl: 'https://signed' } })
  assert.equal(node(f.a, 'img').url, 'asset-1')
  assert.ok(!JSON.stringify(f.a.getValue()).includes('signed'))
  const anchor = f.a.captureAnchor(['r1']); assert.equal(f.a.resolveAnchor(anchor).valid, true)
  f.a.remove(['r1']); assert.equal(f.a.resolveAnchor(anchor).valid, false)
  const selections = ['s1', 's2'].map(sessionId => ({ sessionId, userId: 'same-user', name: 'Same User', color: '#112233', elementIds: ['img'] }))
  assert.deepEqual(visibleRemoteSelections(selections, 's1').map(s => s.sessionId), ['s2'])
  assert.deepEqual(visibleRemoteSelections(selections, 's1', true), []); f.done()
})

test('atomic group/ungroup keeps stable child identity, peer edit and own undo', () => {
  const f = fixture()
  const anchor = f.a.captureAnchor(['r1'])
  f.a.group(['r1', 'r2'], 'group-1'); f.b.patch('r1', { fill: 'yellow' }); f.sync()
  assert.equal(node(f.a, 'group-1').children.length, 2)
  f.a.ungroup('group-1'); f.sync()
  assert.equal(f.a.resolveAnchor(anchor).valid, true)
  assert.equal(node(f.a, 'r1').fill, 'yellow')
  f.a.undo(); f.sync(); assert.equal(node(f.a, 'group-1').children.length, 2)
  assert.deepEqual(f.a.getValue(), f.b.getValue()); f.done()
})
test('epoch switch requires pending-work settlement; raw images rejected; invalid IDs do not partially write', () => {
  const f = fixture(), next = CanvasModel.initialize('epoch-2', initial)
  assert.throws(() => switchCanvasEpoch(f.a, next.checkpoint(), 1), /PENDING/)
  const switched = switchCanvasEpoch(f.a, next.checkpoint(), 0)
  assert.equal(switched.epochId, 'epoch-2')
  assert.throws(() => f.a.add({ tag: 'Image', url: 'https://example.com/signed' }), /STABLE/)
  const before = f.a.getValue(), invalid = structuredClone(before.scene)
  invalid.children.push({ id: 'r1', tag: 'Rect' })
  assert.throws(() => f.a.applyScene(invalid, before.scene), /ID/)
  assert.deepEqual(f.a.getValue(), before)
  switched.dispose(); next.dispose(); f.done()
})

test('strict validation rejects unknown roots/fields, embedded rich text and malformed property types without mutation', () => {
  const mutations = [
    doc => doc.getMap('unknown').set('x', 1),
    doc => doc.getMap('meta').set('extra', true),
    doc => doc.getMap('meta').set('name', 7),
    doc => doc.getMap('elements').get('r1').set('evil', {}),
    doc => doc.getMap('elements').get('r1').set('placement', { parent: null, rank: 0, hidden: true }),
    doc => doc.getMap('elements').get('r1').get('props').set('onClick', 'evil'),
    doc => doc.getMap('elements').get('r1').get('props').set('x', 'wrong'),
    doc => doc.getMap('elements').get('r1').get('props').set('data', new Y.Map()),
    doc => doc.getMap('elements').get('t1').get('text').insertEmbed(0, { image: 'secret' }),
    doc => doc.getMap('elements').get('t1').get('text').format(0, 2, { bold: true }),
  ]
  for (const mutate of mutations) {
    const f = fixture(), before = f.a.checkpoint(), doc = new Y.Doc()
    Y.applyUpdate(doc, before.update); mutate(doc)
    const envelope = { ...before, update: Y.encodeStateAsUpdate(doc) }
    assert.throws(() => CanvasModel.restore(envelope))
    assert.throws(() => f.a.applyUpdate(envelope))
    assert.deepEqual([...f.a.checkpoint().update], [...before.update]); assert.equal(f.qa.length, 0)
    doc.destroy(); f.done()
  }
  const f = fixture()
  assert.throws(() => f.a.patch('r1', { onClick: 'bad' }), /UNKNOWN_ELEMENT_PROPERTY/)
  assert.equal(f.qa.length, 0); f.done()
})

test('out-of-order struct and delete dependencies are rejected, then valid ordered replay succeeds', () => {
  const f = fixture()
  f.a.editText('t1', 0, 0, 'one'); f.a.editText('t1', 0, 0, 'two')
  const before = f.b.checkpoint()
  assert.throws(() => f.b.applyUpdate(f.qa[1]), /UNRESOLVED/)
  assert.throws(() => CanvasModel.restore({ ...before, update: Y.mergeUpdates([before.update, f.qa[1].update]) }), /UNRESOLVED/)
  assert.deepEqual([...before.update], [...f.b.checkpoint().update])
  f.b.applyUpdate(f.qa[0]); f.b.applyUpdate(f.qa[1]); assert.deepEqual(f.a.getValue(), f.b.getValue())
  const previous = f.qa.length
  f.a.add({ id: 'new-dependency', tag: 'Rect' }); f.a.undo()
  assert.throws(() => f.b.applyUpdate(f.qa[previous + 1]), /UNRESOLVED/)
  f.b.applyUpdate(f.qa[previous]); f.b.applyUpdate(f.qa[previous + 1]); assert.deepEqual(f.a.getValue(), f.b.getValue())
  f.done()
})

test('temporary text branch preserves remote insertion while native IME DOM stays on its older projection', () => {
  const f = fixture(), editing = f.a.startTextSession('t1')
  f.b.editText('t1', 0, 0, '远端 '); f.sync()
  editing.commit('hello 中文 world')
  f.sync()
  assert.equal(node(f.a, 't1').text, '远端 hello 中文 world')
  const result = editing.sync({ anchor: 8, focus: 8 })
  assert.equal(result.text, node(f.a, 't1').text); assert.equal(result.selection.anchor, 11)
  f.a.undo(); f.sync(); assert.equal(node(f.a, 't1').text, '远端 hello world')
  editing.dispose(); f.done()
})

test('dispose and checkpoint flush final native change before subscribers are removed', () => {
  const f = fixture()
  let pending = true
  f.a.beforeApply(() => { if (pending) { pending = false; f.a.editText('t1', 0, 0, '最后输入') } })
  const checkpoint = f.a.checkpoint()
  assert.equal(f.qa.length, 1)
  const restored = CanvasModel.restore(checkpoint); assert.equal(node(restored, 't1').text, '最后输入hello world'); restored.dispose()
  pending = true; f.a.dispose(); assert.equal(f.qa.length, 2)
  f.a.dispose(); assert.equal(f.qa.length, 2)
  f.b.applyUpdate(f.qa[0]); f.b.applyUpdate(f.qa[1]); assert.equal(node(f.b, 't1').text, '最后输入最后输入hello world')
  f.done()
})

test('history restore uses original CRDT identities in a new epoch; old anchors and updates cannot cross it', () => {
  const f = fixture(), history = f.a.checkpoint(), anchor = f.a.captureAnchor(['r1'])
  f.a.patch('r1', { x: 888 }); f.sync()
  const restored = createHistoryRestore(history, 'history-epoch')
  const next = switchCanvasEpoch(f.a, restored, 0)
  assert.equal(node(next, 'r1').x, 0); assert.equal(node(f.a, 'r1').x, 888)
  assert.equal(next.resolveAnchor(anchor).valid, false)
  assert.throws(() => next.applyUpdate(f.a.checkpoint()), /EPOCH/)
  const originalVector = Y.decodeStateVector(f.server.stateVector()), restoredVector = Y.decodeStateVector(next.stateVector())
  const historyDoc = new Y.Doc(); Y.applyUpdate(historyDoc, history.update)
  for (const [client, clock] of Y.decodeStateVector(Y.encodeStateVector(historyDoc))) assert.equal(restoredVector.get(client), clock)
  assert.ok(originalVector.size > 0)
  let pending = true
  f.a.beforeApply(() => { if (pending) { pending = false; f.a.patch('r2', { x: 777 }) } })
  assert.throws(() => switchCanvasEpoch(f.a, restored, 0), /PENDING/)
  historyDoc.destroy(); next.dispose(); f.done()
})

test('all shipped CSS selectors and animation names are package-scoped', () => {
  const css = postcss.parse(readFileSync(new URL('../dist/index.css', import.meta.url), 'utf8'))
  let count = 0
  css.walkRules(rule => {
    if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return
    rule.selectors.forEach(selector => { assert.ok(selector.includes('[data-aidcanvas]'), selector); count++ })
  })
  css.walkAtRules(/keyframes$/, rule => assert.ok(rule.params.startsWith('aidcanvas-')))
  assert.ok(count > 200)
})

test('empty canvas checkpoint restores without synthetic writes and accepts its first concurrent elements', () => {
  const a = CanvasModel.initialize('blank-epoch', { version: 1, scene: { children: [] } }), b = CanvasModel.restore(a.checkpoint())
  const qa = [], qb = []; a.onLocalUpdate(u => qa.push(u)); b.onLocalUpdate(u => qb.push(u))
  assert.deepEqual(a.getValue().scene.children, [])
  assert.equal(qa.length + qb.length, 0)
  a.add({ id: 'first-a', tag: 'Rect' }); b.add({ id: 'first-b', tag: 'Text', text: '空白画板' })
  a.applyUpdate(qb[0]); b.applyUpdate(qa[0]); assert.deepEqual(a.getValue(), b.getValue())
  a.dispose(); b.dispose()
})
