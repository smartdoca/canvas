import type { IUI } from 'leafer-ui'
import { ancestor, labelOf } from './scene'

export const notePresets = [
  { id: 'yellow', fill: '#fff2a8', text: '#36301d' },
  { id: 'peach', fill: '#ffe0bd', text: '#593b27' },
  { id: 'rose', fill: '#ffdce6', text: '#623346' },
  { id: 'mint', fill: '#dcefe4', text: '#254f40' },
  { id: 'sky', fill: '#e0eeff', text: '#284d7b' },
  { id: 'lavender', fill: '#eee1ff', text: '#533b70' },
  { id: 'ivory', fill: '#faf7ef', text: '#595448' },
  { id: 'dark', fill: '#303744', text: '#f6f8fc' },
  { id: 'outline', fill: '#ffffff', text: '#1f2329', stroke: '#9aa5b5', strokeWidth: 1.5 },
  { id: 'rounded', fill: '#e5f4ef', text: '#216854', cornerRadius: 16, stroke: '#8dc3b2', strokeWidth: 1 },
  { id: 'dashed', fill: '#f4f1ff', text: '#69549a', cornerRadius: 4, stroke: '#ac98d6', strokeWidth: 1.5, dashPattern: [6, 4] },
  { id: 'accent', fill: '#3370ff', text: '#ffffff', cornerRadius: 8 },
] as const

export function applyNotePreset(item: IUI, presetId: string) {
  const note = ancestor(item, 'note'), preset = notePresets.find(p => p.id === presetId)
  if (!note || !preset) return false
  note.set({ fill: preset.fill, stroke: 'stroke' in preset ? preset.stroke : undefined, strokeWidth: 'strokeWidth' in preset ? preset.strokeWidth : 0, cornerRadius: 'cornerRadius' in preset ? preset.cornerRadius : 2, dashPattern: 'dashPattern' in preset ? [...preset.dashPattern] : undefined, shadow: preset.id === 'outline' || preset.id === 'dashed' ? undefined : [{ x: 0, y: 2, blur: 3, color: '#45371518' }, { x: 1, y: 9, blur: 16, color: '#45371524' }] })
  labelOf(note)?.set({ fill: preset.text })
  return true
}
