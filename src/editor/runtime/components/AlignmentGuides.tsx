import { useEffect, useRef, useState } from 'react'
import { MoveEvent, ZoomEvent, type App, type Frame, type IUI } from 'leafer-ui'
import { EditorEvent, InnerEditorEvent } from '@leafer-in/editor'
import { isConnector, kind, mindDescendants } from '../thinking/scene'

type Point = { x: number; y: number }
type Box = Point & { width: number; height: number }
type Guide = { axis: 'x' | 'y'; position: number; start: number; end: number }
const anchors = (box: Box, axis: 'x' | 'y') => {
  const size = axis === 'x' ? box.width : box.height
  return [box[axis], box[axis] + size / 2, box[axis] + size]
}
const atomicKinds = new Set(['note', 'card', 'diagram-node', 'mind-node', 'table', 'connector-label'])
const ignoredKinds = new Set(['mind-edge', 'diagram-body', 'table-cell', 'node-label', 'container-decoration'])

function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map(box => box.x)), y = Math.min(...boxes.map(box => box.y))
  return { x, y, width: Math.max(...boxes.map(box => box.x + box.width)) - x, height: Math.max(...boxes.map(box => box.y + box.height)) - y }
}

function referenceBoxes(app: App, selected: IUI[]) {
  const moving = new Set(selected.flatMap(item => kind(item) === 'mind-node' ? [item, ...mindDescendants(item as Frame)] : [item]))
  const parents = new Set<IUI>()
  selected.forEach(item => { for (let parent = item.parent; parent && parent !== app.tree; parent = parent.parent) parents.add(parent) })
  const boxes: Box[] = []
  const visit = (items: IUI[]) => items.forEach(item => {
    if (item.destroyed || item.visible === false || item.opacity === 0 || moving.has(item)) return
    const type = kind(item)
    if (isConnector(item) || ignoredKinds.has(type) || item.name === 'frame-title') return
    if (!parents.has(item) && item.editable && type !== 'connector-label') {
      const box = item.getBounds('box', 'world')
      if ([box.x, box.y, box.width, box.height].every(Number.isFinite)) boxes.push({ x: box.x, y: box.y, width: box.width, height: box.height })
    }
    // Labels and cells belong to their enclosing object, never to its guides.
    if ((!atomicKinds.has(type) || parents.has(item)) && item.children) visit(item.children)
  })
  visit(app.tree.children)
  return boxes
}

function nearestOffset(box: Box, references: Box[], axis: 'x' | 'y', tolerance: number) {
  let offset = 0, distance = tolerance + .001, sameAnchor = false
  const positions = anchors(box, axis)
  for (const reference of references) anchors(reference, axis).forEach((position, index) => {
    positions.forEach((value, sourceIndex) => {
      const delta = position - value, nextDistance = Math.abs(delta), same = index === sourceIndex
      if (nextDistance <= tolerance && (nextDistance < distance - .001 || Math.abs(nextDistance - distance) < .001 && same && !sameAnchor)) {
        offset = delta; distance = nextDistance; sameAnchor = same
      }
    })
  })
  return offset
}

function matchingGuides(box: Box, references: Box[], axis: 'x' | 'y') {
  const other = axis === 'x' ? 'y' : 'x', size = axis === 'x' ? 'height' : 'width'
  const guides: Guide[] = []
  for (const position of anchors(box, axis)) {
    const matches = references.filter(reference => anchors(reference, axis).some(value => Math.abs(value - position) < .01))
    if (matches.length) guides.push({ axis, position, start: Math.min(box[other], ...matches.map(reference => reference[other])), end: Math.max(box[other] + box[size], ...matches.map(reference => reference[other] + reference[size])) })
  }
  return guides
}

/** Drag feedback lives outside the scene so it cannot enter history or exports. */
export function AlignmentGuides({ app }: { app: App }) {
  const root = useRef<SVGSVGElement>(null)
  const [guides, setGuides] = useState<Guide[]>([])
  useEffect(() => {
    const editor = app.editor, previous = editor.config.beforeMove
    let references: Box[] | undefined, pointer: { start: Point; point: Point; shift: boolean } | undefined
    const clear = () => { references = undefined; setGuides([]) }
    const finish = () => { pointer = undefined; clear() }
    const down = (event: PointerEvent) => {
      if (event.button === 0 && (app.view as HTMLElement).contains(event.target as Node)) {
        finish(); pointer = { start: { x: event.clientX, y: event.clientY }, point: { x: event.clientX, y: event.clientY }, shift: event.shiftKey }
      }
    }
    const move = (event: PointerEvent) => { if (pointer) { pointer.point = { x: event.clientX, y: event.clientY }; pointer.shift = event.shiftKey } }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' || event.code === 'Space') finish() }
    const beforeMove: NonNullable<typeof previous> = data => {
      const checked = previous?.(data)
      if (checked === false) { clear(); return false }
      const move = checked && typeof checked === 'object' ? checked : { x: data.x, y: data.y }
      if (!pointer || !editor.editBox.moving || editor.innerEditing || !editor.list.length) { clear(); return move }
      const world = data.target.getWorldPointByLocal(move, undefined, true)
      const bounds = union(editor.list.map(item => item.getBounds('box', 'world')))
      const proposed = { ...bounds, x: bounds.x + world.x, y: bounds.y + world.y }
      references ??= referenceBoxes(app, editor.list)
      const origin = app.tree.getClientPointByWorld({ x: 0, y: 0 }), unit = app.tree.getClientPointByWorld({ x: 1, y: 1 })
      const horizontal = Math.abs(pointer.point.x - pointer.start.x) >= Math.abs(pointer.point.y - pointer.start.y)
      const allowX = !pointer.shift || horizontal, allowY = !pointer.shift || !horizontal
      const dx = allowX ? nearestOffset(proposed, references, 'x', 6 / Math.max(.001, Math.abs(unit.x - origin.x))) : 0
      const dy = allowY ? nearestOffset(proposed, references, 'y', 6 / Math.max(.001, Math.abs(unit.y - origin.y))) : 0
      proposed.x += dx; proposed.y += dy
      const box = root.current?.getBoundingClientRect()
      setGuides([...matchingGuides(proposed, references, 'x'), ...matchingGuides(proposed, references, 'y')].map(guide => {
        const start = app.tree.getClientPointByWorld(guide.axis === 'x' ? { x: guide.position, y: guide.start } : { x: guide.start, y: guide.position })
        const end = app.tree.getClientPointByWorld(guide.axis === 'x' ? { x: guide.position, y: guide.end } : { x: guide.end, y: guide.position })
        return { axis: guide.axis, position: guide.axis === 'x' ? start.x - (box?.left || 0) : start.y - (box?.top || 0), start: guide.axis === 'x' ? start.y - (box?.top || 0) : start.x - (box?.left || 0), end: guide.axis === 'x' ? end.y - (box?.top || 0) : end.x - (box?.left || 0) }
      }))
      return data.target.getLocalPoint({ x: world.x + dx, y: world.y + dy }, undefined, true)
    }
    editor.config.beforeMove = beforeMove
    const ids = [editor.on_(EditorEvent.SELECT, clear), editor.on_(InnerEditorEvent.OPEN, finish), app.on_(MoveEvent.MOVE, clear), app.on_(ZoomEvent.ZOOM, clear)]
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointermove', move, true)
    document.addEventListener('pointerup', finish, true)
    document.addEventListener('pointercancel', finish, true)
    window.addEventListener('blur', finish)
    window.addEventListener('keydown', key, true)
    return () => {
      if (editor.config.beforeMove === beforeMove) editor.config.beforeMove = previous
      app.off_(ids)
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointermove', move, true)
      document.removeEventListener('pointerup', finish, true)
      document.removeEventListener('pointercancel', finish, true)
      window.removeEventListener('blur', finish)
      window.removeEventListener('keydown', key, true)
    }
  }, [app])
  return <svg ref={root} className="canvas-alignment-guides" aria-hidden="true">
    {guides.map(guide => <line key={`${guide.axis}:${guide.position}`} data-axis={guide.axis} x1={guide.axis === 'x' ? guide.position : guide.start - 6} y1={guide.axis === 'y' ? guide.position : guide.start - 6} x2={guide.axis === 'x' ? guide.position : guide.end + 6} y2={guide.axis === 'y' ? guide.position : guide.end + 6} />)}
  </svg>
}
