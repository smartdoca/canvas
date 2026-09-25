import { FullSelection } from '@icon-park/react'
import { DragEvent, Frame, Text } from 'leafer-ui'
import { useEffect } from 'react'
import { IconButton } from '../../../ui/Controls'
import type { AddMenuProps } from '../plugins'
import { applyCurrentRoughStyle, updateCurrentRoughPreview } from '../../utils/roughStyle'
import { useCanvasI18n } from '../../../../i18n/context'

export const FRAME_NAME = 'frame'

export function AddMenu({ app, activeKey, onClick, onCreateComplete }: AddMenuProps) {
  const active = activeKey === FRAME_NAME
  const t = useCanvasI18n()
  useEffect(() => {
    if (!active) return
    app.mode = 'draw'
    let frame: Frame | undefined
    const events = [
      app.on_(DragEvent.START, () => {
        frame = new Frame({ name: FRAME_NAME, editable: true, fill: '#ffffff', hitFill: 'path', hitStroke: 'path', stroke: '#8b84ee', strokeWidth: 1, dashPattern: [8, 4], cornerRadius: 8, overflow: 'hide', data: { title: 'Frame' } })
        frame.add(new Text({ name: 'frame-title', text: 'Frame', x: 10, y: 8, fill: '#6257e8', fontSize: 13, fontWeight: 600, editable: true }))
        app.tree.add(frame)
      }),
      app.on_(DragEvent.DRAG, (event: DragEvent) => { if (frame) { frame.set(event.getPageBounds()); updateCurrentRoughPreview(frame) } }),
      app.on_(DragEvent.END, () => {
        if (frame) applyCurrentRoughStyle(frame)
        if (frame) app.editor.select(frame)
        onCreateComplete()
        app.off_(events)
      }),
    ]
    return () => app.off_(events)
  }, [active, app, onCreateComplete])
  return <IconButton label={t('toolbar.frame')} icon={<FullSelection />} active={active} onClick={() => onClick(FRAME_NAME)} />
}
