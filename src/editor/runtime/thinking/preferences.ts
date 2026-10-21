import type { App, IUI, Path } from 'leafer-ui'
import type { CanvasCreationPreferences } from '../../../sdk/types'
import { applyNotePreset } from './noteStyles'
import { labelOf, setConnectorPath } from './scene'

export { isCanvasViewPreferences as validViewPreferences, isCanvasCreationPreferences as validCreationPreferences } from '../../../sdk/preferences'
import { isCanvasCreationPreferences as validCreationPreferences } from '../../../sdk/preferences'
const creation = new WeakMap<App, CanvasCreationPreferences>()
export const creationPreferences = (app: App) => creation.get(app)
export const setCreationPreferences = (app: App, value?: CanvasCreationPreferences) => { if (value && validCreationPreferences(value)) creation.set(app, value); else creation.delete(app) }
export function applyConnectorCreationStyle(app: App, line: IUI) {
  const style = creation.get(app)?.connector
  if (!style) return
  if (style.stroke !== undefined) line.stroke = style.stroke
  if (style.strokeWidth !== undefined) line.strokeWidth = style.strokeWidth
  if (style.lineDash !== undefined) line.dashPattern = style.lineDash === 'dashed' ? [8, 5] : style.lineDash === 'dotted' ? [2, 4] : []
  for (const key of ['startHead', 'endHead'] as const) if (style[key] !== undefined) line.data = { ...line.data, [key]: style[key] }
  setConnectorPath(line as Path, line.data!.from, line.data!.to)
}
export function applyNoteCreationStyle(app: App, note: IUI) {
  const style = creation.get(app)?.note
  if (!style) return
  if (style.preset) applyNotePreset(note, style.preset)
  if (style.fill) note.fill = style.fill
  const label = labelOf(note)
  if (!label) return
  if (style.fontSize !== undefined) label.fontSize = style.fontSize
  if (style.fontColor !== undefined) label.fill = style.fontColor
  if (style.textAlign !== undefined) label.textAlign = style.textAlign === 'justify' ? 'both' : style.textAlign
  if (style.verticalAlign !== undefined) label.verticalAlign = style.verticalAlign
}
