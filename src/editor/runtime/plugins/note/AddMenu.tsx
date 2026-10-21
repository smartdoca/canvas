import { applyNoteCreationStyle } from '../../thinking/preferences'
import { useEffect } from 'react'
import { Frame, PointerEvent, Text } from 'leafer-ui'
import type { AddMenuProps } from '../plugins'
import { IconButton } from '../../../ui/Controls'
import { useCanvasI18n } from '../../../../i18n/context'
import { getStyleParamsFromLocalStorage } from '../../utils/styleLocalStorage'
import { applyNotePreset } from '../../thinking/noteStyles'

function NoteIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4h14v10l-6 6H5V4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M13 20v-6h6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
}

function AddMenu({ app, activeKey, onClick, onCreateComplete }: AddMenuProps) {
  const t = useCanvasI18n()
  const active = activeKey === 'note' || activeKey.startsWith('note:')
  useEffect(() => {
    if (!active) return
    app.mode = 'draw'
    const event = app.on_(PointerEvent.TAP, (event: PointerEvent) => {
      const point = event.getPagePoint()
      const style = getStyleParamsFromLocalStorage()
      const note = new Frame({ name: 'note', hitChildren: false, overflow: 'hide', data: { kind: 'note' }, x: point.x - 100, y: point.y - 100, width: 200, height: 200, fill: typeof style.fill === 'string' ? style.fill : '#fff2a8', cornerRadius: 2, editable: true, opacity: Number(style.opacity ?? 1), shadow: [{ x: 0, y: 2, blur: 3, color: '#45371518' }, { x: 1, y: 9, blur: 16, color: '#45371524' }] })
      const text = new Text({ name: 'text', text: '', x: 16, y: 16, width: 168, height: 168, fontSize: 24, lineHeight: { type: 'percent', value: 1.35 }, textAlign: 'center', verticalAlign: 'middle', fill: '#1d1d1d', editable: true })
      note.add(text)
      applyNotePreset(note, String(style.notePreset || ''))
      applyNoteCreationStyle(app, note)
      if (activeKey.startsWith('note:')) applyNotePreset(note, activeKey.slice(5))
      app.tree.add(note)
      onCreateComplete()
      app.editor.select(note)
    })
    return () => app.off_(event)
  }, [active, activeKey, app, onCreateComplete])
  return <IconButton label={t('toolbar.note')} icon={<NoteIcon />} active={active} onClick={() => onClick('note')} />
}

export { AddMenu }
