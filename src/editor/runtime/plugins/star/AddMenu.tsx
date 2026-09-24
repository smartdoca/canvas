import { Star as StarIcon } from '@icon-park/react'
import { IconButton } from '../../../ui/Controls'
import { DragEvent, Star as LeaferStar } from 'leafer-ui'
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
    let shape: LeaferStar | undefined
    const events = [
      app.on_(DragEvent.START, () => {
        shape = new LeaferStar({ name: NAME, corners: 5, innerRadius: 0.45, editable: true, ...getStyleParamByKeyList(STYPE_CONTROLL_KEYS) })
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
  return <IconButton label="星形 (S)" icon={<StarIcon />} active={active} onClick={() => onClick(NAME)} />
}
