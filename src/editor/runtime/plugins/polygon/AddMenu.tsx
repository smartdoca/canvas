import { Triangle } from '@icon-park/react'
import { IconButton } from '../../../ui/Controls'
import { DragEvent, Polygon } from 'leafer-ui'
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
    let shape: Polygon | undefined
    const events = [
      app.on_(DragEvent.START, () => {
        shape = new Polygon({ name: NAME, sides: 5, editable: true, ...getStyleParamByKeyList(STYPE_CONTROLL_KEYS) })
        app.tree.add(shape)
      }),
      app.on_(DragEvent.DRAG, (event: DragEvent) => { if (shape) { shape.set(event.getPageBounds()); updateCurrentRoughPreview(shape) } }),
      app.on_(DragEvent.END, () => {
        if (shape) applyCurrentRoughStyle(shape)
        if (shape) app.editor.select(shape)
        onCreateComplete()
        app.off_(events)
      }),
    ]
    return () => app.off_(events)
  }, [active, app, onCreateComplete])
  return <IconButton label={t('toolbar.polygon')} icon={<Triangle />} active={active} onClick={() => onClick(NAME)} />
}
