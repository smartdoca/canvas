import { Minus } from '@icon-park/react'
import { IconButton } from '../../../ui/Controls'
import { DragEvent, Line } from 'leafer-ui'
import { useEffect } from 'react'
import type { AddMenuProps } from '../plugins'
import { getStyleParamByKeyList } from '../../utils/styleLocalStorage'
import { NAME, STYPE_CONTROLL_KEYS } from './const'
import { applyCurrentRoughStyle, updateCurrentRoughPreview } from '../../utils/roughStyle'
import { useCanvasI18n } from '../../../../i18n/context'

export function AddMenu({ app, activeKey, onClick, onCreateComplete }: AddMenuProps) {
  const active = activeKey === NAME
  const t = useCanvasI18n()
  useEffect(() => {
    if (!active) return
    app.mode = 'draw'
    let line: Line | undefined
    const events = [
      app.on_(DragEvent.START, (event: DragEvent) => {
        const point = event.getPagePoint()
        line = new Line({ name: NAME, x: point.x, y: point.y, toPoint: { x: 0, y: 0 }, editable: true, hitRadius: 8, ...getStyleParamByKeyList(STYPE_CONTROLL_KEYS) })
        app.tree.add(line)
      }),
      app.on_(DragEvent.DRAG, (event: DragEvent) => {
        if (!line) return
        const point = event.getPagePoint()
        line.toPoint = { x: point.x - (line.x || 0), y: point.y - (line.y || 0) }
        updateCurrentRoughPreview(line)
      }),
      app.on_(DragEvent.END, () => {
        if (line) applyCurrentRoughStyle(line)
        if (line) app.editor.select(line)
        onCreateComplete()
        app.off_(events)
      }),
    ]
    return () => app.off_(events)
  }, [active, app, onCreateComplete])
  return <IconButton label={t('toolbar.line')} icon={<Minus />} active={active} onClick={() => onClick(NAME)} />
}
