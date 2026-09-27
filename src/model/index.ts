import * as Y from 'yjs'

export const CANVAS_CODEC = 'aidcanvas-yjs' as const
export const CANVAS_SCHEMA_VERSION = 1 as const
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export interface SceneNode { id?: string; tag?: string; children?: SceneNode[]; [key: string]: unknown }
export interface ModelValue { version: 1; name: string; updatedAt: string; scene: SceneNode }
export interface CanvasUpdate {
  protocolVersion: 1; codec: typeof CANVAS_CODEC; schemaVersion: 1; epochId: string
  /** Actual Yjs transaction bytes. Host retains these bytes and ID until durable ACK. */
  id: string; update: Uint8Array
}
export interface CanvasCheckpoint { codec: typeof CANVAS_CODEC; schemaVersion: 1; epochId: string; update: Uint8Array }
export interface ElementAnchor { type: 'elements'; epochId: string; elementIds: string[] }
export interface ModelMatch { elementId: string; start: number; end: number; text: string; revision: number }
export interface SessionSelection { sessionId: string; userId: string; name: string; color: string; elementIds: string[] }
/** Transient DOM caret only. Never persist these numeric offsets as comment anchors. */
export interface TextSelection { anchor: number; focus: number }
export interface CanvasTextSession {
  commit(text: string): boolean
  sync(selection?: TextSelection): { text: string; selection?: TextSelection; deleted: boolean }
  dispose(): void
}
export type ModelOrigin = 'local' | 'remote'
export type CanvasFlushReason = 'command' | 'remote' | 'sync' | 'checkpoint' | 'undo' | 'dispose'
export interface ModelChange { origin: ModelOrigin; revision: number }
type Flat = { id: string; parent: string | null; index: number; props: Record<string, unknown> }
type Placement = { parent: string | null; rank: number }
const forbidden = new Set(['__proto__', 'constructor', 'prototype'])
const tags = new Set(['Rect', 'Ellipse', 'Line', 'Path', 'Polygon', 'Star', 'Text', 'Frame', 'Group', 'Image', 'Arrow'])
// Schema 1 extension payloads live under data; executable or unknown model fields are not accepted.
const propertyKeys = new Set(('tag name data x y width height scale scaleX scaleY rotation skewX skewY origin around offsetX offsetY ' +
  'opacity visible locked editable hittable hitSelf hitChildren hitFill hitStroke hitBox hitRadius cursor ' +
  'fill stroke strokeWidth strokeAlign strokeCap strokeJoin dashPattern dashOffset cornerRadius cornerSmoothing ' +
  'shadow innerShadow blur backgroundBlur blendMode mask eraser overflow scrollX scrollY ' +
  'path windingRule points curve closed startArrow endArrow arrowSize ' +
  'fontFamily fontSize fontWeight italic textCase textDecoration textAlign verticalAlign lineHeight letterSpacing ' +
  'paraIndent paraSpacing textWrap textOverflow maxLines autoSizeAlign padding resizeFontSize lockRatio editConfig ' +
  'url image smoothing pixelRatio crossOrigin startAngle endAngle innerRadius sides corners tension ' +
  'zIndex draggable dragBounds dragOut event bubbleEvent button').split(' '))
export const CANVAS_ELEMENT_PROPERTIES: readonly string[] = Object.freeze([...propertyKeys])
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export const createElementId = () => globalThis.crypto.randomUUID()

/** Native render projection -> persistent drawing intent, before any Yjs transaction.
 * Does not modify checkpoints, update bytes, IDs, or the input object.
 */
export function toPersistedCanvasScene(scene: SceneNode): SceneNode {
  const copy = clone(scene)
  const visit = (node: SceneNode) => {
    const data = node.data as Record<string, unknown> | undefined
    if (data?.roughMode === true) node.fill = clone(data.roughOriginalFill ?? null)
    if (data?.resourcePath) {
      node.url = data.resourcePath
      data.sourceUrl = data.resourcePath
    }
    const lineHeight = node.lineHeight as { type?: string; value?: number } | undefined
    if (node.tag === 'Text' && lineHeight?.type === 'percent' && lineHeight.value === 1.5) delete node.lineHeight
    node.children?.forEach(visit)
  }
  visit(copy)
  return copy
}

function assertJson(v: unknown, depth = 0): void {
  if (depth > 64) throw new Error('MODEL_DEPTH')
  if (v === null || typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v)) return
  if (Array.isArray(v)) { v.forEach(x => assertJson(x, depth + 1)); return }
  if (typeof v !== 'object' || !v || Object.getPrototypeOf(v) !== Object.prototype) throw new Error('INVALID_JSON')
  Object.entries(v).forEach(([k, x]) => { if (forbidden.has(k)) throw new Error('UNSAFE_KEY'); assertJson(x, depth + 1) })
}

/** Prepare a current-schema value once on the authority, then distribute its checkpoint. */
function prepareCanvasValue(value: { version: number; scene: SceneNode; name?: string }): ModelValue {
  if (value.version !== 1) throw new Error('UNSUPPORTED_DOCUMENT_VERSION')
  const scene = clone(value.scene)
  const ids = new Set<string>()
  const visit = (nodes: SceneNode[]) => nodes.forEach(node => {
    if (!node.id) node.id = createElementId()
    if (ids.has(node.id)) throw new Error('DUPLICATE_ELEMENT_ID')
    ids.add(node.id)
    visit(node.children || [])
  })
  visit(scene.children || [])
  return { version: 1, name: value.name || '未命名画布', updatedAt: '', scene }
}

function flatten(scene: SceneNode): Map<string, Flat> {
  const result = new Map<string, Flat>()
  const visit = (nodes: SceneNode[], parent: string | null, depth = 0) => nodes.forEach((node, index) => {
    if (depth > 64) throw new Error('MODEL_DEPTH')
    if (typeof node.id !== 'string' || !node.id || result.has(node.id) || forbidden.has(node.id)) throw new Error('INVALID_ELEMENT_ID')
    const { id, ...props } = toPersistedCanvasScene({ ...node, children: undefined })
    if (typeof props.tag !== 'string' || !tags.has(props.tag)) throw new Error('UNSUPPORTED_ELEMENT_TAG')
    // Viewport is root-only. Resolved image URLs never enter the model.
    const data = props.data as Record<string, unknown> | undefined
    if (props.tag === 'Image' && (typeof data?.resourcePath !== 'string' || !data.resourcePath)) throw new Error('IMAGE_REQUIRES_STABLE_RESOURCE_PATH')
    if (data?.resourcePath) { props.url = data.resourcePath; props.data = { ...data, sourceUrl: data.resourcePath } }
    Object.entries(props).forEach(([key, value]) => {
      if (key === 'text' && props.tag === 'Text') { if (typeof value !== 'string') throw new Error('INVALID_PLAIN_TEXT') }
      else validateProperty(key, value)
    })
    result.set(id!, { id: id!, parent, index, props })
    if (node.children?.length && !['Group', 'Frame'].includes(String(props.tag))) throw new Error('UNSUPPORTED_CHILDREN')
    visit(node.children || [], id!, depth + 1)
  })
  visit(scene.children || [], null)
  return result
}

/** No DOM, networking, storage, authentication or ACK implementation. One instance per session. */
export class CanvasModel {
  private doc: Y.Doc
  private elements: Y.Map<Y.Map<unknown>>
  private undoManager: Y.UndoManager
  private localOrigin = Object.freeze({ kind: 'canvas-local' })
  private localListeners = new Set<(update: CanvasUpdate) => void>()
  private changeListeners = new Set<(change: ModelChange) => void>()
  private flushListeners = new Set<(reason: CanvasFlushReason) => void>()
  private readonlyFlag = false
  private disposed = false
  private rev = 0
  readonly epochId: string

  private constructor(checkpoint: CanvasCheckpoint) {
    checkEnvelope(checkpoint)
    this.epochId = checkpoint.epochId
    this.doc = new Y.Doc()
    try { Y.applyUpdate(this.doc, checkpoint.update); validateDoc(this.doc, this.epochId) }
    catch (error) { this.doc.destroy(); throw error }
    this.elements = this.doc.getMap('elements')
    this.undoManager = new Y.UndoManager(this.elements, { trackedOrigins: new Set([this.localOrigin]), captureTimeout: 0 })
    this.doc.on('update', this.handleUpdate)
  }

  static initialize(epochId: string, value: { version: number; scene: SceneNode; name?: string }): CanvasModel {
    if (!epochId) throw new Error('EPOCH_REQUIRED')
    const normalized = prepareCanvasValue(value)
    const flat = flatten(normalized.scene)
    const doc = new Y.Doc()
    const elements = doc.getMap<Y.Map<unknown>>('elements')
    doc.transact(() => {
      doc.getMap('meta').set('epochId', epochId)
      doc.getMap('meta').set('schemaVersion', CANVAS_SCHEMA_VERSION)
      doc.getMap('meta').set('name', normalized.name)
      flat.forEach(f => elements.set(f.id, makeElement(f, f.index)))
    }, 'bootstrap')
    const checkpoint = { codec: CANVAS_CODEC, schemaVersion: CANVAS_SCHEMA_VERSION, epochId, update: Y.encodeStateAsUpdate(doc) }
    doc.destroy()
    return new CanvasModel(checkpoint)
  }
  static restore(checkpoint: CanvasCheckpoint) { return new CanvasModel(checkpoint) }
  get revision() { return this.rev }
  get isDisposed() { return this.disposed }
  get readOnly() { return this.readonlyFlag }
  get canUndo() { return this.undoManager.canUndo() }
  get canRedo() { return this.undoManager.canRedo() }
  setReadOnly(value: boolean) { this.readonlyFlag = value }
  onLocalUpdate(fn: (update: CanvasUpdate) => void) { this.localListeners.add(fn); return () => { this.localListeners.delete(fn) } }
  subscribe(fn: (change: ModelChange) => void) { this.changeListeners.add(fn); return () => { this.changeListeners.delete(fn) } }
  /** View adapters synchronously flush pending native edits before a remote merge or undo. */
  beforeApply(fn: (reason: CanvasFlushReason) => void) { this.flushListeners.add(fn); return () => { this.flushListeners.delete(fn) } }
  flush(reason: CanvasFlushReason = 'command') { if (this.disposed) throw new Error('MODEL_DISPOSED'); this.flushListeners.forEach(fn => fn(reason)) }
  private handleUpdate = (bytes: Uint8Array, origin: unknown) => {
    const local = origin === this.localOrigin || origin === this.undoManager
    this.rev++
    if (local) {
      const update: CanvasUpdate = { protocolVersion: 1, codec: CANVAS_CODEC, schemaVersion: 1, epochId: this.epochId, id: createElementId(), update: bytes.slice() }
      this.localListeners.forEach(fn => fn({ ...update, update: update.update.slice() }))
    }
    this.changeListeners.forEach(fn => fn({ origin: local ? 'local' : 'remote', revision: this.rev }))
  }
  private write(fn: () => void) {
    if (this.disposed) throw new Error('MODEL_DISPOSED')
    if (this.readonlyFlag) throw new Error('READONLY')
    this.doc.transact(fn, this.localOrigin)
  }
  checkpoint(): CanvasCheckpoint {
    this.flush('checkpoint')
    return { codec: CANVAS_CODEC, schemaVersion: 1, epochId: this.epochId, update: Y.encodeStateAsUpdate(this.doc) }
  }
  stateVector() { this.flush('sync'); return Y.encodeStateVector(this.doc) }
  /** Pull response; never feed this result into a local outbox. */
  diff(vector: Uint8Array): CanvasCheckpoint {
    this.flush('sync')
    return { codec: CANVAS_CODEC, schemaVersion: 1, epochId: this.epochId, update: Y.encodeStateAsUpdate(this.doc, vector) }
  }
  applyUpdate(update: CanvasCheckpoint) {
    checkEnvelope(update)
    if (update.epochId !== this.epochId) throw new Error('EPOCH_MISMATCH')
    this.flush('remote')
    // Validate in an isolated replica first; malformed content cannot partially mutate the live document.
    const candidate = new Y.Doc()
    try {
      Y.applyUpdate(candidate, Y.encodeStateAsUpdate(this.doc))
      Y.applyUpdate(candidate, update.update)
      validateDoc(candidate, this.epochId)
      this.elements.forEach((element, id) => {
        const next = candidate.getMap<Y.Map<unknown>>('elements').get(id)
        if (next && (next.get('props') as Y.Map<unknown>).get('tag') !== (element.get('props') as Y.Map<unknown>).get('tag')) throw new Error('ELEMENT_IDENTITY_IMMUTABLE')
      })
      Y.applyUpdate(this.doc, update.update, 'remote')
    } finally { candidate.destroy() }
  }
  getValue(): ModelValue {
    const alive = new Map<string, { props: SceneNode; placement: Placement }>()
    this.elements.forEach((e, id) => {
      if (e.get('deleted')) return
      const props = (e.get('props') as Y.Map<unknown>).toJSON() as SceneNode
      props.id = id
      if (props.tag === 'Text') props.text = (e.get('text') as Y.Text).toString()
      alive.set(id, { props, placement: e.get('placement') as Placement })
    })
    const parentFor = (id: string) => {
      const seen = new Set([id])
      let p = alive.get(id)?.placement.parent || null
      const immediate = p
      while (p) {
        if (!alive.has(p) || seen.has(p)) return null
        seen.add(p); p = alive.get(p)!.placement.parent
      }
      return immediate
    }
    const children = new Map<string | null, string[]>()
    alive.forEach((_, id) => {
      const p = parentFor(id), siblings = children.get(p)
      if (siblings) siblings.push(id)
      else children.set(p, [id])
    })
    const build = (parent: string | null): SceneNode[] => (children.get(parent) || [])
      .sort((a, b) => alive.get(a)!.placement.rank - alive.get(b)!.placement.rank || (a < b ? -1 : a > b ? 1 : 0))
      .map(id => { const p = clone(alive.get(id)!.props); if (children.has(id)) p.children = build(id); return p })
    return { version: 1, name: String(this.doc.getMap('meta').get('name')), updatedAt: '', scene: { tag: 'Leafer', children: build(null) } }
  }
  /** Formal scene-to-CRDT adapter. The base is the last view projection, not the current remote snapshot. */
  applyScene(next: SceneNode, base: SceneNode, expectedRevision = this.rev) {
    if (expectedRevision !== this.rev) throw new Error('STALE_PROJECTION')
    const before = flatten(base), after = flatten(next)
    after.forEach(f => {
      if (!before.has(f.id) && this.elements.has(f.id)) throw new Error('ELEMENT_ID_REUSE')
      const old = before.get(f.id)
      if (old && old.props.tag !== f.props.tag) throw new Error('ELEMENT_TAG_IMMUTABLE')
    })
    if (this.elements.size + [...after.keys()].filter(id => !this.elements.has(id)).length > 10000) throw new Error('TOO_MANY_ELEMENTS')
    const placements = new Map<string, Placement>()
    after.forEach(f => placements.set(f.id, (this.elements.get(f.id)?.get('placement') as Placement | undefined) || { parent: f.parent, rank: f.index }))
    // Plan order changes before starting the Yjs transaction, including precision checks.
    new Set([...after.values()].map(f => f.parent)).forEach(parent => {
      const siblings = [...after.values()].filter(x => x.parent === parent).sort((a, b) => a.index - b.index)
      const oldIds = [...before.values()].filter(x => x.parent === parent).sort((a, b) => a.index - b.index).map(x => x.id)
      if (equal(oldIds, siblings.map(x => x.id))) return
      siblings.forEach((f, index) => {
        const place = placements.get(f.id)!
        const prevRank = index ? placements.get(siblings[index - 1].id)!.rank : -Infinity
        if (place.parent !== parent || place.rank <= prevRank || !before.has(f.id)) {
          const following = siblings.slice(index + 1).map(x => placements.get(x.id)!.rank).filter(x => x > prevRank)
          placements.set(f.id, { parent, rank: between(prevRank, following.length ? Math.min(...following) : Infinity) })
        }
      })
    })
    this.write(() => {
      before.forEach((_, id) => { if (!after.has(id)) this.elements.get(id)?.set('deleted', true) })
      after.forEach(f => {
        const old = before.get(f.id)
        if (!old) {
          if (this.elements.has(f.id)) throw new Error('ELEMENT_ID_REUSE')
          this.elements.set(f.id, makeElement(f, f.index)); return
        }
        const e = this.elements.get(f.id)
        if (!e || e.get('deleted')) return
        const props = e.get('props') as Y.Map<unknown>
        new Set([...Object.keys(old.props), ...Object.keys(f.props)]).forEach(key => {
          if (key === 'text' && f.props.tag === 'Text') {
            if (old.props.text !== f.props.text) spliceText(e.get('text') as Y.Text, String(f.props.text || ''))
          } else if (!equal(old.props[key], f.props[key])) {
            if (f.props[key] === undefined) props.delete(key)
            else props.set(key, clone(f.props[key]))
          }
        })
      })
      placements.forEach((place, id) => { const e = this.elements.get(id)!; if (!equal(e.get('placement'), place)) e.set('placement', place) })
    })
  }
  add(element: SceneNode, parent: string | null = null): string {
    const id = element.id || createElementId()
    const value = this.getValue()
    const target = parent ? findNode(value.scene, parent) : value.scene
    if (!target) throw new Error('PARENT_NOT_FOUND')
    target.children = [...(target.children || []), { ...element, id }]
    this.applyScene(value.scene, this.getValue().scene)
    return id
  }
  patch(id: string, patch: Record<string, unknown>) {
    const element = this.elements.get(id)
    if (!element || element.get('deleted')) return false
    if ('id' in patch || 'children' in patch || 'tag' in patch) throw new Error('RESERVED_ELEMENT_PROPERTY')
    const props = element.get('props') as Y.Map<unknown>
    const node: SceneNode = { ...props.toJSON(), id }
    if (node.tag === 'Text') node.text = (element.get('text') as Y.Text).toString()
    // Validate/canonicalize the complete target before entering the transaction, without
    // copying unrelated elements. This preserves the same rough/resource/JSON checks as applyScene.
    const before = flatten({ children: [node] }).get(id)!.props
    const after = flatten({ children: [{ ...node, ...patch }] }).get(id)!.props
    this.write(() => {
      new Set([...Object.keys(before), ...Object.keys(after)]).forEach(key => {
        if (equal(before[key], after[key])) return
        if (key === 'text' && node.tag === 'Text') spliceText(element.get('text') as Y.Text, String(after.text || ''))
        else if (after[key] === undefined) props.delete(key)
        else props.set(key, clone(after[key]))
      })
    })
    return true
  }
  remove(ids: string[]) {
    const value = this.getValue()
    const remove = (node: SceneNode) => { node.children = (node.children || []).filter(x => !ids.includes(x.id!)); node.children.forEach(remove) }
    remove(value.scene)
    this.applyScene(value.scene, this.getValue().scene)
  }
  place(id: string, parent: string | null, beforeId?: string) {
    const value = this.getValue(), node = findNode(value.scene, id), target = parent ? findNode(value.scene, parent) : value.scene
    if (!node || !target || id === parent || parent && findNode(node, parent)) throw new Error('INVALID_PARENT')
    const detach = (n: SceneNode) => { n.children = (n.children || []).filter(x => x.id !== id); n.children.forEach(detach) }
    detach(value.scene)
    target.children ||= []
    const index = beforeId ? target.children.findIndex(x => x.id === beforeId) : target.children.length
    if (index < 0) throw new Error('SIBLING_NOT_FOUND')
    target.children.splice(index, 0, node)
    this.applyScene(value.scene, this.getValue().scene)
  }
  /** Identity-transform group. Native view adapters can supply transformed geometry with applyScene. */
  group(ids: string[], id = createElementId()) {
    const base = this.getValue().scene, next = clone(base), flat = flatten(base)
    const items = [...new Set(ids)].map(key => flat.get(key))
    if (items.length < 2 || items.some(x => !x) || items.some(x => x!.parent !== items[0]!.parent)) throw new Error('GROUP_REQUIRES_SIBLINGS')
    const parent = items[0]!.parent ? findNode(next, items[0]!.parent!)! : next
    const children = parent.children!.filter(x => ids.includes(x.id!))
    const index = Math.min(...items.map(x => x!.index))
    parent.children = parent.children!.filter(x => !ids.includes(x.id!))
    parent.children.splice(index, 0, { id, tag: 'Group', name: 'group', x: 0, y: 0, children })
    this.applyScene(next, base); return id
  }
  ungroup(id: string) {
    const base = this.getValue().scene, next = clone(base), flat = flatten(base), entry = flat.get(id)
    if (!entry || entry.props.tag !== 'Group') throw new Error('GROUP_NOT_FOUND')
    const node = findNode(next, id)!, parent = entry.parent ? findNode(next, entry.parent)! : next
    // Translation is exact. Rotated/scaled groups require the native editor's geometry adapter.
    if (node.rotation || node.skewX || node.skewY || [node.scaleX, node.scaleY, node.scale].some(v => v !== undefined && v !== 1)) throw new Error('TRANSFORMED_GROUP_REQUIRES_VIEW_ADAPTER')
    const children = (node.children || []).map(child => ({ ...child, x: Number(child.x || 0) + Number(node.x || 0), y: Number(child.y || 0) + Number(node.y || 0) }))
    parent.children!.splice(entry.index, 1, ...children)
    this.applyScene(next, base)
  }
  editText(id: string, index: number, deleteCount: number, insert: string) {
    if (typeof insert !== 'string') throw new Error('INVALID_PLAIN_TEXT')
    const e = this.elements.get(id), text = e?.get('text') as Y.Text | undefined
    if (!e || e.get('deleted') || !text) throw new Error('TEXT_NOT_FOUND')
    if (!Number.isInteger(index) || !Number.isInteger(deleteCount) || index < 0 || deleteCount < 0 || index + deleteCount > text.length) throw new Error('INVALID_TEXT_RANGE')
    this.write(() => { if (deleteCount) text.delete(index, deleteCount); if (insert) text.insert(index, insert) })
  }
  /** A temporary CRDT branch for one native text input. Remote changes cannot be overwritten by a stale DOM string. */
  startTextSession(id: string): CanvasTextSession {
    const branch = new Y.Doc()
    this.flush()
    Y.applyUpdate(branch, Y.encodeStateAsUpdate(this.doc))
    const element = branch.getMap<Y.Map<unknown>>('elements').get(id)
    if (!element || element.get('deleted') || (element.get('props') as Y.Map<unknown>).get('tag') !== 'Text') { branch.destroy(); throw new Error('TEXT_NOT_FOUND') }
    const text = element.get('text') as Y.Text
    const origin = {}
    let closed = false
    const alive = () => !closed && !this.disposed && this.elements.has(id) && !this.elements.get(id)!.get('deleted')
    branch.on('update', (update: Uint8Array, source: unknown) => {
      if (source === origin) this.write(() => Y.applyUpdate(this.doc, update, this.localOrigin))
    })
    return {
      commit: next => {
        if (typeof next !== 'string') throw new Error('INVALID_PLAIN_TEXT')
        if (!alive() || this.readOnly) return false
        if (next !== text.toString()) branch.transact(() => spliceText(text, next), origin)
        return true
      },
      sync: selection => {
        if (!alive()) return { text: text.toString(), deleted: true }
        const relative = selection && [selection.anchor, selection.focus].map(index => Y.createRelativePositionFromTypeIndex(text, Math.max(0, Math.min(text.length, index))))
        Y.applyUpdate(branch, Y.encodeStateAsUpdate(this.doc), 'remote')
        const positions = relative?.map(position => Y.createAbsolutePositionFromRelativePosition(position, branch)?.index ?? text.length)
        return { text: text.toString(), deleted: false, selection: positions && { anchor: positions[0], focus: positions[1] } }
      },
      dispose() { if (!closed) { closed = true; branch.destroy() } },
    }
  }
  undo() { this.flush('undo'); if (this.readonlyFlag) return false; return Boolean(this.undoManager.undo()) }
  redo() { this.flush('undo'); if (this.readonlyFlag) return false; return Boolean(this.undoManager.redo()) }
  find(query: string, options: { caseSensitive?: boolean } = {}): ModelMatch[] {
    if (!query) return []
    const matches: ModelMatch[] = []
    flatten(this.getValue().scene).forEach(f => {
      if (f.props.tag !== 'Text' || (f.props.data as Record<string, unknown>)?.atomic) return
      const text = String(f.props.text || '')
      // Escaped literal RegExp retains original UTF-16 offsets under case folding.
      const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options.caseSensitive ? 'gu' : 'giu')
      for (const m of text.matchAll(re)) matches.push({ elementId: f.id, start: m.index, end: m.index + m[0].length, text: m[0], revision: this.rev })
    })
    return matches
  }
  replace(match: ModelMatch, text: string) {
    if (match.revision !== this.rev || this.readonlyFlag) return false
    this.editText(match.elementId, match.start, match.end - match.start, text); return true
  }
  replaceAll(query: string, text: string, options: { caseSensitive?: boolean } = {}) {
    if (typeof text !== 'string') throw new Error('INVALID_PLAIN_TEXT')
    const matches = this.find(query, options)
    this.write(() => matches.reverse().forEach(m => {
      const t = this.elements.get(m.elementId)!.get('text') as Y.Text
      t.delete(m.start, m.end - m.start); if (text) t.insert(m.start, text)
    }))
    return matches.length
  }
  captureAnchor(elementIds: string[]): ElementAnchor { return { type: 'elements', epochId: this.epochId, elementIds: [...new Set(elementIds)] } }
  resolveAnchor(anchor: ElementAnchor) {
    if (!anchor || anchor.type !== 'elements' || !Array.isArray(anchor.elementIds) || anchor.elementIds.some(id => typeof id !== 'string') || anchor.elementIds.length > 10000) return { valid: false, partial: true, elementIds: [] as string[] }
    const elementIds = anchor.epochId === this.epochId ? anchor.elementIds.filter(id => {
      const element = this.elements.get(id)
      return Boolean(element && !element.get('deleted'))
    }) : []
    return { valid: elementIds.length > 0, partial: elementIds.length !== anchor.elementIds.length, elementIds }
  }
  /** Flush while local subscribers/outbox are still attached. Idempotent; never an ACK. */
  dispose() { if (this.disposed) return; this.flush('dispose'); this.disposed = true; this.doc.off('update', this.handleUpdate); this.undoManager.destroy(); this.doc.destroy(); this.changeListeners.clear(); this.localListeners.clear(); this.flushListeners.clear() }
}

function makeElement(f: Flat, rank: number) {
  const e = new Y.Map<unknown>(), props = new Y.Map<unknown>(), text = new Y.Text()
  Object.entries(f.props).forEach(([k, v]) => { if (k !== 'text' || f.props.tag !== 'Text') props.set(k, clone(v)) })
  if (f.props.tag === 'Text' && f.props.text) text.insert(0, String(f.props.text))
  e.set('props', props); e.set('text', text); e.set('placement', { parent: f.parent, rank }); e.set('deleted', false)
  return e
}
function spliceText(text: Y.Text, next: string) {
  const old = text.toString()
  let start = 0, end = 0
  while (start < old.length && start < next.length && old[start] === next[start]) start++
  while (end < old.length - start && end < next.length - start && old[old.length - 1 - end] === next[next.length - 1 - end]) end++
  if (old.length - start - end) text.delete(start, old.length - start - end)
  if (next.length - start - end) text.insert(start, next.slice(start, next.length - end))
}
function between(left: number, right: number) {
  const value = !Number.isFinite(left) ? Number.isFinite(right) ? right - 1 : 0 : !Number.isFinite(right) ? left + 1 : left + (right - left) / 2
  if (!Number.isFinite(value) || value <= left || value >= right) throw new Error('ORDER_PRECISION_EXHAUSTED')
  return value
}
function findNode(root: SceneNode, id: string): SceneNode | undefined {
  if (root.id === id) return root
  for (const child of root.children || []) { const node = findNode(child, id); if (node) return node }
}
function checkEnvelope(c: CanvasCheckpoint) {
  if (!c || c.codec !== CANVAS_CODEC || c.schemaVersion !== 1 || typeof c.epochId !== 'string' || !c.epochId || !(c.update instanceof Uint8Array)) throw new Error('UNSUPPORTED_CODEC_SCHEMA')
  if (c.update.byteLength > 16 * 1024 * 1024) throw new Error('UPDATE_TOO_LARGE')
}
function validateDoc(doc: Y.Doc, epochId: string) {
  if (doc.store.pendingStructs || doc.store.pendingDs) throw new Error('UNRESOLVED_UPDATE_DEPENDENCIES')
  // Empty Yjs maps are not encoded. The canonical empty elements root may be absent in a valid blank checkpoint.
  if (!doc.share.has('meta') || [...doc.share.keys()].some(key => !['meta', 'elements'].includes(key))) throw new Error('UNKNOWN_SHARED_ROOT')
  const meta = doc.getMap('meta')
  if (meta._start || meta.size !== 3 || [...meta.keys()].some(k => !['epochId', 'schemaVersion', 'name'].includes(k)) || typeof meta.get('name') !== 'string' || meta.get('epochId') !== epochId || meta.get('schemaVersion') !== 1) throw new Error('INVALID_MODEL_METADATA')
  const elements = doc.getMap('elements')
  if (elements._start) throw new Error('INVALID_ELEMENTS_ROOT')
  if (elements.size > 10000) throw new Error('TOO_MANY_ELEMENTS')
  elements.forEach((value, id) => {
    if (!id || forbidden.has(id) || !(value instanceof Y.Map)) throw new Error('INVALID_ELEMENT')
    if (value._start || value.size !== 4 || [...value.keys()].some(k => !['props', 'text', 'placement', 'deleted'].includes(k))) throw new Error('INVALID_ELEMENT_FIELDS')
    const props = value.get('props'), text = value.get('text'), placement = value.get('placement') as Placement
    if (!(props instanceof Y.Map) || !(text instanceof Y.Text) || !tags.has(String(props.get('tag'))) || typeof value.get('deleted') !== 'boolean') throw new Error('INVALID_ELEMENT_SCHEMA')
    if (!placement || Object.getPrototypeOf(placement) !== Object.prototype || Object.keys(placement).length !== 2 || !Number.isFinite(placement.rank) || placement.parent !== null && (typeof placement.parent !== 'string' || !placement.parent)) throw new Error('INVALID_PLACEMENT')
    if (props._start) throw new Error('INVALID_PROPERTIES')
    props.forEach((v, k) => validateProperty(k, v))
    if (text.toDelta().some((part: { insert?: unknown; attributes?: unknown }) => typeof part.insert !== 'string' || part.attributes) || props.get('tag') !== 'Text' && text.length) throw new Error('INVALID_PLAIN_TEXT')
    const data = props.get('data') as Record<string, unknown> | undefined
    if (data?.roughMode === true && !equal(props.get('fill'), data.roughOriginalFill ?? null)) throw new Error('NON_CANONICAL_ROUGH_FILL')
    if (props.get('tag') === 'Image' && (typeof data?.resourcePath !== 'string' || !data.resourcePath)) throw new Error('IMAGE_REQUIRES_STABLE_RESOURCE_PATH')
    if (data?.resourcePath && (props.get('url') !== data.resourcePath || data.sourceUrl !== data.resourcePath)) throw new Error('RESOLVED_RESOURCE_URL')
  })
  elements.forEach((value, id) => {
    const seen = new Set([id])
    let parent = (value as Y.Map<unknown>).get('placement') as Placement
    while (parent.parent && elements.has(parent.parent) && !seen.has(parent.parent)) {
      if (seen.size > 64) throw new Error('MODEL_DEPTH')
      seen.add(parent.parent)
      const ancestor = elements.get(parent.parent) as Y.Map<unknown>
      if (!['Group', 'Frame'].includes(String((ancestor.get('props') as Y.Map<unknown>).get('tag')))) throw new Error('UNSUPPORTED_CHILDREN')
      parent = ancestor.get('placement') as Placement
    }
  })
}

function validateProperty(key: string, value: unknown) {
  if (!propertyKeys.has(key)) throw new Error('UNKNOWN_ELEMENT_PROPERTY:' + key)
  assertJson(value)
  validateResourceLocators(value, key)
  if (['x', 'y', 'width', 'height', 'scaleX', 'scaleY', 'rotation', 'skewX', 'skewY', 'opacity', 'fontSize', 'zIndex'].includes(key) && typeof value !== 'number') throw new Error('INVALID_PROPERTY_TYPE:' + key)
  if (['visible', 'locked', 'editable', 'hittable', 'hitSelf', 'hitChildren', 'resizeFontSize', 'lockRatio'].includes(key) && typeof value !== 'boolean') throw new Error('INVALID_PROPERTY_TYPE:' + key)
  if (['tag', 'name', 'url'].includes(key) && typeof value !== 'string') throw new Error('INVALID_PROPERTY_TYPE:' + key)
}

// Render caches and authenticated URLs belong to the view, not even tombstoned model properties.
// This is deliberately not an authorization/URL allowlist: the host still validates its resource IDs.
function validateResourceLocators(value: unknown, key: string) {
  if (typeof value === 'string' && ['url', 'sourceUrl', 'resourcePath', 'fill', 'stroke', 'roughOriginalFill'].includes(key)) {
    const uri = value.trim()
    if (/^(?:data|blob|javascript|file):/i.test(uri) || /^https?:\/\/[^\s]*[?#]/i.test(uri)) throw new Error('UNSAFE_RESOURCE_URL')
  } else if (Array.isArray(value)) value.forEach(item => validateResourceLocators(item, key))
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => validateResourceLocators(v, k))
}

/** Same-user sessions are intentionally retained. Host authenticates identity before passing it here. */
export function visibleRemoteSelections(sessions: SessionSelection[], selfSessionId: string, readOnly = false) {
  if (readOnly) return []
  return sessions.filter(s => s.sessionId !== selfSessionId && /^#[\da-f]{6}$/i.test(s.color) && s.elementIds.length <= 100)
}

/** Explicit epoch replacement. Host must settle or export old pending work first. Old model stays usable for recovery. */
export function switchCanvasEpoch(previous: CanvasModel, checkpoint: CanvasCheckpoint, pendingUpdates: number) {
  const revision = previous.revision
  previous.flush()
  if (revision !== previous.revision) throw new Error('PENDING_UPDATES_REQUIRE_RECOVERY')
  if (!Number.isInteger(pendingUpdates) || pendingUpdates !== 0) throw new Error('PENDING_UPDATES_REQUIRE_RECOVERY')
  if (previous.epochId === checkpoint.epochId) throw new Error('NEW_EPOCH_REQUIRED')
  return CanvasModel.restore(checkpoint)
}

/** Authority-only history rollback: fork ORIGINAL CRDT bytes into an explicit new epoch, never initialize from scene JSON. */
export function createHistoryRestore(checkpoint: CanvasCheckpoint, newEpochId: string): CanvasCheckpoint {
  const historical = CanvasModel.restore(checkpoint)
  try {
    if (typeof newEpochId !== 'string' || !newEpochId || newEpochId === checkpoint.epochId) throw new Error('NEW_EPOCH_REQUIRED')
    const doc = new Y.Doc()
    try {
      Y.applyUpdate(doc, historical.checkpoint().update)
      doc.getMap('meta').set('epochId', newEpochId)
      validateDoc(doc, newEpochId)
      return { codec: CANVAS_CODEC, schemaVersion: 1, epochId: newEpochId, update: Y.encodeStateAsUpdate(doc) }
    } finally { doc.destroy() }
  } finally { historical.dispose() }
}
