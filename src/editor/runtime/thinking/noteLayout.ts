import { Text, type IUI } from 'leafer-ui'
import { ancestor, labelOf } from './scene'
import { richLayout } from './richText'
import { setRichScroll } from './richBounds'

const insets = new WeakMap<IUI, { right: number; bottom: number }>()
const fitting = new WeakSet<IUI>()
export function prepareNoteLayout(item?: IUI) {
  const note = ancestor(item, 'note'), label = note && labelOf(note)
  if (!note || !label || insets.has(note)) return
  insets.set(note, { right: Math.max(0, Number(note.width) - Number(label.x) - Number(label.width)), bottom: Math.max(0, Number(note.height) - Number(label.y) - Number(label.height)) })
  // A native drag constraint derived from current content; it is never serialized.
  Object.defineProperty(note, 'heightRange', { configurable: true, get: () => ({ min: noteMinimumHeight(note) }) })
}
export function noteMinimumHeight(note: IUI) {
  const label = labelOf(note)
  return label instanceof Text ? Math.ceil((richLayout(label, true)?.height || Number(label.fontSize) * 1.5) + Number(label.y || 0) + (insets.get(note)?.bottom ?? 16)) : 1
}

/** Content can grow a note. Manual extra space stays until the user resizes it. */
export function fitNoteContent(item?: IUI) {
  const note = ancestor(item, 'note'), label = note && labelOf(note)
  if (!note || !(label instanceof Text) || fitting.has(note)) return
  prepareNoteLayout(note)
  fitting.add(note)
  try {
    const inset = insets.get(note)!
    const width = Math.max(1, Number(note.width) - Number(label.x || 0) - inset.right)
    if (label.width !== width) label.width = width
    const height = Math.max(Number(note.height || 0), noteMinimumHeight(note))
    if (note.height !== height) note.height = height
    const available = Math.max(1, height - Number(label.y || 0) - inset.bottom)
    if (label.height !== available) label.height = available
    setRichScroll(label, 0)
  } finally { fitting.delete(note) }
}
