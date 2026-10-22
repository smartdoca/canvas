import { applyConnectorCreationStyle } from './preferences'
import { useEffect, useState } from 'react'
import { ownsCanvasCommands } from '../utils/keyboardOwnership'
import { PointerEvent, Text, type Path, type App, type IUI } from 'leafer-ui'
import { ancestor, connectorLabel, isConnector, kind, labelOf, makeConnector, makeDiagram, makeMindMap, makeTable, mindNode, pickConnectable, endpoint, shapePath, nearestPort, setConnectorPath, connectorGeometry, type AnchorPoint, type DiagramShape, type RouteMode } from './scene'
import { useCanvasI18n } from '../../../i18n/context'
import { containerBounds, containerType, isContainerPart, makeContainer } from './containers'
import { PhoneFramePreview } from './PhoneFramePreview'

export function ThinkingTools({ app, activeKey, onComplete }: { app: App; activeKey: string; onComplete: (selection: IUI[], reveal?: IUI) => void }) {
  const t = useCanvasI18n()
  const [preview, setPreview] = useState<{ start: AnchorPoint; point: AnchorPoint; source?: IUI; dragged: boolean }>()
  useEffect(() => {
    const preset = containerType(activeKey)
    const active = Boolean(preset) || /^(diagram:|table:|sticker:|mindmap|connector:)/.test(activeKey)
    if (!active) return
    app.mode = 'draw'
    const host = (app.view as HTMLElement).closest('.canvas-host')!
    let gesture: { start: AnchorPoint; point: AnchorPoint; source?: IUI; dragged: boolean; clicking?: boolean } | undefined
    const pagePoint = (event: globalThis.PointerEvent) => app.tree.getInnerPoint(app.tree.getWorldPointByClient(event))
    const finish = () => {
      if (!gesture) return
      const { point, start, dragged, source } = gesture
      let item: IUI | undefined
      if (activeKey.startsWith('mindmap')) item = makeMindMap(point.x - 80, point.y - 24, t('mind.root'), t('mind.branch'), (activeKey.split(':')[1] || 'right') as import('./scene').MindLayout)
      if (activeKey.startsWith('diagram:')) item = makeDiagram(activeKey.split(':')[1] as DiagramShape, dragged ? Math.min(start.x, point.x) : point.x - 80, dragged ? Math.min(start.y, point.y) : point.y - 40, '', dragged ? Math.max(40, Math.abs(point.x - start.x)) : 160, dragged ? Math.max(32, Math.abs(point.y - start.y)) : 80)
      if (activeKey.startsWith('table:')) { const [, rows, columns] = activeKey.split(':'); item = makeTable(point.x - Number(columns) * 70, point.y - Number(rows) * 23, Number(rows), Number(columns)) }
      if (activeKey.startsWith('sticker:')) item = new Text({ name: 'text', text: activeKey.slice(8), x: point.x - 26, y: point.y - 26, fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif', fontSize: 52, editable: true })
      if (preset) item = makeContainer(preset, dragged ? containerBounds(preset, start, point) : containerBounds(preset, point), t)
      if (activeKey.startsWith('connector:')) {
        const target = pickConnectable(app, point), end = target === source ? undefined : target
        const sourceAnchor = source && nearestPort(source, start), targetAnchor = end && nearestPort(end, point)
        const from = source ? endpoint(source, point, sourceAnchor) : start, to = end ? endpoint(end, start, targetAnchor) : point
        item = makeConnector(from, to, activeKey.split(':')[1] as RouteMode, source?.id, end?.id)
        item.data = { ...item.data, sourceAnchor, targetAnchor }; applyConnectorCreationStyle(app, item); setConnectorPath(item as Path, from, to)
      }
      gesture = undefined; setPreview(undefined)
      if (!item) return
      if (preset) app.tree.addAt(item, 0); else app.tree.add(item)
      app.mode = 'normal'
      if (kind(item) === 'mindmap') onComplete([item.children!.find(node => node.data?.root)!], item)
      else if (kind(item) === 'table') onComplete([item.children![0]], item)
      else onComplete([item], preset ? item : undefined)
    }
    const down = (event: globalThis.PointerEvent) => {
      if (event.button !== 0 || !host.contains(event.target as globalThis.Node)) return
      event.preventDefault(); event.stopImmediatePropagation()
      const point = pagePoint(event)
      if (gesture?.clicking) { gesture.point = point; finish(); return }
      gesture = { start: point, point, source: activeKey.startsWith('connector:') ? pickConnectable(app, point) : undefined, dragged: false }
      setPreview({ ...gesture })
    }
    const move = (event: globalThis.PointerEvent) => {
      if (!gesture) return
      event.preventDefault(); gesture.point = pagePoint(event)
      gesture.dragged ||= Math.hypot(gesture.point.x - gesture.start.x, gesture.point.y - gesture.start.y) * Number(app.tree.scaleX || 1) > 4
      setPreview({ ...gesture })
    }
    const up = (event: globalThis.PointerEvent) => {
      if (!gesture || gesture.clicking) return
      event.preventDefault(); event.stopImmediatePropagation(); gesture.point = pagePoint(event)
      if (!gesture.dragged && activeKey.startsWith('connector:')) { gesture.clicking = true; return }
      finish()
    }
    const cancel = () => { gesture = undefined; setPreview(undefined) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel() }
    document.addEventListener('pointerdown', down, true); document.addEventListener('pointermove', move, true); document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', cancel, true); window.addEventListener('keydown', key, true)
    return () => { cancel(); document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointermove', move, true); document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', cancel, true); window.removeEventListener('keydown', key, true) }
  }, [activeKey, app, onComplete, t])

  useEffect(() => {
    const event = app.on_(PointerEvent.DOUBLE_CLICK, (event: PointerEvent) => {
      if (app.mode !== 'normal') return
      const target = event.target as IUI
      if (target.tag === 'Text' && isContainerPart(target)) {
        app.editor.select(target); app.editor.openInnerEditor(target, true); event.stop(); return
      }
      if (isConnector(target)) {
        const label = connectorLabel(app, target)
        app.editor.select(label); app.editor.openInnerEditor(label, true); event.stop(); return
      }
      const node = mindNode(target) || ancestor(target, 'diagram-node') || ancestor(target, 'table-cell') || ancestor(target, 'connector-label') || ancestor(target, 'note') || ancestor(target, 'card')
      const label = node && labelOf(node)
      if (!label) return
      app.editor.select(label)
      app.editor.openInnerEditor(label, true)
      event.stop()
    })
    const enter = (event: KeyboardEvent) => {
      const item = app.editor.list[0]
      if (app.editor.innerEditing || event.isComposing || event.keyCode === 229 || !ownsCanvasCommands(event, app.view as HTMLElement)) return
      if (event.key === 'Enter' && isConnector(item)) {
        event.preventDefault(); event.stopImmediatePropagation()
        const label = connectorLabel(app, item); app.editor.select(label); app.editor.openInnerEditor(label, true); return
      }
      const node = ancestor(item, 'diagram-node') || ancestor(item, 'note') || ancestor(item, 'card')
      if (!node || event.metaKey || event.ctrlKey || event.altKey || event.key === ' ' || event.key.length !== 1 && !['Enter', 'F2'].includes(event.key)) return
      const label = labelOf(node)
      if (label) { if (event.key.length !== 1) event.preventDefault(); event.stopImmediatePropagation(); app.editor.select(label); app.editor.openInnerEditor(label, true) }

    }
    window.addEventListener('keydown', enter, true)
    return () => { app.off_(event); window.removeEventListener('keydown', enter, true) }
  }, [app])
  if (!preview || !preview.dragged) return null
  const box = (app.view as HTMLElement).closest('.canvas-stage')!.getBoundingClientRect()
  const toStage = (point: AnchorPoint) => { const p = app.tree.getClientPointByWorld(app.tree.getWorldPoint(point)); return { x: p.x - box.left, y: p.y - box.top } }
  if (activeKey.startsWith('connector:')) {
    const target = pickConnectable(app, preview.point), end = target === preview.source ? undefined : target
    const anchor = preview.source && nearestPort(preview.source, preview.start)
    const targetAnchor = end && nearestPort(end, preview.point)
    const from = preview.source ? endpoint(preview.source, preview.point, anchor) : preview.start, to = end ? endpoint(end, preview.start, targetAnchor) : preview.point
    const path = connectorGeometry(from, to, { mode: activeKey.split(':')[1], sourceAnchor: anchor, targetAnchor }).path, origin = toStage({ x: 0, y: 0 })
    return <svg className="thinking-insert-preview"><path d={path} transform={`translate(${origin.x} ${origin.y}) scale(${app.tree.scaleX || 1} ${app.tree.scaleY || 1})`} fill="none" stroke="#3370ff" strokeWidth="1.5" /></svg>
  }
  const preset = containerType(activeKey)
  if (preset) {
    const bounds = containerBounds(preset, preview.start, preview.point), point = toStage(bounds), scale = Math.abs(Number(app.tree.scaleX || 1))
    if (preset === 'phone') return <svg className="thinking-insert-preview"><g transform={`translate(${point.x} ${point.y}) scale(${scale})`} opacity=".75"><PhoneFramePreview width={bounds.width} height={bounds.height} /></g></svg>
    return <svg className="thinking-insert-preview"><rect x={point.x} y={point.y} width={bounds.width * scale} height={bounds.height * scale} fill="#ffffff88" stroke="#3370ff" strokeWidth="1.5" strokeDasharray="6 4" /></svg>
  }
  if (!activeKey.startsWith('diagram:')) return null
  const a = toStage(preview.start), b = toStage(preview.point), width = Math.max(40, Math.abs(b.x - a.x)), height = Math.max(32, Math.abs(b.y - a.y)), shape = activeKey.split(':')[1] as DiagramShape
  return <svg className="thinking-insert-preview"><g transform={`translate(${Math.min(a.x, b.x)} ${Math.min(a.y, b.y)})`} fill="#ffffffcc" stroke="#3370ff" strokeWidth="1.5">{shape === 'ellipse' ? <ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} /> : shapePath(shape, width, height) ? <path d={shapePath(shape, width, height)} /> : <rect width={width} height={height} rx={shape === 'rounded' ? 8 : 0} />}</g></svg>
}
