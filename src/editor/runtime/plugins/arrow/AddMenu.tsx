import { ArrowRight } from '@icon-park/react'
import { IconButton } from '../../../ui/Controls'
import { DragEvent } from 'leafer-ui'
import { Arrow } from '@leafer-in/arrow'
import { useEffect } from 'react'
import type { AddMenuProps } from '../plugins'
import { getStyleParamByKeyList } from '../../utils/styleLocalStorage'
import { NAME, STYPE_CONTROLL_KEYS } from './const'
import { applyCurrentRoughStyle, updateCurrentRoughPreview } from '../../utils/roughStyle'

export function AddMenu({ app, activeKey, onClick, onCreateComplete }: AddMenuProps) {
  const active = activeKey === NAME
  useEffect(() => {
    if (!active) return
    app.mode = 'draw'
    let arrow: Arrow | undefined
    const events = [
      app.on_(DragEvent.START, (event: DragEvent) => {
        const point = event.getPagePoint()
        arrow = new Arrow({ name: NAME, x: point.x, y: point.y, toPoint: { x: 0, y: 0 }, endArrow: 'angle', editable: true, hitRadius: 8, ...getStyleParamByKeyList(STYPE_CONTROLL_KEYS) })
        app.tree.add(arrow)
      }),
      app.on_(DragEvent.DRAG, (event: DragEvent) => {
        if (!arrow) return
        const point = event.getPagePoint()
        arrow.toPoint = { x: point.x - (arrow.x || 0), y: point.y - (arrow.y || 0) }
        updateCurrentRoughPreview(arrow)
      }),
      app.on_(DragEvent.END, () => {
        if (arrow) applyCurrentRoughStyle(arrow)
        if (arrow) app.editor.select(arrow)
        onCreateComplete()
        app.off_(events)
      }),
    ]
    return () => app.off_(events)
  }, [active, app, onCreateComplete])
  return <IconButton label="箭头 (A)" icon={<ArrowRight />} active={active} onClick={() => onClick(NAME)} />
}
