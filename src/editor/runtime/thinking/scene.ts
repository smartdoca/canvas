import { richLayout } from './richText'
import { insertTableAxis, layoutTable } from './table'
import { Frame, Group, Path, Text, type App, type IUI, type IUIJSONData } from 'leafer-ui'
import { createElementId } from '../../../model'

export type MindLayout = 'right' | 'left' | 'balanced' | 'down'
export type RouteMode = 'elbow' | 'straight' | 'curve'
export type AnchorPoint = { x: number; y: number }
// Keep the four midpoint indices stable for legacy template routes.
export const connectionPorts: AnchorPoint[] = [
  { x: .5, y: 0 }, { x: 1, y: .5 }, { x: .5, y: 1 }, { x: 0, y: .5 },
  ...[.25, .75].flatMap(at => [{ x: at, y: 0 }, { x: 1, y: at }, { x: at, y: 1 }, { x: 0, y: at }]),
]
export type DiagramShape = 'rounded' | 'rect' | 'ellipse' | 'diamond' | 'parallelogram' | 'cylinder' | 'triangle' | 'hexagon' | 'cloud' | 'document'
export const branchColors = ['#3370ff', '#36a872', '#e5a329', '#9254de', '#e76560', '#28a6a6']
export const branchFills = ['#eaf1ff', '#e5f6ee', '#fff4d9', '#f2eafb', '#ffeceb', '#e3f5f5']
const id = createElementId
const font = 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif'
export const kind = (item?: IUI | null) => String(item?.data?.kind || '')
export const isConnector = (item?: IUI | null) => ['connector', 'template-edge'].includes(kind(item))
export const connectorPagePoint = (app: App, line: IUI, point: AnchorPoint): AnchorPoint => line.parent ? app.tree.getInnerPoint(line.parent.getWorldPoint(point)) : point
export const connectorLocalPoint = (app: App, line: IUI, point: AnchorPoint): AnchorPoint => line.parent ? line.parent.getInnerPoint(app.tree.getWorldPoint(point)) : point
function connectorPorts(data: Record<string, unknown>) {
  const template = data.kind === 'template-edge'
  return {
    source: data.sourceAnchor as AnchorPoint | undefined || (template && data.sourceId ? connectionPorts[1] : undefined),
    target: data.targetAnchor as AnchorPoint | undefined || (template && data.targetId ? connectionPorts[3] : undefined),
  }
}
/** Canonicalize a manual route after a gesture, keeping its bound endpoints. */
export function simplifyConnectorPoints(input: AnchorPoint[], tolerance = .000001): AnchorPoint[] {
  let points = input.filter((point, index) => !index || Math.hypot(point.x - input[index - 1].x, point.y - input[index - 1].y) > tolerance).map(point => ({ ...point }))
  let changed = true
  while (changed && points.length > 2) {
    changed = false
    for (let index = 1; index < points.length - 1; index++) {
      const a = points[index - 1], b = points[index], c = points[index + 1], length = Math.hypot(c.x - a.x, c.y - a.y)
      if (length <= tolerance || Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) <= tolerance * length) { points.splice(index, 1); changed = true; break }
    }
    if (changed) continue
    for (let first = 0; first < points.length - 3 && !changed; first++) for (let last = first + 2; last < points.length - 1; last++) {
      const a = points[first], b = points[first + 1], c = points[last], d = points[last + 1], dx = b.x - a.x, dy = b.y - a.y, ex = d.x - c.x, ey = d.y - c.y, cross = dx * ey - dy * ex
      if (Math.abs(cross) < .001) continue
      const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / cross, u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / cross
      if (t < 0 || t > 1 || u < 0 || u > 1) continue
      points = [...points.slice(0, first + 1), { x: a.x + t * dx, y: a.y + t * dy }, ...points.slice(last + 1)]; changed = true; break
    }
  }
  return points
}
/** Elbow routes stay orthogonal after vertex edits, rebinding and endpoint moves. */
export function orthogonalConnectorPoints(input: AnchorPoint[], data: Record<string, unknown> = {}): AnchorPoint[] {
  if (input.length < 2) return input
  if (Math.hypot(input[0].x - input.at(-1)!.x, input[0].y - input.at(-1)!.y) < .000001) return [{ ...input[0] }, { ...input.at(-1)! }]
  const { source, target } = connectorPorts(data)
  const fromPoint = input[0], toPoint = input.at(-1)!
  const horizontalStart = source ? source.x === 0 || source.x === 1 : data.axis === 'x' || data.axis !== 'y' && Math.abs(toPoint.x - fromPoint.x) >= Math.abs(toPoint.y - fromPoint.y)
  const horizontalEnd = target ? target.x === 0 || target.x === 1 : horizontalStart
  const points: AnchorPoint[] = [{ ...input[0] }]
  for (let index = 1; index < input.length; index++) {
    const before = points.at(-1)!, point = input[index]
    if (Math.abs(before.x - point.x) > .000001 && Math.abs(before.y - point.y) > .000001) {
      const prior = points.at(-2), horizontal = index === 1 ? horizontalStart : index === input.length - 1 ? !horizontalEnd : prior ? Math.abs(before.x - prior.x) < .000001 : horizontalStart
      points.push(horizontal ? { x: point.x, y: before.y } : { x: before.x, y: point.y })
    }
    points.push({ ...point })
  }
  // Repair an endpoint axis even when the previous point happened to align on
  // the other axis; reuse the existing route's transverse coordinate.
  const enforceEnd = (list: AnchorPoint[], horizontal: boolean) => {
    const end = list.at(-1)!, before = list.at(-2)!
    if (horizontal ? Math.abs(end.y - before.y) < .000001 : Math.abs(end.x - before.x) < .000001) return list
    const sign = horizontal ? end.x >= before.x ? 1 : -1 : end.y >= before.y ? 1 : -1
    const coordinate = (horizontal ? end.x : end.y) - sign * Math.min(32, Math.max(16, Math.hypot(end.x - before.x, end.y - before.y) / 3))
    return [...list.slice(0, -1), horizontal ? { x: coordinate, y: before.y } : { x: before.x, y: coordinate }, horizontal ? { x: coordinate, y: end.y } : { x: end.x, y: coordinate }, end]
  }
  let result = simplifyConnectorPoints(enforceEnd(enforceEnd(points, horizontalEnd).reverse(), horizontalStart).reverse())
  const outward = (anchor: AnchorPoint, horizontal: boolean) => (horizontal ? anchor.x : anchor.y) === 0 ? -1 : 1
  const validStart = (list: AnchorPoint[], anchor: AnchorPoint | undefined, horizontal: boolean) => {
    if (!anchor) return true
    if (list.length < 2) return false
    const a = list[0], b = list[1]
    return horizontal ? Math.abs(a.y - b.y) < .000001 && (b.x - a.x) * outward(anchor, true) > .000001 : Math.abs(a.x - b.x) < .000001 && (b.y - a.y) * outward(anchor, false) > .000001
  }
  const clampStart = (list: AnchorPoint[], anchor: AnchorPoint | undefined, horizontal: boolean) => {
    if (!anchor || validStart(list, anchor, horizontal) || list.length < 4) return list
    const next = list.map(point => ({ ...point })), axis = horizontal ? 'x' : 'y', old = next[1][axis]
    // Move the adjacent backbone as a pair; never introduce a short reverse
    // segment through the bound shape just to satisfy the end tangent.
    next[1][axis] = next[0][axis] + outward(anchor, horizontal) * 32
    if (Math.abs(next[2][axis] - old) < .000001) next[2][axis] = next[1][axis]
    return next
  }
  result = simplifyConnectorPoints(clampStart(clampStart(result, source, horizontalStart).reverse(), target, horizontalEnd).reverse())
  if (validStart(result, source, horizontalStart) && validStart([...result].reverse(), target, horizontalEnd)) return result
  // Opposing ports can make a single shared backbone impossible (for example,
  // a right port whose target left port is behind it). Use two separate stubs.
  const from = input[0], to = input.at(-1)!, sourceSign = source ? outward(source, horizontalStart) : Math.sign(horizontalStart ? to.x - from.x : to.y - from.y) || 1, targetSign = target ? outward(target, horizontalEnd) : -(Math.sign(horizontalEnd ? to.x - from.x : to.y - from.y) || 1)
  const start = horizontalStart ? { x: from.x + sourceSign * 32, y: from.y } : { x: from.x, y: from.y + sourceSign * 32 }
  const end = horizontalEnd ? { x: to.x + targetSign * 32, y: to.y } : { x: to.x, y: to.y + targetSign * 32 }
  if (horizontalStart && horizontalEnd) {
    const y = Math.abs(from.y - to.y) < .000001 ? from.y + 64 : (from.y + to.y) / 2
    return simplifyConnectorPoints([from, start, { x: start.x, y }, { x: end.x, y }, end, to])
  }
  if (!horizontalStart && !horizontalEnd) {
    const x = Math.abs(from.x - to.x) < .000001 ? from.x + 64 : (from.x + to.x) / 2
    return simplifyConnectorPoints([from, start, { x, y: start.y }, { x, y: end.y }, end, to])
  }
  if (horizontalStart) {
    let y = end.y + targetSign * 32
    if (Math.abs(y - from.y) < .000001) y += targetSign * 32
    return simplifyConnectorPoints([from, start, { x: start.x, y }, { x: to.x, y }, to])
  }
  let x = end.x + targetSign * 32
  if (Math.abs(x - from.x) < .000001) x += targetSign * 32
  return simplifyConnectorPoints([from, start, { x, y: start.y }, { x, y: to.y }, to])
}
/** Move the segment across its normal, preserving the two endpoint positions. */
export function moveConnectorSegment(input: AnchorPoint[], index: number, delta: AnchorPoint, data: Record<string, unknown>): AnchorPoint[] {
  const points = input.map(point => ({ ...point }))
  const last = index === points.length - 2 && Boolean(data.targetId), first = index === 0 && Boolean(data.sourceId)
  if (last) { points.reverse(); index = 0 }
  const a = points[index], b = points[index + 1], horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y), normal = horizontal ? 'y' : 'x', along = horizontal ? 'x' : 'y', offset = delta[normal]
  if (first || last) {
    // A short terminal stub protects the port's tangent. Further drags move
    // the parallel body instead of creating another stub on every gesture.
    if (Math.abs(b[along] - a[along]) <= 32 && points.length >= 6 && Math.abs(points[2][normal] - points[3][normal]) < .000001) {
      points[2][normal] += offset; points[3][normal] += offset
    } else if (Math.abs(offset) > .000001) {
      const stub = { ...a, [along]: a[along] + Math.sign(b[along] - a[along]) * Math.min(16, Math.abs(b[along] - a[along]) / 2) }
      points.splice(1, 1, stub, { ...stub, [normal]: stub[normal] + offset }, { ...b, [normal]: b[normal] + offset })
    }
  } else {
    let coordinate = a[normal] + offset
    const clampPort = (end: AnchorPoint, before: AnchorPoint) => {
      const sign = Math.sign(before[normal] - end[normal])
      if (sign) coordinate = sign > 0 ? Math.max(coordinate, end[normal] + 16) : Math.min(coordinate, end[normal] - 16)
    }
    if (index === 1 && data.sourceId) clampPort(points[0], points[1])
    if (index === points.length - 3 && data.targetId) clampPort(points.at(-1)!, points.at(-2)!)
    points[index][normal] = coordinate; points[index + 1][normal] = coordinate
    if (index + 1 === points.length - 1) points.push({ ...input.at(-1)! })
    if (index === 0) points.unshift({ ...input[0] })
  }
  if (last) points.reverse()
  return orthogonalConnectorPoints(points, data)
}
export function ancestor(item: IUI | undefined, value: string): IUI | undefined {
  for (let node = item; node; node = node.parent as IUI | undefined) if (kind(node) === value || node.name === value) return node
}
export const mindNode = (item?: IUI) => ancestor(item, 'mind-node') as Frame | undefined
export const mindMap = (item?: IUI) => ancestor(item, 'mindmap') as Group | undefined
export function allItems(app: App): IUI[] {
  const items: IUI[] = []
  const visit = (children: IUI[]) => children.forEach(item => { if (item.skipJSON) return; items.push(item); if (item.children) visit(item.children) })
  visit(app.tree.children)
  return items
}
export const labelOf = (item: IUI) => item.children?.find(child => child instanceof Text) as Text | undefined
export function mindNodes(group: Group) { return group.children.filter(child => kind(child) === 'mind-node') as Frame[] }

export function makeNode(text: string, x: number, y: number, options: { root?: boolean; parentId?: string; colorIndex?: number } = {}) {
  const colorIndex = options.colorIndex ?? 0
  const frame = new Frame({ id: id(), name: 'mind-node', x, y, width: options.root ? 160 : 144, height: options.root ? 48 : 42,
    fill: options.root ? '#3370ff' : branchFills[colorIndex % branchFills.length], stroke: options.root ? '#3370ff' : branchColors[colorIndex % branchColors.length], strokeWidth: options.root ? 0 : 1,
    cornerRadius: 5, editable: true, editConfig: { resizeable: false, rotateable: false }, hitChildren: false, data: { kind: 'mind-node', parentId: options.parentId || '', root: Boolean(options.root), colorIndex, collapsed: false } })
  frame.add(new Text({ id: id(), name: 'text', text, x: 14, y: 8, width: Number(frame.width) - 28, height: Number(frame.height) - 16, fill: options.root ? '#ffffff' : '#1f2329', fontSize: options.root ? 18 : 16, fontWeight: options.root ? 600 : 400, fontFamily: font, textAlign: 'center', verticalAlign: 'middle', lineHeight: { type: 'percent', value: 1.4 }, editable: true, data: { kind: 'node-label' } }))
  return frame
}

export function makeMindMap(x: number, y: number, title: string, branch: string, layout: MindLayout = 'right') {
  const group = new Group({ id: id(), name: 'mindmap', x, y, editable: false, hitSelf: false, data: { kind: 'mindmap', layout, originX: 0, originY: 0 } })
  const root = makeNode(title, 0, 0, { root: true })
  group.add(root)
  for (let index = 0; index < 3; index++) group.add(makeNode(`${branch} ${index + 1}`, 0, 0, { parentId: root.id, colorIndex: index }))
  layoutMindMap(group)
  return group
}

const positioning = new WeakSet<Group>()
const mindPositions = new WeakMap<Frame, { x: number; y: number }>()
export const isMindPositioning = (group: Group) => positioning.has(group)
export function rememberMindPositions(group: Group) { mindNodes(group).forEach(node => mindPositions.set(node, { x: Number(node.x), y: Number(node.y) })) }
export function mindDirectionOf(node: Frame): 'left' | 'right' | 'up' | 'down' {
  const group = mindMap(node), nodes = group ? mindNodes(group) : [], root = nodes.find(item => item.data?.root)
  let current: Frame | undefined = node, first = node
  const visited = new Set<Frame>()
  while (current && !current.data?.root && !visited.has(current)) {
    visited.add(current); first = current
    const direction = current.data?.mindDirection
    if (['left', 'right', 'up', 'down'].includes(direction)) return direction
    current = nodes.find(item => item.id === current!.data?.parentId)
  }
  const layout = group?.data?.layout
  return layout === 'left' || layout === 'down' ? layout : layout === 'balanced' && nodes.filter(item => item.data?.parentId === root?.id).indexOf(first) % 2 === 1 ? 'left' : 'right'
}
export function syncMovedMindBranch(node: Frame) {
  const group = mindMap(node)
  if (!group || positioning.has(group)) return
  const before = mindPositions.get(node)
  if (!before) { rememberMindPositions(group); return }
  const dx = Number(node.x) - before.x, dy = Number(node.y) - before.y
  if (!dx && !dy) return
  positioning.add(group)
  try {
    const nodes = mindNodes(group), visited = new Set<string>()
    const parent = nodes.find(item => item.id === node.data?.parentId)
    if (parent && !node.data?.root) {
      const x = Number(node.x) + Number(node.width) / 2 - Number(parent.x) - Number(parent.width) / 2, y = Number(node.y) + Number(node.height) / 2 - Number(parent.y) - Number(parent.height) / 2
      const horizontal = Math.abs(x) / (Number(parent.width) / 2 + Number(node.width) / 2 + 72), vertical = Math.abs(y) / (Number(parent.height) / 2 + Number(node.height) / 2 + 70)
      node.data = { ...node.data, mindDirection: horizontal >= vertical ? x < 0 ? 'left' : 'right' : y < 0 ? 'up' : 'down', mindOffset: { x: Number(node.x) - Number(parent.x), y: Number(node.y) - Number(parent.y) } }
    }
    const move = (parent: Frame) => { if (visited.has(parent.id!)) return; visited.add(parent.id!); nodes.filter(child => child.data?.parentId === parent.id).forEach(child => { child.set({ x: Number(child.x) + dx, y: Number(child.y) + dy }); move(child) }) }
    move(node); rememberMindPositions(group); refreshMindEdges(group)
  } finally { positioning.delete(group) }
}

export function layoutMindMap(group: Group) {
  const nodes = mindNodes(group)
  const root = nodes.find(node => node.data?.root)
  if (!root) return
  positioning.add(group)
  try {
  const children = (parent: Frame) => nodes.filter(node => node.data?.parentId === parent.id)
  nodes.forEach(node => {
    const label = labelOf(node)
    if (!label) return
    const length = Math.max(...String(label.text || '').split('\n').map(line => [...line].reduce((sum, c) => sum + (c.charCodeAt(0) > 255 ? 1 : 0.58), 0)))
    const width = Math.min(260, Math.max(node.data?.root ? 160 : 128, length * Number(label.fontSize || 16) + 32))
    label.width = width - 28
    const height = Math.max(node.data?.root ? 48 : 42, (richLayout(label, true)?.height || Number(label.fontSize || 16) * 1.4) + 16)
    node.set({ width, height })
    label.set({ width: width - 28, height: height - 16 })
  })
  const markVisibility = (node: Frame, hidden: boolean) => {
    node.visible = !hidden
    children(node).forEach(child => markVisibility(child, hidden || Boolean(node.data?.collapsed)))
  }
  markVisibility(root, false)
  const span = (node: Frame, axis: 'width' | 'height'): number => {
    const visible = children(node).filter(child => child.visible !== false)
    return visible.length ? Math.max(Number(node[axis]), visible.reduce((sum, child) => sum + span(child, axis), 0) + (visible.length - 1) * (axis === 'height' ? 22 : 28)) : Number(node[axis])
  }
  const position = (child: Frame, parent: Frame, x: number, y: number) => {
    const offset = child.data?.mindOffset as AnchorPoint | undefined
    child.set(offset && Number.isFinite(offset.x) && Number.isFinite(offset.y) ? { x: Number(parent.x) + offset.x, y: Number(parent.y) + offset.y } : { x, y })
  }
  const placeChildren = (parent: Frame) => {
    const visible = children(parent).filter(child => child.visible !== false)
    for (const direction of ['right', 'left', 'down', 'up'] as const) {
      const list = visible.filter(child => mindDirectionOf(child) === direction), vertical = direction === 'down' || direction === 'up', axis = vertical ? 'width' : 'height', gap = vertical ? 28 : 22
      let cursor = Number(parent[vertical ? 'x' : 'y']) + Number(parent[axis]) / 2 - (list.reduce((sum, child) => sum + span(child, axis), 0) + Math.max(0, list.length - 1) * gap) / 2
      list.forEach(child => {
        const size = span(child, axis)
        const x = vertical ? cursor + size / 2 - Number(child.width) / 2 : Number(parent.x) + (direction === 'right' ? Number(parent.width) + 72 : -Number(child.width) - 72)
        const y = vertical ? Number(parent.y) + (direction === 'down' ? Number(parent.height) + 70 : -Number(child.height) - 70) : cursor + size / 2 - Number(child.height) / 2
        position(child, parent, x, y); cursor += size + gap; placeChildren(child)
      })
    }
  }
  placeChildren(root)
  group.data = { ...group.data, originX: root.x, originY: root.y }
  refreshMindEdges(group)
  rememberMindPositions(group)
  } finally { positioning.delete(group) }
}

export function refreshMindEdges(group: Group) {
  const nodes = mindNodes(group)
  const existing = new Map(group.children.filter(child => kind(child) === 'mind-edge').map(edge => [String(edge.data?.targetId), edge]))
  nodes.filter(node => !node.data?.root).forEach(node => {
    const parent = nodes.find(item => item.id === node.data?.parentId)
    if (!parent) return
    let edge = existing.get(node.id!) as Path | undefined
    if (!edge) { edge = new Path({ id: id(), name: 'mind-edge', strokeWidth: 2, editable: false, hittable: false, data: { kind: 'mind-edge', sourceId: parent.id, targetId: node.id } }); group.addAt(edge, 0) }
    const direction = mindDirectionOf(node), down = direction === 'down' || direction === 'up', right = direction === 'right'
    const sx = Number(parent.x) + (down ? Number(parent.width) / 2 : right ? Number(parent.width) : 0)
    const sy = Number(parent.y) + (down ? direction === 'down' ? Number(parent.height) : 0 : Number(parent.height) / 2)
    const tx = Number(node.x) + (down ? Number(node.width) / 2 : right ? 0 : Number(node.width))
    const ty = Number(node.y) + (down ? direction === 'down' ? 0 : Number(node.height) : Number(node.height) / 2)
    edge.set({ path: down ? `M${sx} ${sy}C${sx} ${(sy + ty) / 2} ${tx} ${(sy + ty) / 2} ${tx} ${ty}` : `M${sx} ${sy}C${(sx + tx) / 2} ${sy} ${(sx + tx) / 2} ${ty} ${tx} ${ty}`, stroke: String(node.stroke || branchColors[Number(node.data?.colorIndex || 0) % 6]), visible: node.visible !== false && parent.visible !== false })
    existing.delete(node.id!)
  })
  existing.forEach(edge => edge.remove())
}

export function addMindNode(node: Frame, relation: 'child' | 'sibling' | 'parent', text: string): Frame | undefined {
  const group = mindMap(node)
  if (!group) return
  const siblings = mindNodes(group)
  const colorIndex = node.data?.root ? siblings.filter(item => item.data?.parentId === node.id).length % 6 : Number(node.data?.colorIndex || 0)
  if (relation === 'parent' && node.data?.root) return
  const parentId = relation === 'sibling' && !node.data?.root || relation === 'parent' ? String(node.data?.parentId || '') : node.id
  const next = makeNode(text, 0, 0, { parentId, colorIndex })
  if (relation === 'sibling' && !node.data?.root) next.data = { ...next.data, mindDirection: mindDirectionOf(node) }
  if (relation === 'parent') {
    next.data = { ...next.data, mindDirection: mindDirectionOf(node), ...(node.data?.mindOffset ? { mindOffset: node.data.mindOffset } : {}) }
    const data: Record<string, unknown> = { ...node.data, parentId: next.id }; delete data.mindOffset; delete data.mindDirection; node.data = data
  }
  if (relation === 'child') node.data = { ...node.data, collapsed: false }
  group.add(next)
  if (group.data?.theme && group.data.theme in themes) applyNodeTheme(next, group.data.theme as MindTheme)
  layoutMindMap(group)
  return next
}
export function removeMindNode(node: Frame) {
  const group = mindMap(node)
  if (!group) return
  if (node.data?.root) { group.remove(); return }
  const remove = (target: Frame) => { mindNodes(group).filter(child => child.data?.parentId === target.id).forEach(remove); target.remove() }
  remove(node)
  layoutMindMap(group)
}

export function mindDescendants(node: Frame): Frame[] {
  const group = mindMap(node)
  if (!group) return []
  const nodes = mindNodes(group), result: Frame[] = [], seen = new Set<string>([node.id!])
  const visit = (id: string) => nodes.filter(child => child.data?.parentId === id && !seen.has(child.id!)).forEach(child => { seen.add(child.id!); result.push(child); visit(child.id!) })
  visit(node.id!); return result
}

export function shapePath(shape: DiagramShape, width: number, height: number) {
  const w = width, h = height
  if (shape === 'diamond') return `M${w / 2} 0L${w} ${h / 2}L${w / 2} ${h}L0 ${h / 2}Z`
  if (shape === 'parallelogram') return `M${w * .18} 0H${w}L${w * .82} ${h}H0Z`
  if (shape === 'triangle') return `M${w / 2} 0L${w} ${h}H0Z`
  if (shape === 'hexagon') return `M${w * .2} 0H${w * .8}L${w} ${h / 2}L${w * .8} ${h}H${w * .2}L0 ${h / 2}Z`
  // Keep the rim's winding aligned with the body so its fill does not cut a hole.
  if (shape === 'cylinder') return `M0 ${h * .18}C0 ${-h * .06} ${w} ${-h * .06} ${w} ${h * .18}V${h * .82}C${w} ${h * 1.06} 0 ${h * 1.06} 0 ${h * .82}ZM${w} ${h * .18}C${w} ${h * .42} 0 ${h * .42} 0 ${h * .18}`
  if (shape === 'document') return `M0 0H${w}V${h * .84}C${w * .6} ${h * .62} ${w * .4} ${h * 1.08} 0 ${h * .84}Z`
  if (shape === 'cloud') return `M${w * .2} ${h * .8}C${-w * .1} ${h * .85} ${-w * .02} ${h * .35} ${w * .2} ${h * .4}C${w * .05} ${-h * .1} ${w * .6} ${-h * .05} ${w * .64} ${h * .25}C${w * .97} ${h * .05} ${w * 1.12} ${h * .65} ${w * .85} ${h * .72}C${w * .8} ${h * 1.1} ${w * .38} ${h} ${w * .36} ${h * .8}Z`
  return ''
}

export function makeDiagram(shape: DiagramShape, x: number, y: number, text = '', width = 160, height = 80, fill = '#ffffff', stroke = '#646a73') {
  const frame = new Frame({ id: id(), name: 'diagram-node', x, y, width, height, fill: 'transparent', editable: true, hitChildren: false, data: { kind: 'diagram-node', shape } })
  const path = shapePath(shape, width, height)
  frame.add({ id: id(), tag: path ? 'Path' : shape === 'ellipse' ? 'Ellipse' : 'Rect', name: 'diagram-body', x: 0, y: 0, width, height, path: path || undefined, fill, stroke, strokeWidth: 1.5, cornerRadius: shape === 'rounded' ? 8 : 0, editable: false, data: { kind: 'diagram-body' } } as IUIJSONData)
  frame.add(new Text({ id: id(), name: 'text', text, x: 14, y: 12, width: width - 28, height: height - 24, fill: '#1f2329', fontFamily: font, fontSize: 16, textAlign: 'center', verticalAlign: 'middle', lineHeight: { type: 'percent', value: 1.4 }, editable: true, data: { kind: 'node-label' } }))
  return frame
}

/** The wrapper, visible outline and text box share one diagram size. */
export function syncDiagramGeometry(node: IUI) {
  const width = Number(node.width), height = Number(node.height)
  const body = node.children?.find(child => kind(child) === 'diagram-body' || child.name === 'diagram-body')
  const path = shapePath(node.data?.shape as DiagramShape, width, height)
  if (body?.path && !path) {
    // Imported outlines can predate shape names; keep their actual path.
    body.scaleResize(width / Math.max(.001, Number(body.width)), height / Math.max(.001, Number(body.height)))
    body.set({ width, height })
  } else body?.set({ width, height, path: path || undefined })
  labelOf(node)?.set({ width: Math.max(1, width - 28), height: Math.max(1, height - 24) })
}

export function makeTable(x: number, y: number, rows = 3, columns = 3, labels: string[] = []) {
  const group = new Group({ id: id(), name: 'board-table', x, y, editable: true, hitSelf: false, data: { kind: 'table', rows, columns } })
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const cell = new Frame({ id: id(), name: 'table-cell', x: column * 140, y: row * 46, width: 140, height: 46, fill: row === 0 ? '#eaf1ff' : '#ffffff', stroke: '#cfd3d8', strokeWidth: 1, editable: false, hitChildren: false, data: { kind: 'table-cell', row, column } })
    cell.add(new Text({ id: id(), name: 'text', text: labels[row * columns + column] || '', x: 12, y: 10, width: 116, height: 26, fill: '#1f2329', fontFamily: font, fontSize: 14, fontWeight: row === 0 ? 600 : 400, verticalAlign: 'top', editable: true, data: { kind: 'cell-label' } }))
    group.add(cell)
  }
  layoutTable(group)
  return group
}

export function extendTable(group: Group, axis: 'row' | 'column') {
  insertTableAxis(group, axis, Number(group.data?.[axis === 'row' ? 'rows' : 'columns'] || 1))
}

export function endpoint(item: IUI, toward: { x: number; y: number }, anchor?: AnchorPoint) {
  const bounds = item.getBounds('box', 'page')
  if (anchor) {
    let x = anchor.x, y = anchor.y
    const dx = x - .5, dy = y - .5, shape = item.data?.shape || (item.name === 'ellipse' ? 'ellipse' : undefined)
    // Anchors describe a side and direction; curved/diagonal outlines must not
    // expose ports at the corners of their rectangular bounding box.
    const distance = shape === 'ellipse' ? Math.hypot(dx, dy) : shape === 'diamond' ? Math.abs(dx) + Math.abs(dy) : 0
    if (distance) { x = .5 + dx / distance / 2; y = .5 + dy / distance / 2 }
    return item.getPagePoint(item.getWorldPoint({ x: Number(item.width || 1) * x, y: Number(item.height || 1) * y }))
  }
  const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2
  const dx = toward.x - cx, dy = toward.y - cy
  const rx = Math.max(bounds.width / 2, 1), ry = Math.max(bounds.height / 2, 1), shape = item.data?.shape
  const scale = 1 / Math.max(.0001, shape === 'ellipse' ? Math.hypot(dx / rx, dy / ry) : shape === 'diamond' ? Math.abs(dx) / rx + Math.abs(dy) / ry : Math.max(Math.abs(dx) / rx, Math.abs(dy) / ry))
  return { x: cx + dx * scale, y: cy + dy * scale }
}
export function nearestPort(item: IUI, point: AnchorPoint) {
  return connectionPorts.reduce((best, port) => {
    const a = endpoint(item, point, port), b = endpoint(item, point, best)
    return Math.hypot(a.x - point.x, a.y - point.y) < Math.hypot(b.x - point.x, b.y - point.y) ? port : best
  })
}
export function connectableNode(item?: IUI): IUI | undefined {
  const structured = mindNode(item) || ancestor(item, 'diagram-node') || ancestor(item, 'table') || ancestor(item, 'note') || ancestor(item, 'card') || ancestor(item, 'attachment')
  if (structured) return structured
  for (let node = item; node; node = node.parent as IUI | undefined) if (node.data?.canvasExtension || ['rect', 'ellipse', 'note', 'card', 'frame', 'image'].includes(node.name || '')) return node
}
export function pickConnectable(app: App, point: { x: number; y: number }) {
  const candidates = [...new Set(allItems(app).map(connectableNode).filter((node): node is IUI => Boolean(node)))].reverse()
  return candidates.find(item => {
    const b = item.getBounds('box', 'page')
    return item.visible !== false && point.x >= b.x - 16 && point.x <= b.x + b.width + 16 && point.y >= b.y - 16 && point.y <= b.y + b.height + 16
  })
}
export function makeConnector(from: { x: number; y: number }, to: { x: number; y: number }, mode: RouteMode = 'elbow', sourceId = '', targetId = '') {
  const line = new Path({ id: id(), name: 'connector', stroke: '#646a73', strokeWidth: 1.5, hitRadius: 8, editable: true, editConfig: { moveable: false, resizeable: false, rotateable: false }, data: { kind: 'connector', from, to, sourceId, targetId, mode } })
  setConnectorPath(line, from, to)
  return line
}
export function connectorGeometry(from: AnchorPoint, to: AnchorPoint, data: Record<string, unknown> = {}) {
  const mode = String(data.mode || 'elbow'), { source, target } = connectorPorts(data)
  const vertical = data.axis === 'y' || data.axis !== 'x' && (source ? source.y === 0 || source.y === 1 : Math.abs(to.y - from.y) > Math.abs(to.x - from.x))
  const endVertical = target ? target.y === 0 || target.y === 1 : vertical
  const direction = (anchor: AnchorPoint | undefined, isVertical: boolean, start: boolean) => anchor ? isVertical ? anchor.y === 0 ? -1 : 1 : anchor.x === 0 ? -1 : 1 : (isVertical ? to.y >= from.y : to.x >= from.x) === start ? 1 : -1
  const startSign = direction(source, vertical, true), endSign = direction(target, endVertical, false)
  let mid = typeof data.bend === 'number' ? data.bend : vertical ? (from.y + to.y) / 2 : (from.x + to.x) / 2
  if (data.bend === undefined && source && target && vertical === endVertical && startSign === endSign) mid = startSign > 0 ? Math.max(vertical ? from.y : from.x, vertical ? to.y : to.x) + 40 : Math.min(vertical ? from.y : from.x, vertical ? to.y : to.x) - 40
  let points: AnchorPoint[] = [from, to], firstControl = to, lastControl = from
  let middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, path: string
  if (mode === 'straight') path = `M${from.x} ${from.y}L${to.x} ${to.y}`
  else if (mode === 'curve') {
    const reach = Math.max(40, Math.min(200, Math.hypot(to.x - from.x, to.y - from.y) * .5))
    firstControl = vertical ? { x: from.x, y: data.bend === undefined ? from.y + startSign * reach : mid } : { x: data.bend === undefined ? from.x + startSign * reach : mid, y: from.y }
    lastControl = endVertical ? { x: to.x, y: vertical && data.bend !== undefined ? mid : to.y + endSign * reach } : { x: !vertical && data.bend !== undefined ? mid : to.x + endSign * reach, y: to.y }
    const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy)
    // Aligned endpoints otherwise collapse the cubic into a straight line.
    if (data.bend === undefined && length > .001 && Math.abs((firstControl.x - from.x) * dy - (firstControl.y - from.y) * dx) < .001 && Math.abs((lastControl.x - from.x) * dy - (lastControl.y - from.y) * dx) < .001) {
      const bulge = Math.max(24, Math.min(96, length * .18)) * 4 / 3
      firstControl = { x: firstControl.x + dy / length * bulge, y: firstControl.y - dx / length * bulge }
      lastControl = { x: lastControl.x + dy / length * bulge, y: lastControl.y - dx / length * bulge }
    }
    const offset = data.curveOffset as AnchorPoint | undefined
    if (offset && Number.isFinite(offset.x) && Number.isFinite(offset.y)) {
      // Store the midpoint displacement; both controls contribute 3/8 at t=.5.
      firstControl = { x: firstControl.x + offset.x * 4 / 3, y: firstControl.y + offset.y * 4 / 3 }
      lastControl = { x: lastControl.x + offset.x * 4 / 3, y: lastControl.y + offset.y * 4 / 3 }
    }
    path = `M${from.x} ${from.y}C${firstControl.x} ${firstControl.y} ${lastControl.x} ${lastControl.y} ${to.x} ${to.y}`
    middle = { x: (from.x + 3 * firstControl.x + 3 * lastControl.x + to.x) / 8, y: (from.y + 3 * firstControl.y + 3 * lastControl.y + to.y) / 8 }
  } else {
    const vertices = Array.isArray(data.vertices) ? data.vertices.filter((p): p is AnchorPoint => Boolean(p && typeof p === 'object' && Number.isFinite(p.x) && Number.isFinite(p.y))).slice(0, 64) : undefined
    if (vertices) {
      points = orthogonalConnectorPoints([from, ...vertices, to], data)
      const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y))
      let remaining = lengths.reduce((a, b) => a + b, 0) / 2
      for (let index = 0; index < lengths.length; index++) { if (remaining <= lengths[index]) { const ratio = remaining / (lengths[index] || 1); middle = { x: points[index].x + (points[index + 1].x - points[index].x) * ratio, y: points[index].y + (points[index + 1].y - points[index].y) * ratio }; break }; remaining -= lengths[index] }
    } else if (vertical === endVertical && typeof data.offset === 'number') {
      const start = vertical ? { x: from.x, y: from.y + startSign * 32 } : { x: from.x + startSign * 32, y: from.y }
      const end = vertical ? { x: to.x, y: to.y + endSign * 32 } : { x: to.x + endSign * 32, y: to.y }
      points = vertical ? [from, start, { x: data.offset, y: start.y }, { x: data.offset, y: end.y }, end, to] : [from, start, { x: start.x, y: data.offset }, { x: end.x, y: data.offset }, end, to]
      middle = vertical ? { x: data.offset, y: (start.y + end.y) / 2 } : { x: (start.x + end.x) / 2, y: data.offset }
    } else if (vertical === endVertical) {
      points = vertical ? [from, { x: from.x, y: mid }, { x: to.x, y: mid }, to] : [from, { x: mid, y: from.y }, { x: mid, y: to.y }, to]
      middle = vertical ? { x: (from.x + to.x) / 2, y: mid } : { x: mid, y: (from.y + to.y) / 2 }
    } else {
      const corner = vertical ? { x: from.x, y: to.y } : { x: to.x, y: from.y }
      const clearStart = (vertical ? corner.y - from.y : corner.x - from.x) * startSign >= 24, clearEnd = (endVertical ? corner.y - to.y : corner.x - to.x) * endSign >= 24
      if (data.bend === undefined && clearStart && clearEnd) { points = [from, corner, to]; middle = corner }
      else {
        const startBend = data.bend === undefined ? (vertical ? from.y : from.x) + startSign * 40 : mid
        const beforeEnd = endVertical ? { x: to.x, y: to.y + endSign * 40 } : { x: to.x + endSign * 40, y: to.y }
        points = vertical ? [from, { x: from.x, y: startBend }, { x: beforeEnd.x, y: startBend }, beforeEnd, to] : [from, { x: startBend, y: from.y }, { x: startBend, y: beforeEnd.y }, beforeEnd, to]
        middle = vertical ? { x: (from.x + beforeEnd.x) / 2, y: startBend } : { x: startBend, y: (from.y + beforeEnd.y) / 2 }
      }
    }
    points = orthogonalConnectorPoints(points, data)
    const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y))
    let remaining = lengths.reduce((a, b) => a + b, 0) / 2
    for (let index = 0; index < lengths.length; index++) { if (remaining <= lengths[index]) { const ratio = remaining / (lengths[index] || 1); middle = { x: points[index].x + (points[index + 1].x - points[index].x) * ratio, y: points[index].y + (points[index + 1].y - points[index].y) * ratio }; break }; remaining -= lengths[index] }
    firstControl = points.find(point => point.x !== from.x || point.y !== from.y) || to
    lastControl = [...points].reverse().find(point => point.x !== to.x || point.y !== to.y) || from
    path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join('')
  }
  const angle = Math.atan2(to.y - lastControl.y, to.x - lastControl.x), startAngle = Math.atan2(from.y - firstControl.y, from.x - firstControl.x)
  const head = (point: AnchorPoint, direction: number, style: unknown) => {
    if (style === 'none') return ''
    if (style === 'circle') return `M${point.x - 4} ${point.y}a4 4 0 1 0 8 0a4 4 0 1 0 -8 0`
    return `M${point.x - 9 * Math.cos(direction - .48)} ${point.y - 9 * Math.sin(direction - .48)}L${point.x} ${point.y}L${point.x - 9 * Math.cos(direction + .48)} ${point.y - 9 * Math.sin(direction + .48)}${style === 'triangle' ? 'Z' : ''}`
  }
  const routePath = path
  path += head(from, startAngle, data.startHead || 'none') + head(to, angle, data.endHead || 'arrow')
  let routePoints = points.filter((point, index) => !index || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > .000001)
  if (!Array.isArray(data.vertices)) routePoints = routePoints.filter((point, index, list) => { if (!index || index === list.length - 1) return true; const a = list[index - 1], b = list[index + 1]; return Math.abs((point.x - a.x) * (b.y - point.y) - (point.y - a.y) * (b.x - point.x)) > .000001 })
  const hitPoints = mode === 'curve' ? Array.from({ length: 33 }, (_, index) => { const t = index / 32, u = 1 - t; return { x: u ** 3 * from.x + 3 * u * u * t * firstControl.x + 3 * u * t * t * lastControl.x + t ** 3 * to.x, y: u ** 3 * from.y + 3 * u * u * t * firstControl.y + 3 * u * t * t * lastControl.y + t ** 3 * to.y } }) : routePoints
  return { path, routePath, vertical, middle, points: routePoints, hitPoints }
}
export function setConnectorPath(line: Path, from: AnchorPoint, to: AnchorPoint) {
  line.set({ path: connectorGeometry(from, to, line.data).path, x: 0, y: 0 })
}
const positioningLabels = new WeakSet<IUI>()
export function rememberConnectorLabelPosition(app: App, label: IUI) {
  if (positioningLabels.has(label)) return
  const line = allItems(app).find(item => item.id === label.data?.ownerId)
  if (!line || !isConnector(line)) return
  // Property events arrive before the label's own world transform is updated.
  const center = connectorPagePoint(app, label, { x: Number(label.x) + Number(label.width) / 2, y: Number(label.y) + Number(label.height) / 2 })
  const point = connectorLocalPoint(app, line, center), middle = connectorGeometry(line.data!.from, line.data!.to, line.data).middle
  const offset = { x: point.x - middle.x, y: point.y - middle.y }
  if (JSON.stringify(label.data?.offset) !== JSON.stringify(offset)) label.data = { ...label.data, offset }
}
function positionConnectorLabel(app: App, line: IUI, label: IUI) {
  const middle = connectorGeometry(line.data!.from, line.data!.to, line.data).middle
  const offset = label.data?.offset as AnchorPoint | undefined
  const page = connectorPagePoint(app, line, { x: middle.x + (Number(offset?.x) || 0), y: middle.y + (Number(offset?.y) || 0) })
  const point = connectorLocalPoint(app, label, page), x = point.x - Number(label.width) / 2, y = point.y - Number(label.height) / 2
  if (Math.abs(Number(label.x) - x) < .001 && Math.abs(Number(label.y) - y) < .001) return
  const positioning = positioningLabels.has(label)
  positioningLabels.add(label)
  try { label.set({ x, y }) } finally { if (!positioning) positioningLabels.delete(label) }
}
export function fitConnectorLabel(text: Text) {
  const label = ancestor(text, 'connector-label')
  if (!label || positioningLabels.has(label)) return
  const height = Math.max(20, Math.ceil(richLayout(text, true)?.height || Number(text.fontSize || 13) * 1.5))
  if (Number(text.height) === height && Number(label.height) === height + 8) return
  positioningLabels.add(label)
  try { text.height = height; label.height = height + 8 } finally { positioningLabels.delete(label) }
}
export function connectorLabel(app: App, connector: IUI): Text {
  const labelId = connector.data?.labelId
  const existing = labelId ? allItems(app).find(item => item.id === labelId && kind(item) === 'connector-label') : undefined
  if (existing) return labelOf(existing)!
  const from = connector.data!.from as { x: number; y: number }, to = connector.data!.to as { x: number; y: number }
  const middle = connectorPagePoint(app, connector, connectorGeometry(from, to, connector.data).middle)
  const box = new Frame({ id: id(), name: 'connector-label', x: middle.x - 48, y: middle.y - 14, width: 96, height: 28, fill: 'rgba(0,0,0,0)', overflow: 'show', editable: true, hitChildren: false, editConfig: { resizeable: false, rotateable: false }, data: { kind: 'connector-label', ownerId: connector.id } })
  const text = new Text({ id: id(), name: 'text', text: '', x: 5, y: 4, width: 86, height: 20, fontSize: 13, fontFamily: font, fill: '#41454c', textAlign: 'center', verticalAlign: 'middle', lineHeight: { type: 'percent', value: 1.5 }, editable: true, editConfig: { moveable: false, resizeable: false, rotateable: false }, data: { kind: 'node-label' } })
  box.add(text); app.tree.add(box); connector.data = { ...connector.data, labelId: box.id }
  return text
}

export function refreshConnectors(app: App) {
  // New native elements may not have received their persisted IDs yet. Empty
  // references mean "no endpoint/label", never the newest unassigned element.
  const items = allItems(app), byId = new Map(items.filter(item => Boolean(item.id)).map(item => [item.id, item]))
  items.filter(isConnector).forEach(item => {
    const source = byId.get(String(item.data?.sourceId || '')), target = byId.get(String(item.data?.targetId || ''))
    const data = item.data as { from: { x: number; y: number }; to: { x: number; y: number } }
    let from = { ...data.from }, to = { ...data.to }
    const center = (node: IUI) => { const b = node.getBounds('box', 'page'); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
    if (source) from = connectorLocalPoint(app, item, endpoint(source, target ? center(target) : connectorPagePoint(app, item, to), item.data?.sourceAnchor || (kind(item) === 'template-edge' ? connectionPorts[1] : undefined)))
    if (target) to = connectorLocalPoint(app, item, endpoint(target, source ? center(source) : connectorPagePoint(app, item, from), item.data?.targetAnchor || (kind(item) === 'template-edge' ? connectionPorts[3] : undefined)))
    // Page/local round trips during pan and zoom can introduce tiny floating
    // point differences. Navigation must not rewrite routes or create history.
    const moved = (a: AnchorPoint, b: AnchorPoint) => Math.abs(a.x - b.x) > .000001 || Math.abs(a.y - b.y) > .000001
    if (moved(from, data.from) || moved(to, data.to)) {
      item.data = { ...item.data, from, to }
      setConnectorPath(item as Path, from, to)
    }
    const label = byId.get(String(item.data?.labelId || ''))
    if (label && kind(label) === 'connector-label') positionConnectorLabel(app, item, label)
  })
}

export function removeItems(app: App, items: IUI[]) {
  // Live rich-text selection points at the label. Object deletion still owns
  // its semantic note/card/diagram, including atomic mentions inside it.
  const roots = [...new Set(items.map(item => {
    if (item.tag !== 'Text') return item
    const owner = ancestor(item, 'note') || ancestor(item, 'card') || ancestor(item, 'diagram-node') || ancestor(item, 'connector-label')
    return owner && labelOf(owner) === item ? owner : item
  }))]
  if (app.editor.innerEditing) app.editor.closeInnerEditor()
  const before = new Set(allItems(app).map(item => item.id))
  roots.forEach(item => { const node = mindNode(item); if (node) removeMindNode(node); else item.remove() })
  const remaining = allItems(app), ids = new Set(remaining.map(item => item.id))
  const removed = new Set([...before].filter(id => !ids.has(id)))
  // Relations do not imply selection. Preserve unselected lines and labels at
  // their current position, detaching only references to the deleted elements.
  remaining.forEach(item => {
    const keys = isConnector(item) ? ['sourceId', 'targetId', 'labelId'] : kind(item) === 'connector-label' ? ['ownerId'] : []
    const detached = keys.filter(key => item.data?.[key] && removed.has(item.data[key]))
    if (!detached.length) return
    const data = { ...item.data }
    detached.forEach(key => { delete data[key] })
    item.data = data
  })
}

export type MindTheme = 'blue' | 'green' | 'warm' | 'mono'
const themes: Record<MindTheme, { root: string; strokes: string[]; fills: string[] }> = {
  blue: { root: '#3370ff', strokes: branchColors, fills: branchFills },
  green: { root: '#25845b', strokes: ['#25845b', '#3b9b91', '#7b9d3a', '#59a56d'], fills: ['#e5f6ee', '#e3f4f1', '#f0f4df', '#e8f5e7'] },
  warm: { root: '#d27d2c', strokes: ['#d27d2c', '#d95f68', '#b98c34', '#ad6aa4'], fills: ['#fff1dc', '#ffe9e8', '#fff7d9', '#f7e8f4'] },
  mono: { root: '#41454c', strokes: ['#8f959e'], fills: ['#f5f6f7'] },
}
function applyNodeTheme(node: Frame, theme: MindTheme) {
  const palette = themes[theme], index = Number(node.data?.colorIndex || 0)
  node.set({ fill: node.data?.root ? palette.root : palette.fills[index % palette.fills.length], stroke: node.data?.root ? palette.root : palette.strokes[index % palette.strokes.length] })
}
export function setMindTheme(group: Group, theme: MindTheme) {
  group.data = { ...group.data, theme }
  mindNodes(group).forEach(node => applyNodeTheme(node, theme))
  refreshMindEdges(group)
}
