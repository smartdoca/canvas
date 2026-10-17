import type { styleValue } from '../../plugins/plugins'
import { useCanvasI18n } from '../../../../i18n/context'
import type { MessageKey } from '../../../../i18n/en'

const colors = ['#1d1d1d', '#9fa4ac', '#c783eb', '#a04cc2', '#4965dd', '#5c9cdb', '#e9b454', '#d47b3b', '#488e6d', '#6bad68', '#e68b8b', '#cc4944']
const softColors = ['#e8e8e8', '#e9ebee', '#f0ddfa', '#eedcf5', '#dce3fa', '#dcedfa', '#fff0c4', '#fbe4d3', '#dceee3', '#e0f0da', '#f9dfdf', '#f8dbd9']

function FillIcon({ mode }: { mode: string }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><rect x="5" y="4" width="14" height="14" rx="1" stroke="currentColor" strokeWidth="1.5" fill={mode === 'solid' ? 'currentColor' : mode === 'soft' ? 'currentColor' : 'none'} fillOpacity={mode === 'soft' ? '.25' : '1'} />{mode === 'hatch' && <path d="m5 9 5-5m-5 9 9-9M6 18 19 5M11 18l8-8m-3 8 3-3" stroke="currentColor" strokeWidth="1.2" />}<path d="M3 7v14h13" stroke="currentColor" strokeWidth="1.3" opacity=".6" /></svg>
}

export function QuickStyle({ values, onChange, hasFill = true, isText = false }: { values: Record<string, styleValue>; onChange: (key: string, value: styleValue) => void; hasFill?: boolean; isText?: boolean }) {
  const t = useCanvasI18n()
  const color = String(values[isText ? 'fontColor' : 'stroke'] || '#1d1d1d')
  const fill = values.fill
  const fillMode = !fill ? 'none' : softColors.includes(String(fill)) ? 'soft' : 'solid'
  const changeColor = (next: string, index: number) => {
    onChange(isText ? 'fontColor' : 'stroke', next)
    if (hasFill && fill) onChange('fill', fillMode === 'soft' ? softColors[index] || next : next)
  }
  const setFill = (mode: string) => {
    onChange('fill', mode === 'none' ? undefined : mode === 'soft' ? softColors[colors.indexOf(color)] || '#e8e8e8' : color)
  }
  const dash = Array.isArray(values.dashPattern) ? values.dashPattern[0] === 2 ? 'dotted' : 'dashed' : 'solid'
  const choice = (label: string, active: boolean, action: () => void, children: React.ReactNode) => <button type="button" className={`quick-style-button ${active ? 'is-selected' : ''}`} title={label} aria-label={label} aria-pressed={active} onClick={action}>{children}</button>
  return <div className="quick-style">
    <div className="quick-color-grid" role="group" aria-label={t('style.quickColor')}>
      {colors.map((item, index) => choice(`${t('style.quickColor')} ${item}`, color === item || index === 0 && color === '#000000', () => changeColor(item, index), <span className="quick-color-dot" style={{ backgroundColor: item }} key={item} />)).map((button, index) => <span key={colors[index]}>{button}</span>)}
    </div>
    <div className="quick-opacity"><input type="range" min="0" max="1" step="0.01" aria-label={t('style.opacity')} aria-valuetext={`${Math.round(Number(values.opacity ?? 1) * 100)}%`} value={Number(values.opacity ?? 1)} onChange={event => onChange('opacity', Number(event.target.value))} /></div>
    <div className="quick-style-rows">
      {hasFill && <div className="quick-option-row" role="group" aria-label={t('style.fill')}>
        {['none', 'soft', 'solid'].map(mode => <span key={mode}>{choice(t(`style.quickFill.${mode}` as MessageKey), fillMode === mode, () => setFill(mode), <FillIcon mode={mode} />)}</span>)}
      </div>}
      {!isText && <div className="quick-option-row" role="group" aria-label={t('style.dash')}>
        {['dashed', 'dotted', 'solid'].map(mode => <span key={mode}>{choice(t(`style.quickDash.${mode}` as MessageKey), dash === mode, () => { onChange('dashPattern', mode === 'dashed' ? [10, 6] : mode === 'dotted' ? [2, 5] : undefined) }, <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">{mode === 'draw' ? <path d="M4 14C3 4 18 2 20 11S6 22 5 13C4 6 20 4 19 13" stroke="currentColor" strokeWidth="1.6" /> : <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" strokeDasharray={mode === 'dashed' ? '4 3' : mode === 'dotted' ? '1 3' : undefined} strokeLinecap="round" />}</svg>)}</span>)}
      </div>}
      <div className="quick-option-row quick-size-row" role="group" aria-label={t(isText ? 'style.fontSize' : 'style.strokeWidth')}>
        {['S', 'M', 'L', 'XL'].map((size, index) => { const value = (isText ? [16, 24, 36, 48] : [2, 3.5, 5, 8])[index]; return <span key={size}>{choice(`${t(isText ? 'style.fontSize' : 'style.strokeWidth')} ${size}`, Number(values[isText ? 'fontSize' : 'strokeWidth']) === value, () => onChange(isText ? 'fontSize' : 'strokeWidth', value), size)}</span> })}
      </div>
    </div>
  </div>
}
