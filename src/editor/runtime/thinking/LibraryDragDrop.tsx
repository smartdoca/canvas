import { applyConnectorCreationStyle, applyNoteCreationStyle } from './preferences'
import { useEffect, useRef, useState } from 'react'
import { Frame, Text, type App, type IUI } from 'leafer-ui'
import type { MessageKey } from '../../../i18n/en'
import { useCanvasI18n } from '../../../i18n/context'
import { makeConnector, makeDiagram, makeMindMap, makeTable, type DiagramShape, type MindLayout, type RouteMode } from './scene'
import { createTemplate, type TemplateId } from './templates'
import { getStyleParamsFromLocalStorage } from '../utils/styleLocalStorage'
import { applyNotePreset } from './noteStyles'
import { BoardIcon } from './BoardIcon'
import { containerBounds, containerType, makeContainer } from './containers'

type Drag = { key: string; x: number; y: number; moved: boolean; label: string }
/** Pointer dragging works with mouse, pen and touch; a click still activates the tool. */
export function LibraryDragDrop({ app, onComplete }: { app: App; onComplete: (items: IUI[]) => void }) {
  const t = useCanvasI18n(), ref = useRef<Drag>(), [drag, setDrag] = useState<Drag>()
  useEffect(() => {
    const host = (app.view as HTMLElement).closest('.canvas-host')!, canvas = host.closest('[data-aidcanvas]')!
    let origin = { x: 0, y: 0 }, suppressClick: ((event: MouseEvent) => void) | undefined
    const clear = () => { ref.current = undefined; setDrag(undefined) }
    const down = (event: PointerEvent) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-canvas-insert]')
      if (event.button !== 0 || !button || !canvas.contains(button)) return
      const key = button.dataset.canvasInsert!
      ref.current = { key, x: event.clientX, y: event.clientY, moved: false, label: button.getAttribute('aria-label') || button.title || button.textContent || '' }
      origin = { x: event.clientX, y: event.clientY }
    }
    const move = (event: PointerEvent) => {
      const current = ref.current
      if (!current) return
      current.moved ||= Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 6
      if (!current.moved) return
      current.x = event.clientX; current.y = event.clientY
      setDrag({ ...current }); event.preventDefault(); event.stopPropagation()
    }
    const up = (event: PointerEvent) => {
      const current = ref.current
      clear()
      if (!current?.moved) return
      event.preventDefault(); event.stopImmediatePropagation()
      suppressClick = click => { click.preventDefault(); click.stopImmediatePropagation(); document.removeEventListener('click', suppressClick!, true) }
      document.addEventListener('click', suppressClick, true)
      window.setTimeout(() => { if (suppressClick) document.removeEventListener('click', suppressClick, true) }, 0)
      const hit = document.elementFromPoint(event.clientX, event.clientY)
      if (!hit || !host.contains(hit)) return
      app.editor.closeInnerEditor()
      const p = app.tree.getInnerPoint(app.tree.getWorldPointByClient(event)), [type, value, extra] = current.key.split(':')
      let item: IUI | undefined
      if (type === 'diagram') item = makeDiagram(value as DiagramShape, p.x - 80, p.y - 40)
      if (type === 'table') item = makeTable(p.x - Number(extra) * 70, p.y - Number(value) * 23, Number(value), Number(extra))
      if (type === 'mindmap') item = makeMindMap(p.x - 80, p.y - 24, t('mind.root'), t('mind.branch'), (value || 'right') as MindLayout)
      if (type === 'connector') { item = makeConnector({ x: p.x - 80, y: p.y }, { x: p.x + 80, y: p.y + 60 }, value as RouteMode); applyConnectorCreationStyle(app, item) }
      if (type === 'template') item = createTemplate(value as TemplateId, p.x, p.y, key => t(key as MessageKey))
      if (type === 'sticker') item = new Text({ name: 'text', text: current.key.slice(8), x: p.x - 26, y: p.y - 26, fontSize: 52, editable: true })
      if (type === 'text') item = new Text({ name: 'text', text: t('board.textPlaceholder'), x: p.x, y: p.y, fontSize: 20, fill: '#1f2329', editable: true })
      const preset = containerType(current.key)
      if (preset) item = makeContainer(preset, containerBounds(preset, p), t)
      if (type === 'note') {
        const defaults = getStyleParamsFromLocalStorage(), fill = value?.startsWith('#') ? value : defaults.fill || '#fff2a8'
        item = new Frame({ name: 'note', data: { kind: 'note' }, x: p.x - 100, y: p.y - 100, width: 200, height: 200, fill, editable: true, hitChildren: false, shadow: [{ x: 0, y: 2, blur: 3, color: '#45371518' }, { x: 1, y: 9, blur: 16, color: '#45371524' }] })
        item.add(new Text({ name: 'text', text: '', x: 16, y: 16, width: 168, height: 168, fontSize: 24, lineHeight: { type: 'percent', value: 1.35 }, fill: '#1f2329', textAlign: 'center', verticalAlign: 'middle', editable: true }))
        applyNotePreset(item, String(defaults.notePreset || '')); applyNoteCreationStyle(app, item)
        if (value) { if (value.startsWith('#')) item.fill = value; else applyNotePreset(item, value) }
      }
      if (item) { if (preset) app.tree.addAt(item, 0); else app.tree.add(item); onComplete([item]) }
    }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && ref.current?.moved) { event.preventDefault(); event.stopImmediatePropagation(); clear() } }
    document.addEventListener('pointerdown', down, true); document.addEventListener('pointermove', move, true); document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', clear, true); window.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointermove', move, true); document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', clear, true); window.removeEventListener('keydown', key, true); if (suppressClick) document.removeEventListener('click', suppressClick, true) }
  }, [app, onComplete, t])
  return drag ? <div className="library-drag-preview" style={{ left: drag.x, top: drag.y }}><BoardIcon name={drag.key.startsWith('table') ? 'table' : drag.key.startsWith('diagram') ? drag.key.split(':')[1] : drag.key.split(':')[0]} size={28} /><span>{drag.label}</span></div> : null
}
