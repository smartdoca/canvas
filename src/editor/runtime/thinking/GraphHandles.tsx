import { applyConnectorCreationStyle, creationPreferences } from './preferences'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LayoutEvent, MoveEvent, PointerEvent, PropertyEvent, ZoomEvent, type App, type Frame, type IUI, type Path } from 'leafer-ui'
import { EditorEvent, InnerEditorEvent } from '@leafer-in/editor'
import { useCanvasI18n } from '../../../i18n/context'
import { allItems, ancestor, connectableNode, connectionPorts, connectorGeometry, connectorLocalPoint, connectorPagePoint, connectorLabel, endpoint, isConnector, kind, labelOf, makeConnector, makeDiagram, mindDescendants, mindDirectionOf, moveConnectorSegment, nearestPort, pickConnectable, refreshConnectors, setConnectorPath, orthogonalConnectorPoints, type AnchorPoint } from './scene'
import { getStyleParamsFromLocalStorage } from '../utils/styleLocalStorage'
import { BoardIcon } from './BoardIcon'
import { connectorTranslationPreview } from './connectorTranslationPreview'

type Draft = { type: 'create' | 'source' | 'target' | 'bend' | 'segment' | 'vertex' | 'translate'; node?: IUI; line?: IUI; anchor?: AnchorPoint; from: AnchorPoint; to: AnchorPoint; start: AnchorPoint; target?: IUI; targetAnchor?: AnchorPoint; bend?: number; offset?: number; curveOffset?: AnchorPoint; moved: boolean; index?: number; points?: AnchorPoint[]; vertices?: AnchorPoint[]; handlePoint?: AnchorPoint; guides?: { axis: 'x' | 'y'; value: number }[] }
export function GraphHandles({ app, activeKey, selection, onComplete, onMindAction }: { app: App; activeKey: string; selection: IUI[]; onComplete: (items: IUI[]) => void; onMindAction: (action: 'child' | 'collapse') => void }) {
  const t = useCanvasI18n(), root = useRef<HTMLDivElement>(null), draftRef = useRef<Draft>(), [draftState, setDraft] = useState<Draft>(), [hovered, setHovered] = useState<IUI>(), [, redraw] = useState(0)
  const [picker, setPicker] = useState<{ line: IUI; point: AnchorPoint }>()
  const [hoveredLine, setHoveredLine] = useState<IUI>()
  const translationRef = useRef<ReturnType<typeof connectorTranslationPreview>>()
  const stagePoint = useCallback((point: AnchorPoint) => {
    const world = app.tree.getWorldPoint(point), client = app.tree.getClientPointByWorld(world), box = root.current?.getBoundingClientRect() || (app.view as HTMLElement).closest('.canvas-stage')?.getBoundingClientRect()
    return { x: client.x - (box?.left || 0), y: client.y - (box?.top || 0) }
  }, [app])
  const pagePoint = useCallback((event: { clientX: number; clientY: number }) => app.tree.getInnerPoint(app.tree.getWorldPointByClient(event)), [app])
  const update = useCallback((next?: Draft) => {
    if (!next) { translationRef.current?.dispose(); translationRef.current = undefined }
    draftRef.current = next; setDraft(next ? { ...next } : undefined)
  }, [])
  useEffect(() => () => { translationRef.current?.dispose(); translationRef.current = undefined }, [])
  const finish = useCallback((current: Draft) => {
    if (current.line && !current.line.leafer || current.node && !current.node.leafer || current.target && !current.target.leafer) { update(); setPicker(undefined); return }
    let line = current.line
    if (current.type === 'create') {
      line = makeConnector(current.from, current.to, (creationPreferences(app)?.connector?.mode || getStyleParamsFromLocalStorage().connectorMode || 'elbow') as import('./scene').RouteMode, current.node?.id, current.target?.id)
      line.data = { ...line.data, sourceAnchor: current.anchor, targetAnchor: current.targetAnchor }
      applyConnectorCreationStyle(app, line)
      app.tree.add(line)
    } else if (line && current.type === 'translate') {
      translationRef.current?.dispose(); translationRef.current = undefined
      if (current.from.x === line.data!.from.x && current.from.y === line.data!.from.y && current.to.x === line.data!.to.x && current.to.y === line.data!.to.y) { update(); return }
      line.data = { ...line.data, from: current.from, to: current.to, ...(current.bend === undefined ? {} : { bend: current.bend }), ...(current.offset === undefined ? {} : { offset: current.offset }), ...(current.vertices === undefined ? {} : { vertices: current.vertices }) }
    } else if (line && (current.type === 'segment' || current.type === 'vertex')) {
      const vertices = orthogonalConnectorPoints([current.from, ...current.vertices || [], current.to], line.data).slice(1, -1)
      if (connectorGeometry(current.from, current.to, { ...line.data, vertices }).routePath === connectorGeometry(current.from, current.to, line.data).routePath) { update(); return }
      line.data = { ...line.data, vertices }
    } else if (line && current.type === 'bend') {
      const data = { ...line.data, ...(current.curveOffset ? { curveOffset: current.curveOffset } : current.offset === undefined ? { bend: current.bend } : { offset: current.offset }) }
      if (connectorGeometry(current.from, current.to, data).routePath === connectorGeometry(current.from, current.to, line.data).routePath) { update(); return }
      line.data = data
    } else if (line) {
      const source = current.type === 'source'
      line.data = { ...line.data, [source ? 'sourceId' : 'targetId']: current.target?.id || '', [source ? 'sourceAnchor' : 'targetAnchor']: current.targetAnchor, [source ? 'from' : 'to']: source ? current.from : current.to }
    }
    if (line) {
      setConnectorPath(line as Path, line.data!.from, line.data!.to); refreshConnectors(app)
      onComplete([line])
      if (current.type === 'create' && !current.target) setPicker({ line, point: current.to })
    }
    update()
  }, [app, onComplete, update])
  useEffect(() => {
    if (activeKey !== 'init') { update(); setPicker(undefined); return }
    const host = (app.view as HTMLElement).closest<HTMLElement>('.canvas-host')!
    const paint = () => redraw(n => n + 1)
    let layoutFrame: number | undefined
    const paintLayout = () => {
      if (layoutFrame === undefined) layoutFrame = requestAnimationFrame(() => { layoutFrame = undefined; paint() })
    }
    const clientPoint = (line: IUI, point: AnchorPoint) => app.tree.getClientPointByWorld(app.tree.getWorldPoint(connectorPagePoint(app, line, point)))
    const hitLabel = (event: { clientX: number; clientY: number }) => {
      const point = pagePoint(event)
      return allItems(app).filter(item => kind(item) === 'connector-label' && item.visible !== false).reverse().find(item => {
        const bounds = item.getBounds('box', 'page')
        return point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height
      })
    }
    const hitLine = (event: { clientX: number; clientY: number }) => {
      if (hitLabel(event)) return
      const point = pagePoint(event), node = pickConnectable(app, point)
      if (node) { const b = node.getBounds('box', 'page'); if (point.x > b.x + 2 && point.x < b.x + b.width - 2 && point.y > b.y + 2 && point.y < b.y + b.height - 2) return }
      let best: { line: IUI; index: number; distance: number } | undefined
      for (const line of allItems(app).filter(item => isConnector(item) && item.visible !== false).reverse()) {
        const points = connectorGeometry(line.data!.from, line.data!.to, line.data).hitPoints.map(point => clientPoint(line, point))
        for (let index = 0; index < points.length - 1; index++) {
          const a = points[index], b = points[index + 1], dx = b.x - a.x, dy = b.y - a.y
          const ratio = Math.max(0, Math.min(1, ((event.clientX - a.x) * dx + (event.clientY - a.y) * dy) / (dx * dx + dy * dy || 1)))
          const distance = Math.hypot(event.clientX - a.x - ratio * dx, event.clientY - a.y - ratio * dy)
          if (distance <= 9 && (!best || distance < best.distance)) best = { line, index, distance }
        }
      }
      return best
    }
    const move = (event: globalThis.PointerEvent) => {
      const current = draftRef.current
      if (!current) {
        const line = !app.editor.innerEditing && host.contains(event.target as globalThis.Node) ? hitLine(event)?.line : undefined
        setHoveredLine(previous => previous === line ? previous : line); host.style.cursor = line ? !line.data?.sourceId && !line.data?.targetId ? 'move' : 'pointer' : ''
        return
      }
      if (current.line && !current.line.leafer || current.node && !current.node.leafer) { update(); setPicker(undefined); return }
      const page = pagePoint(event), point = current.line ? connectorLocalPoint(app, current.line, page) : page, target = pickConnectable(app, page)
      if (current.line?.data?.mode === 'straight' && current.type === 'bend') return
      current.moved ||= Math.hypot(event.clientX - current.start.x, event.clientY - current.start.y) > 4
      if (!current.moved) return
      if (current.type === 'translate') {
        const data = current.line!.data!, origin = connectorLocalPoint(app, current.line!, pagePoint({ clientX: current.start.x, clientY: current.start.y }))
        const delta = { x: point.x - origin.x, y: point.y - origin.y }
        if (Math.abs(delta.x) < .000001) delta.x = 0
        if (Math.abs(delta.y) < .000001) delta.y = 0
        const translate = (p: AnchorPoint) => ({ x: p.x + delta.x, y: p.y + delta.y })
        current.from = translate(data.from); current.to = translate(data.to)
        // Endpoints, manual vertices and route coordinates share the parent's
        // coordinate system; the curve's relative offset remains unchanged.
        const vertical = connectorGeometry(data.from, data.to, data).vertical
        if (typeof data.bend === 'number') current.bend = data.bend + (vertical ? delta.y : delta.x)
        if (typeof data.offset === 'number') current.offset = data.offset + (vertical ? delta.x : delta.y)
        if (Array.isArray(data.vertices)) current.vertices = data.vertices.map(translate)
        translationRef.current ||= connectorTranslationPreview(app, current.line!)
        translationRef.current.update(current.from, current.to, { ...data, ...(current.bend === undefined ? {} : { bend: current.bend }), ...(current.offset === undefined ? {} : { offset: current.offset }), ...(current.vertices === undefined ? {} : { vertices: current.vertices }) })
      } else if (current.type === 'segment' || current.type === 'vertex') {
        const points = current.points!.map(p => ({ ...p })), index = current.index!, origin = connectorLocalPoint(app, current.line!, pagePoint({ clientX: current.start.x, clientY: current.start.y }))
        current.guides = []
        const threshold = 7 / Math.abs(Number(app.tree.scaleX || 1))
        const snapCoordinate = (axis: 'x' | 'y', coordinate: number, excluded: number[]) => {
          const nearest = points.filter((_, at) => !excluded.includes(at)).sort((a, b) => Math.abs(a[axis] - coordinate) - Math.abs(b[axis] - coordinate))[0]
          if (nearest && Math.abs(nearest[axis] - coordinate) <= threshold) { current.guides!.push({ axis, value: nearest[axis] }); return nearest[axis] }
          return coordinate
        }
        if (current.type === 'vertex') {
          const snap = (key: 'x' | 'y') => snapCoordinate(key, point[key], [index])
          const old = points[index], next = { x: snap('x'), y: snap('y') }, previous = points[index - 1], following = points[index + 1]
          if (points.length === 3) {
            const horizontal = Math.abs(old.y - previous.y) < .01
            points.splice(1, 1, ...(horizontal ? [{ x: next.x, y: previous.y }, next, { x: following.x, y: next.y }] : [{ x: previous.x, y: next.y }, next, { x: next.x, y: following.y }]))
          } else {
            const beforeAxis = Math.abs(previous.y - old.y) < .01 ? 'y' : 'x', afterAxis = Math.abs(following.y - old.y) < .01 ? 'y' : 'x'
            if (index === 1) next[beforeAxis] = previous[beforeAxis]
            else previous[beforeAxis] = next[beforeAxis]
            if (index === points.length - 2) next[afterAxis] = following[afterAxis]
            else following[afterAxis] = next[afterAxis]
            points[index] = next
          }
        } else {
          const a = points[index], b = points[index + 1], horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y), delta = { x: point.x - origin.x, y: point.y - origin.y }
          const axis = horizontal ? 'y' : 'x'
          const base = index === 0 && current.line?.data?.sourceId && points.length >= 6 && Math.abs(b[horizontal ? 'x' : 'y'] - a[horizontal ? 'x' : 'y']) <= 32 ? points[2][axis] : a[axis]
          delta[axis] = snapCoordinate(axis, base + delta[axis], [index, index + 1]) - base
          const desired = { x: (a.x + b.x) / 2 + (horizontal ? 0 : delta.x), y: (a.y + b.y) / 2 + (horizontal ? delta.y : 0) }
          points.splice(0, points.length, ...moveConnectorSegment(points, index, delta, current.line?.data || {}))
          // Keep the captured handle on the preview even when a port clamps
          // the route; the pointer must not pull a handle away from its line.
          current.handlePoint = points.slice(1).reduce((best, end, at) => {
            const start = points[at]
            if (horizontal ? Math.abs(start.y - end.y) > .000001 : Math.abs(start.x - end.x) > .000001) return best
            const projected = horizontal ? { x: Math.max(Math.min(start.x, end.x), Math.min(Math.max(start.x, end.x), desired.x)), y: start.y } : { x: start.x, y: Math.max(Math.min(start.y, end.y), Math.min(Math.max(start.y, end.y), desired.y)) }
            const distance = Math.hypot(projected.x - desired.x, projected.y - desired.y)
            return distance < best.distance ? { point: projected, distance } : best
          }, { point: desired, distance: Infinity }).point
        }
        current.guides = current.guides.filter(guide => points.some((p, at) => at > 0 && Math.abs(p[guide.axis] - guide.value) < .001 && Math.abs(points[at - 1][guide.axis] - guide.value) < .001))
        current.vertices = orthogonalConnectorPoints(points, current.line?.data).slice(1, -1)
      } else if (current.type === 'bend') {
        const data = current.line?.data || {}, vertical = connectorGeometry(current.from, current.to, data).vertical
        if (data.mode === 'curve') {
          const origin = connectorLocalPoint(app, current.line!, pagePoint({ clientX: current.start.x, clientY: current.start.y }))
          const offset = data.curveOffset as AnchorPoint | undefined
          current.curveOffset = { x: (Number.isFinite(offset?.x) ? offset!.x : 0) + point.x - origin.x, y: (Number.isFinite(offset?.y) ? offset!.y : 0) + point.y - origin.y }
        } else if (typeof data.offset === 'number' || Math.abs(vertical ? current.to.x - current.from.x : current.to.y - current.from.y) < 1) current.offset = vertical ? point.x : point.y
        else current.bend = vertical ? point.y : point.x
      }
      else {
        current.target = target === current.node ? undefined : target
        current.targetAnchor = current.target ? nearestPort(current.target, page) : undefined
        const endPage = current.target ? endpoint(current.target, page, current.targetAnchor) : page
        const end = current.line ? connectorLocalPoint(app, current.line, endPage) : endPage
        if (current.type === 'source') current.from = end; else current.to = end
      }
      update(current); event.preventDefault()
    }
    const up = (event: globalThis.PointerEvent) => {
      const current = draftRef.current
      if (!current) return
      event.preventDefault(); event.stopImmediatePropagation()
      if (!current.moved) { update(); return }
      finish(current)
    }
    const down = (event: globalThis.PointerEvent) => {
      if ((event.target as Element).closest('.graph-handle,.graph-create-picker')) return
      if (picker) setPicker(undefined)
      if (event.button !== 0 || !host.contains(event.target as globalThis.Node) || app.editor.innerEditing) return
      const node = pickConnectable(app, pagePoint(event))
      if (node && ['mind-node', 'diagram-node', 'note', 'card', 'connector-label'].includes(kind(node) || node.name || '')) {
        // Closing a label editor can leave Leafer's group open. A canvas drag
        // owns the semantic element; only the Slate DOM owns text gestures.
        node.hitChildren = false
        if (app.editor.list.length === 1 && app.editor.list[0] === labelOf(node)) app.editor.select(node)
      }
      const hit = hitLine(event)
      if (!hit) return
      event.preventDefault(); event.stopImmediatePropagation()
      app.editor.select(event.shiftKey ? [...new Set([...app.editor.list, hit.line])] : hit.line)
      host.closest<HTMLElement>('.canvas-app')?.focus({ preventScroll: true })
      const data = hit.line.data!, geometry = connectorGeometry(data.from, data.to, data)
      if (event.altKey && !['straight', 'curve'].includes(String(data.mode)) && geometry.points.length < 66) {
        const point = connectorLocalPoint(app, hit.line, pagePoint(event)), points = geometry.points.map(p => ({ ...p })), a = points[hit.index], b = points[hit.index + 1], dx = b.x - a.x, dy = b.y - a.y, ratio = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
        points.splice(hit.index + 1, 0, { x: a.x + dx * ratio, y: a.y + dy * ratio })
        update({ type: 'vertex', line: hit.line, from: { ...data.from }, to: { ...data.to }, start: { x: event.clientX, y: event.clientY }, moved: false, index: hit.index + 1, points, vertices: points.slice(1, -1) }); return
      }
      const type = !data.sourceId && !data.targetId ? 'translate' : data.mode === 'straight' || data.mode === 'curve' || geometry.points.length === 2 ? 'bend' : 'segment'
      update({ type, line: hit.line, from: { ...data.from }, to: { ...data.to }, start: { x: event.clientX, y: event.clientY }, moved: false, index: hit.index, points: geometry.points })
    }
    const double = (event: MouseEvent) => {
      if (app.editor.innerEditing || !host.contains(event.target as globalThis.Node) || (event.target as Element).closest('.canvas-slate-mount,.graph-handle')) return
      const box = hitLabel(event), hit = box ? undefined : hitLine(event)
      if (!box && !hit) return
      event.preventDefault(); event.stopImmediatePropagation(); update(); setPicker(undefined)
      const label = box ? labelOf(box)! : connectorLabel(app, hit!.line); app.editor.select(label); app.editor.openInnerEditor(label, true)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (draftRef.current || picker) { event.preventDefault(); event.stopImmediatePropagation(); update(); setPicker(undefined) }
    }
    const selected = () => { if (picker && !app.editor.list.includes(picker.line)) setPicker(undefined); paint() }
    const editing = () => { update(); setPicker(undefined); setHoveredLine(undefined); paint() }
    // Property events can precede transform/layout invalidation. Refresh once
    // layout settles so resized ports never stay at their previous positions.
    const ids = [app.on_(MoveEvent.MOVE, paint), app.on_(ZoomEvent.ZOOM, paint), app.tree.on_(PropertyEvent.CHANGE, paint), app.tree.on_(LayoutEvent.AFTER, paintLayout), app.editor.on_(EditorEvent.SELECT, selected), app.editor.on_(InnerEditorEvent.CLOSE, paint), app.editor.on_(InnerEditorEvent.OPEN, editing),
      app.on_(PointerEvent.MOVE, (event: PointerEvent) => {
        if (draftRef.current || app.editor.innerEditing) return
        const node = ancestor(event.target as IUI, 'table-cell') ? undefined : connectableNode(event.target as IUI)
        setHovered(previous => previous === node ? previous : node)
      }),
    ]
    const cancel = () => update()
    document.addEventListener('dblclick', double, true); document.addEventListener('pointercancel', cancel, true); window.addEventListener('blur', cancel)
    document.addEventListener('pointermove', move, true); document.addEventListener('pointerup', up, true); document.addEventListener('pointerdown', down, true); window.addEventListener('keydown', key, true)
    return () => { if (layoutFrame !== undefined) cancelAnimationFrame(layoutFrame); host.style.cursor = ''; document.removeEventListener('dblclick', double, true); document.removeEventListener('pointercancel', cancel, true); window.removeEventListener('blur', cancel); app.off_(ids); document.removeEventListener('pointermove', move, true); document.removeEventListener('pointerup', up, true); document.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key, true) }
  }, [activeKey, app, finish, onComplete, pagePoint, picker, update])

  if (activeKey !== 'init' || app.editor.innerEditing) return null
  // remove() detaches a Leafer node without destroying it. Hover/gesture state
  // can outlive that node, so only attached objects may supply page transforms.
  const attached = (item?: IUI): item is IUI => Boolean(item && item.leafer === app.tree && !item.destroyed)
  const cellSelection = selection.some(item => ancestor(item, 'table-cell'))
  const candidate = !cellSelection && selection.length === 1 ? connectableNode(selection[0]) : undefined
  const selected = attached(candidate) ? candidate : undefined
  const nodes = [...new Set([selected, cellSelection ? undefined : hovered].filter(attached))]
  const line = isConnector(selection[0]) && attached(selection[0]) ? selection[0] : undefined
  const displayLine = line || (attached(hoveredLine) ? hoveredLine : undefined)
  const draft = draftState && (!draftState.node || attached(draftState.node)) && (!draftState.line || attached(draftState.line)) ? draftState : undefined
  const begin = (event: React.PointerEvent, type: Draft['type'], node?: IUI, anchor?: AnchorPoint, index?: number) => {
    if (event.button !== 0) return
    if (node && !attached(node) || line && !attached(line)) return
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); app.editor.closeInnerEditor(); setPicker(undefined)
    const from = node ? endpoint(node, { x: 0, y: 0 }, anchor) : { ...line!.data!.from }, to = node ? { ...from } : { ...line!.data!.to }
    if (type === 'bend' && line?.data?.mode !== 'curve' && Array.isArray(line?.data?.vertices)) {
      const geometry = connectorGeometry(from, to, line!.data), point = connectorLocalPoint(app, line!, pagePoint(event))
      type = 'segment'
      index = geometry.points.slice(1).reduce((best, end, at) => { const first = geometry.points[at], distance = Math.hypot((first.x + end.x) / 2 - point.x, (first.y + end.y) / 2 - point.y); return distance < best.distance ? { index: at, distance } : best }, { index: 0, distance: Infinity }).index
    }
    update({ type, node, line: type === 'create' ? undefined : line, anchor, from, to, start: { x: event.clientX, y: event.clientY }, moved: false, index, points: line && connectorGeometry(from, to, line.data).points })
  }
  const lineGeometry = line?.data?.from && line.data.to ? connectorGeometry(line.data.from, line.data.to, line.data) : undefined
  const primarySegment = lineGeometry?.points.slice(1).reduce((best, point, index) => { const first = lineGeometry.points[index], distance = Math.hypot((first.x + point.x) / 2 - lineGeometry.middle.x, (first.y + point.y) / 2 - lineGeometry.middle.y); return Math.hypot(point.x - first.x, point.y - first.y) >= 28 && distance < best.distance ? { index, distance } : best }, { index: -1, distance: Infinity }).index
  const preview = draft?.moved && connectorGeometry(draft.from, draft.to, { ...(draft.line?.data || { mode: creationPreferences(app)?.connector?.mode || getStyleParamsFromLocalStorage().connectorMode || 'elbow', ...creationPreferences(app)?.connector }), ...(draft.bend === undefined ? {} : { bend: draft.bend }), ...(draft.offset === undefined ? {} : { offset: draft.offset }), ...(draft.curveOffset === undefined ? {} : { curveOffset: draft.curveOffset }), ...(draft.vertices === undefined ? {} : { vertices: draft.vertices }), ...(draft.type === 'source' ? { sourceId: draft.target?.id || '' } : draft.type === 'target' ? { targetId: draft.target?.id || '' } : {}), sourceAnchor: draft.type === 'source' ? draft.targetAnchor : draft.anchor || draft.line?.data?.sourceAnchor, targetAnchor: draft.type === 'target' || draft.type === 'create' ? draft.targetAnchor : draft.line?.data?.targetAnchor })
  const lineDraft = line && draft?.line === line ? draft : undefined
  const handleGeometry = lineDraft && preview ? preview : lineGeometry
  const handles = handleGeometry ? [{ type: 'source' as const, point: lineDraft?.from || line!.data!.from }, { type: 'target' as const, point: lineDraft?.to || line!.data!.to }, ...(line!.data!.mode !== 'straight' && (line!.data!.mode === 'curve' || handleGeometry.points.length === 2) ? [{ type: 'bend' as const, point: handleGeometry.middle }] : [])] : []
  const targetBox = attached(draft?.target) ? draft.target.getBounds('box', 'page') : undefined
  const boxStart = targetBox && stagePoint(targetBox), boxEnd = targetBox && stagePoint({ x: targetBox.x + targetBox.width, y: targetBox.y + targetBox.height })
  return <div ref={root} className="graph-interaction-overlay">
    {displayLine && !draft && (() => { const edge = displayLine, geometry = connectorGeometry(edge.data!.from, edge.data!.to, edge.data), a = stagePoint(connectorPagePoint(app, edge, { x: 0, y: 0 })), b = stagePoint(connectorPagePoint(app, edge, { x: 1, y: 1 })); return <svg className={`graph-route-highlight${line ? ' is-selected' : ''}`}><path d={geometry.routePath} transform={`translate(${a.x} ${a.y}) scale(${b.x - a.x} ${b.y - a.y})`} /></svg> })()}
    {boxStart && boxEnd && <div className="graph-drop-target" style={{ left: boxStart.x - 4, top: boxStart.y - 4, width: boxEnd.x - boxStart.x + 8, height: boxEnd.y - boxStart.y + 8 }}><span>{t('connector.snapTarget')}</span></div>}
    {preview && draft?.type !== 'translate' && <svg className="graph-gesture-preview"><path d={preview.path} transform={(() => { const convert = (point: AnchorPoint) => stagePoint(draft?.line ? connectorPagePoint(app, draft.line, point) : point), a = convert({ x: 0, y: 0 }), b = convert({ x: 1, y: 1 }); return `translate(${a.x} ${a.y}) scale(${b.x - a.x} ${b.y - a.y})` })()} /></svg>}
    {draft?.guides?.length ? <><svg className="graph-gesture-preview">{draft.guides.map((guide, index) => {
      const points = [draft.from, ...draft.vertices || [], draft.to], other = guide.axis === 'x' ? 'y' : 'x', lo = Math.min(...points.map(p => p[other])) - 24, hi = Math.max(...points.map(p => p[other])) + 24
      const convert = (p: AnchorPoint) => stagePoint(draft.line ? connectorPagePoint(app, draft.line, p) : p), a = convert({ [guide.axis]: guide.value, [other]: lo } as AnchorPoint), b = convert({ [guide.axis]: guide.value, [other]: hi } as AnchorPoint)
      return <line className="graph-align-guide" key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
    })}</svg><span className="graph-align-label" style={(() => { const p = stagePoint(draft.line ? connectorPagePoint(app, draft.line, draft.handlePoint || draft.to) : draft.to); return { left: p.x + 16, top: p.y + 16 } })()}>{t('connector.aligned')}</span></> : null}
    {nodes.map(node => connectionPorts.map((port, index) => { const p = stagePoint(endpoint(node, port, port)), side = port.y === 0 ? 'top' : port.x === 1 ? 'right' : port.y === 1 ? 'bottom' : 'left'; return <button type="button" key={`${node.id}-${index}`} data-node-id={node.id} data-port-x={port.x} data-port-y={port.y} className={`graph-handle graph-port${node === selected ? ' is-selected' : ''}`} aria-label={`${t('connector.startPort', { side: t(`connector.${side}`) })}${index < 4 ? '' : ` (${(side === 'top' || side === 'bottom' ? port.x : port.y) * 100}%)`}`} style={{ left: p.x, top: p.y }} onPointerDown={event => begin(event, 'create', node, port)} /> }))}
    {handles.map(handle => { const p = stagePoint(connectorPagePoint(app, line!, handle.point)); return <button type="button" key={handle.type} className={`graph-handle graph-endpoint is-${handle.type}`} aria-label={t(handle.type === 'source' ? 'connector.dragStart' : handle.type === 'target' ? 'connector.dragEnd' : 'connector.dragBend')} style={{ left: p.x, top: p.y }} onPointerDown={event => begin(event, handle.type)} /> })}
    {line && !['straight', 'curve'].includes(String(line.data?.mode)) && (() => {
      const geometry = lineDraft?.type === 'translate' && preview ? preview : connectorGeometry(line.data!.from, line.data!.to, line.data)
      return <>{geometry.points.slice(1, -1).map((point, index) => { const p = stagePoint(connectorPagePoint(app, line, point)); return <button type="button" className="graph-handle graph-vertex" key={`v${index}`} aria-label={t('connector.dragVertex', { index: index + 1 })} style={{ left: p.x, top: p.y }} onPointerDown={event => begin(event, 'vertex', undefined, undefined, index + 1)} onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); const points = geometry.points.slice(1, -1).filter((_, at) => at !== index); line.data = { ...line.data, vertices: points }; setConnectorPath(line as Path, line.data.from, line.data.to); onComplete([line]) }} /> })}{geometry.points.slice(1).map((point, index) => {
        const first = geometry.points[index], middle = { x: (first.x + point.x) / 2, y: (first.y + point.y) / 2 }
        if (geometry.points.length <= 2 || Math.hypot(point.x - first.x, point.y - first.y) < 28) return null
        const normal = Math.abs(point.x - first.x) < .000001 ? 'x' : 'y'
        const previewPoint = draft?.type === 'segment' && draft.index === index ? draft.handlePoint : undefined
        const p = stagePoint(connectorPagePoint(app, line, previewPoint || middle))
        return <button type="button" className="graph-handle graph-segment" data-axis={normal} key={`s${index}`}
          aria-label={index === primarySegment ? t('connector.dragBend') : t('connector.dragSegment', { index: index + 1 })}
          style={{ left: p.x, top: p.y, cursor: normal === 'x' ? 'ew-resize' : 'ns-resize' }}
          onPointerDown={event => begin(event, 'segment', undefined, undefined, index)} />
      })}</>
    })()}
    {selected && kind(selected) === 'mind-node' && selected.children && mindDescendants(selected as Frame).length > 0 && (() => {
      const b = selected.getBounds('box', 'page'), direction = mindDirectionOf(selected as Frame), down = direction === 'down' || direction === 'up', left = direction === 'left'
      const p = stagePoint({ x: down ? b.x + b.width / 2 : left ? b.x - 13 : b.x + b.width + 13, y: down ? direction === 'up' ? b.y - 13 : b.y + b.height + 13 : b.y + b.height / 2 })
      return <button type="button" className="graph-collapse-toggle" aria-label={t(selected.data?.collapsed ? 'mind.expand' : 'mind.collapse')} style={{ left: p.x, top: p.y }} onClick={() => onMindAction('collapse')}>{selected.data?.collapsed ? mindDescendants(selected as Frame).length : '−'}</button>
    })()}
    {picker && attached(picker.line) && (() => { const p = stagePoint(picker.point); return <div className="graph-create-picker" role="menu" aria-label={t('connector.createTarget')} style={{ left: Math.max(82, Math.min((root.current?.clientWidth || 1000) - 200, p.x + 14)), top: Math.max(80, p.y - 30) }}><span>{t('connector.createTarget')}</span>{(['rounded', 'ellipse', 'diamond', 'rect'] as const).map(shape => <button type="button" key={shape} aria-label={t(`shape.${shape}`)} onClick={() => {
      const item = makeDiagram(shape, picker.point.x - 80, picker.point.y - 40); app.tree.add(item)
      picker.line.data = { ...picker.line.data, targetId: item.id }; refreshConnectors(app); setPicker(undefined); onComplete([item])
    }}><BoardIcon name={shape} /></button>)}</div> })()}
  </div>
}
