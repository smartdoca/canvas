import { useCanvasI18n } from '../../../i18n/context'
import type { MessageKey } from '../../../i18n/en'
import { BoardIcon } from './BoardIcon'
import { containerGroups, containerLabel, containerPresets, containerType } from './containers'

export function ContainerPicker({ activeKey, onPick }: { activeKey: string; onPick: (key: string) => void }) {
  const t = useCanvasI18n()
  return <div className="container-picker">{containerGroups.map(group => <section className="container-picker-group" key={group.key} aria-label={t(`container.group.${group.key}` as MessageKey)}>
    <h3>{t(`container.group.${group.key}` as MessageKey)}</h3>
    <div className="container-picker-grid">{group.types.map(type => {
      const key = type === 'section' ? 'frame' : `container:${type}`, preset = containerPresets[type], label = t(containerLabel(type))
      return <button type="button" role="menuitem" key={type} className={containerType(activeKey) === type ? 'is-active' : ''} data-canvas-insert={key} aria-label={label} title={label} onClick={() => onPick(key)}><BoardIcon name={preset.icon} size={25} /><span>{label}</span></button>
    })}</div>
  </section>)}</div>
}
