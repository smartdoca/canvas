import { FullSelection } from '@icon-park/react'
import { DragEvent, type Frame } from 'leafer-ui'
import { useEffect } from 'react'
import { IconButton } from '../../../ui/Controls'
import type { AddMenuProps } from '../plugins'
import { useCanvasI18n } from '../../../../i18n/context'
import { makeContainer } from '../../thinking/containers'

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
        frame = makeContainer('section', { x: 0, y: 0, width: 480, height: 320 }, t)
        app.tree.addAt(frame, 0)
      }),
      app.on_(DragEvent.DRAG, (event: DragEvent) => { if (frame) { frame.set(event.getPageBounds());  } }),
      app.on_(DragEvent.END, () => {
        if (frame) app.editor.select(frame)
        onCreateComplete()
        app.off_(events)
      }),
    ]
    return () => app.off_(events)
  }, [active, app, onCreateComplete, t])
  return <IconButton label={t('toolbar.frame')} icon={<FullSelection />} active={active} onClick={() => onClick(FRAME_NAME)} />
}
