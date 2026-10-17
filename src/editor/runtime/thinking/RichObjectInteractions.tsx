import { useEffect, useRef, useState } from 'react'
import { MoveEvent, PointerEvent as LeaferPointerEvent, PropertyEvent, ZoomEvent, type App, type InteractionBase, type IUI } from 'leafer-ui'
import { EditorEvent, InnerEditorEvent } from '@leafer-in/editor'
import { useCanvasI18n } from '../../../i18n/context'
import { ancestor, kind, labelOf, pickConnectable, refreshConnectors } from './scene'
import { richContainer } from './richBounds'
import { BoardIcon } from './BoardIcon'

/** A shared object handle; rich bodies always own text/cell gestures. */
export function RichObjectInteractions({ app, activeKey, selection, onComplete }: { app: App; activeKey: string; selection: IUI[]; onComplete: (items: IUI[]) => void }) {
  const t = useCanvasI18n(), [, paint] = useState(0), [delta, setDelta] = useState<{ x: number; y: number }>()
  const gesture = useRef<{ owner: IUI; start: { x: number; y: number }; x: number; y: number }>()
  useEffect(() => {
    if (activeKey !== 'init') return
    let noteClick: { owner: IUI; x: number; y: number; selected: boolean; moved: boolean } | undefined
    let noteTarget = false
    const host = (app.view as HTMLElement).closest('.canvas-host')!
    const clientToParent = (owner: IUI, event: { clientX: number; clientY: number }) => owner.parent!.getInnerPoint(app.tree.getWorldPointByClient(event))
    const down = (event: PointerEvent) => {
      noteTarget = false
      if (event.button !== 0 || !(event.target instanceof HTMLElement) || !host.contains(event.target) || event.target.closest('.canvas-slate-mount,button,input')) return
      const point = app.tree.getInnerPoint(app.tree.getWorldPointByClient(event))
      const candidate = pickConnectable(app, point), bounds = candidate?.getBounds('box', 'page')
      const owner = candidate && bounds && point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height ? candidate : undefined
      const wasEditing = app.editor.innerEditing
      const editOwner = richContainer(app.editor.innerEditor?.editTarget)
      if (wasEditing && editOwner && ['note', 'card'].includes(kind(editOwner) || editOwner.name || '')) {
        // Leafer can hit-test before the DOM editor restores tree interaction.
        // Apply this outside click explicitly so blank clicks really deselect.
        app.editor.closeInnerEditor(); app.editor.select(owner || [])
        ;(app.interaction as InteractionBase | undefined)?.pointerWaitCancel()
      }
      if (!owner || !['note', 'card'].includes(kind(owner) || owner.name || '')) return
      const text = owner && labelOf(owner)
      if (!text) return
      if ((kind(owner) || owner.name) === 'note') {
        noteTarget = true
        noteClick = { owner, x: event.clientX, y: event.clientY, selected: !wasEditing && app.editor.list.length === 1 && app.editor.list[0] === owner, moved: false }
        return
      }
      event.preventDefault(); event.stopImmediatePropagation()
      app.editor.closeInnerEditor(); app.editor.select(text); app.editor.openInnerEditor(text, true)
      ;(app.editor.innerEditor as unknown as { placeCaretAtClient?: (point: typeof event) => void }).placeCaretAtClient?.(event)
    }
    const move = (event: PointerEvent) => {
      if (noteClick && Math.hypot(event.clientX - noteClick.x, event.clientY - noteClick.y) > 4) noteClick.moved = true
      const current = gesture.current
      if (!current) return
      if (!current.owner.leafer) { gesture.current = undefined; setDelta(undefined); return }
      const point = clientToParent(current.owner, event)
      current.x = point.x - current.start.x; current.y = point.y - current.start.y
      setDelta({ x: current.x, y: current.y }); event.preventDefault(); event.stopImmediatePropagation()
    }
    const cancel = () => { noteClick = undefined; gesture.current = undefined; setDelta(undefined) }
    const up = (event: PointerEvent) => {
      const click = noteClick; noteClick = undefined
      if (click?.selected && !click.moved) queueMicrotask(() => {
        if (!click.owner.leafer || app.editor.innerEditing || app.editor.list.length !== 1 || app.editor.list[0] !== click.owner) return
        const text = labelOf(click.owner)
        if (!text) return
        app.editor.select(text); app.editor.openInnerEditor(text, true)
        ;(app.editor.innerEditor as unknown as { placeCaretAtClient?: (point: typeof event) => void }).placeCaretAtClient?.(event)
      })
      const current = gesture.current
      if (!current) return
      event.preventDefault(); event.stopImmediatePropagation(); cancel()
      if (!current.owner.leafer || !current.x && !current.y) return
      current.owner.set({ x: Number(current.owner.x || 0) + current.x, y: Number(current.owner.y || 0) + current.y })
      refreshConnectors(app); onComplete([current.owner])
    }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && gesture.current) { event.preventDefault(); event.stopImmediatePropagation(); cancel() } }
    const ids = [app.on_(MoveEvent.MOVE, () => paint(n => n + 1)), app.on_(ZoomEvent.ZOOM, () => paint(n => n + 1)), app.tree.on_(PropertyEvent.CHANGE, () => paint(n => n + 1)), app.editor.on_(EditorEvent.SELECT, () => paint(n => n + 1)), app.editor.on_(InnerEditorEvent.OPEN, () => paint(n => n + 1)), app.editor.on_(InnerEditorEvent.CLOSE, () => paint(n => n + 1))]
    ids.push(app.on_([LeaferPointerEvent.DOUBLE_TAP, LeaferPointerEvent.DOUBLE_CLICK], (event: LeaferPointerEvent) => { if (noteTarget) event.stop() }, undefined, true))
    document.addEventListener('pointerdown', down, true); document.addEventListener('pointermove', move, true); document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', cancel, true); window.addEventListener('blur', cancel); window.addEventListener('keydown', key, true)
    return () => { app.off_(ids); document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointermove', move, true); document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', cancel, true); window.removeEventListener('blur', cancel); window.removeEventListener('keydown', key, true) }
  }, [activeKey, app, onComplete])
  if (activeKey !== 'init') return null
  const inner = (app.editor.innerEditor as unknown as { editTarget?: IUI } | undefined)?.editTarget
  const selected = inner && app.editor.innerEditing ? inner : selection[0]
  const owner = ancestor(selected, 'table') || richContainer(selected)
  if (!owner?.leafer || kind(owner) === 'note' || owner.name === 'note') return null
  const bounds = owner.getBounds('box', 'world'), stage = (app.view as HTMLElement).closest('.canvas-stage')!.getBoundingClientRect(), p = app.tree.getClientPointByWorld(bounds)
  const handleOffset = kind(owner) === 'table' ? 44 : 28
  const moved = delta ? owner.parent!.getWorldPoint({ x: Number(owner.x || 0) + delta.x, y: Number(owner.y || 0) + delta.y }) : undefined
  const target = moved && app.tree.getClientPointByWorld(moved)
  return <div className="rich-object-overlay">
    <button type="button" className="rich-object-move-handle" aria-label={t('rich.moveObject')} title={t('rich.moveObject')} style={{ left: Math.max(80, p.x - stage.left - handleOffset), top: Math.max(72, p.y - stage.top - handleOffset) }} onPointerDown={event => {
      event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
      app.editor.closeInnerEditor(); app.editor.select(owner)
      const start = owner.parent!.getInnerPoint(app.tree.getWorldPointByClient(event))
      gesture.current = { owner, start, x: 0, y: 0 }
    }}><BoardIcon name="hand" size={16} /></button>
    {target && <div className="rich-object-drag-preview" style={{ left: target.x - stage.left, top: target.y - stage.top, width: bounds.width, height: bounds.height }} />}
  </div>
}
