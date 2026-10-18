import { useEffect, useState } from 'react'
import { ChildEvent, MoveEvent, PropertyEvent, ZoomEvent, type App, type Text } from 'leafer-ui'
import { InnerEditorEvent } from '@leafer-in/editor'
import { useCanvasI18n } from '../../../i18n/context'
import { allItems } from './scene'
import { readRich, richLayout } from './richText'
import { resourceRuntime } from './slateRuntime'

/** The native drawing owns appearance; these transparent controls own task input. */
export function NativeTaskCheckboxes({ app, readonly, activeKey, onChange }: { app: App; readonly: boolean; activeKey: string; onChange: () => void }) {
  const t = useCanvasI18n(), [, paint] = useState(0)
  const [texts, setTexts] = useState<Text[]>([])
  useEffect(() => {
    let frame: number | undefined
    let contentDirty = true, hasTasks = false
    const refresh = () => {
      if (!contentDirty && !hasTasks) return
      if (frame === undefined) frame = requestAnimationFrame(() => {
        frame = undefined
        // Task membership changes with content; panning only repositions known tasks.
        if (contentDirty) {
          contentDirty = false
          const next = allItems(app).filter((item): item is Text => item.tag === 'Text' && Boolean(item.data?.richText) && readRich(item as Text).some(p => p.block === 'task'))
          hasTasks = next.length > 0; setTexts(next)
        } else paint(n => n + 1)
      })
    }
    const invalidate = () => { contentDirty = true; refresh() }
    const change = (event: PropertyEvent) => {
      if ((event.target as Text).tag === 'Text' && ['data', 'text'].includes(event.attrName)) invalidate()
      else refresh()
    }
    const ids = [app.on_(MoveEvent.MOVE, refresh), app.on_(ZoomEvent.ZOOM, refresh), app.tree.on_(PropertyEvent.CHANGE, change), app.tree.on_(ChildEvent.ADD, invalidate), app.tree.on_(ChildEvent.REMOVE, invalidate), app.editor.on_(InnerEditorEvent.OPEN, refresh), app.editor.on_(InnerEditorEvent.CLOSE, refresh)]
    refresh()
    return () => { app.off_(ids); if (frame !== undefined) cancelAnimationFrame(frame) }
  }, [app])
  if (activeKey !== 'init' && !readonly) return null
  if (!texts.length) return null
  const stage = (app.view as HTMLElement).closest('.canvas-stage')!.getBoundingClientRect()
  return <>{texts.filter(text => {
    if (text.leafer !== app.tree || text.textEditing) return false
    for (let item: import('leafer-ui').IUI | undefined = text; item; item = item.parent) if (item.visible === false || item.opacity === 0) return false
    return true
  }).flatMap(text => {
    const layout = richLayout(text)
    return (layout?.checkboxes || []).filter(c => c.x >= 0 && c.y >= 0 && c.x + c.size <= Number(text.width) && c.y + c.size <= Number(text.height)).map(c => {
      const client = (x: number, y: number) => app.tree.getClientPointByWorld(text.getWorldPoint({ x, y }))
      const origin = client(c.x, c.y), horizontal = client(c.x + 1, c.y), vertical = client(c.x, c.y + 1)
      return <button key={`${text.id}:${c.index}`} type="button" className="native-task-checkbox" role="checkbox" aria-label={t('rich.block.task')} aria-checked={c.checked} disabled={readonly} style={{ width: c.size, height: c.size, transform: `matrix(${horizontal.x - origin.x},${horizontal.y - origin.y},${vertical.x - origin.x},${vertical.y - origin.y},${origin.x - stage.left},${origin.y - stage.top})` }} onPointerDown={event => { event.preventDefault(); event.stopPropagation() }} onKeyDownCapture={event => {
        event.stopPropagation()
        if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.currentTarget.click() }
      }} onDoubleClick={event => event.stopPropagation()} onClick={event => {
        event.stopPropagation()
        if (readonly || resourceRuntime(app)?.canEdit() === false || !text.leafer) return
        const value = readRich(text), paragraph = value[c.index]
        if (paragraph?.block !== 'task') return
        paragraph.checked = !paragraph.checked
        text.data = { ...text.data, richText: { version: 1, value } }
        onChange()
      }} />
    })
  })}</>
}
