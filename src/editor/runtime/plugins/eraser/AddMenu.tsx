import { Erase } from '@icon-park/react'
import { IconButton } from '../../../ui/Controls'
import { DragEvent, PointerEvent, type IUI } from 'leafer-ui'
import { EditorEvent } from '@leafer-in/editor'
import { useEffect } from 'react'
import type { AddMenuProps } from '../plugins'

const NAME = 'eraser'

export function AddMenu({ app, activeKey, onClick }: AddMenuProps) {
  const active = activeKey === NAME
  useEffect(() => {
    if (!active) return
    // Keep normal hit-testing enabled so pointer events target actual elements.
    app.mode = 'normal'
    app.editor.select([])
    const selectionEvent = app.editor.on_(EditorEvent.SELECT, (event: EditorEvent) => {
      event.editor.list.forEach((item) => item.remove())
      if (event.editor.list.length) event.editor.select([])
    })
    const erase = (event: DragEvent) => {
      // Leafer has already resolved the pointer target. Re-picking with page
      // coordinates breaks after viewport pan/zoom because it mixes spaces.
      const target = event.target as IUI | undefined
      if (target && target !== app && target !== app.tree && target.parent) {
        target.remove()
      }
      // The eraser owns the pointer gesture, including clicks on empty space.
      // Otherwise Editor starts its area-selection gesture underneath it.
      event.stop()
    }
    const events = [
      app.on_(PointerEvent.BEFORE_DOWN, erase),
      app.on_(PointerEvent.BEFORE_MOVE, (event: DragEvent) => { if (event.buttons === 1) erase(event) }),
    ]
    return () => {
      app.off_(events)
      app.editor.off_(selectionEvent)
    }
  }, [active, app])
  return <IconButton label="橡皮擦 (E)" icon={<Erase />} active={active} danger onClick={() => onClick(active ? 'init' : NAME)} />
}
