import type { IUI } from 'leafer-ui'
import { ancestor, labelOf } from './scene'

import { notePresets } from '../../core/notePresets'
export { notePresets } from '../../core/notePresets'

export function applyNotePreset(item: IUI, presetId: string) {
  const note = ancestor(item, 'note'), preset = notePresets.find(p => p.id === presetId)
  if (!note || !preset) return false
  note.set({ fill: preset.fill, stroke: 'stroke' in preset ? preset.stroke : undefined, strokeWidth: 'strokeWidth' in preset ? preset.strokeWidth : 0, cornerRadius: 'cornerRadius' in preset ? preset.cornerRadius : 2, dashPattern: 'dashPattern' in preset ? [...preset.dashPattern] : undefined, shadow: preset.id === 'outline' || preset.id === 'dashed' ? undefined : [{ x: 0, y: 2, blur: 3, color: '#45371518' }, { x: 1, y: 9, blur: 16, color: '#45371524' }] })
  labelOf(note)?.set({ fill: preset.text })
  return true
}
