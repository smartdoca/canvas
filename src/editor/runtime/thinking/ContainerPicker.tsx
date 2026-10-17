import { useCanvasI18n } from '../../../i18n/context'
import type { MessageKey } from '../../../i18n/en'
import { BoardIcon } from './BoardIcon'
import { containerGroups, containerLabel, containerPresets, containerType } from './containers'

export function ContainerPicker({ activeKey, isOpen, onPick }: { activeKey: string; isOpen: boolean; onPick: (key: string) => void }) {
  const t = useCanvasI18n(), ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!isOpen) return
    const flyout = ref.current?.parentElement, group = flyout?.parentElement
    if (!flyout || !group) return
    const place = () => {
      const origin = group.getBoundingClientRect(), box = flyout.getBoundingClientRect()
      flyout.style.top = `${Math.max(12, Math.min(origin.top - 280, window.innerHeight - box.height - 12)) - origin.top}px`
      flyout.style.left = `${Math.max(12, Math.min(origin.left + 56, window.innerWidth - box.width - 12)) - origin.left}px`
    }
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [isOpen, t])
  return <div ref={ref} className="container-picker">{containerGroups.map(group => <section className="container-picker-group" key={group.key} aria-label={t(`container.group.${group.key}` as MessageKey)}>
    <h3>{t(`container.group.${group.key}` as MessageKey)}</h3>
    <div className="container-picker-grid">{group.types.map(type => {
      const key = type === 'section' ? 'frame' : `container:${type}`, preset = containerPresets[type], label = t(containerLabel(type))
      return <button type="button" role="menuitem" key={type} className={containerType(activeKey) === type ? 'is-active' : ''} data-canvas-insert={key} aria-label={label} title={label} onClick={() => onPick(key)}><BoardIcon name={preset.icon} size={25} /><span>{label}</span></button>
    })}</div>
  </section>)}</div>
}
import { useLayoutEffect, useRef } from 'react'
