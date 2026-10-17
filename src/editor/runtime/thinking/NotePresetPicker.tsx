import { useCanvasI18n } from '../../../i18n/context'
import { notePresets } from './noteStyles'

export function NotePresetPicker({ onPick, draggable = false }: { onPick: (id: string) => void; draggable?: boolean }) {
  const t = useCanvasI18n()
  return <div className="note-preset-picker" role="group" aria-label={t('note.presets')}>
    {notePresets.map(preset => <button type="button" key={preset.id} className="note-preset-tile" data-canvas-insert={draggable ? `note:${preset.id}` : undefined} aria-label={t(`note.preset.${preset.id}`)} title={t(`note.preset.${preset.id}`)} onClick={() => onPick(preset.id)}>
      <span className="note-preset-preview" style={{ background: preset.fill, color: preset.text, borderColor: 'stroke' in preset ? preset.stroke : 'transparent', borderStyle: preset.id === 'dashed' ? 'dashed' : 'solid', borderRadius: 'cornerRadius' in preset ? preset.cornerRadius / 2 : 2, boxShadow: ['outline', 'dashed'].includes(preset.id) ? 'none' : '0 2px 4px #1f232914' }}><i /><i /><i /></span>
      <span>{t(`note.preset.${preset.id}`)}</span>
    </button>)}
  </div>
}
