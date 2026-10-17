import { useCanvasI18n } from '../../../i18n/context'
import type { MessageKey } from '../../../i18n/en'
import { Popover } from '../../ui/Popover'

export type HorizontalAlign = 'left' | 'center' | 'right' | 'justify'
export type VerticalAlign = 'top' | 'middle' | 'bottom'

function AlignmentIcon({ align }: { align: HorizontalAlign | VerticalAlign }) {
  const vertical = ['top', 'middle', 'bottom'].includes(align)
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {vertical ? align === 'middle' ? <path d="M4 12h16M12 2v6m-3-3 3 3 3-3M12 22v-6m-3 3 3-3 3 3" /> : align === 'top' ? <path d="M4 3h16M12 21V8m-5 5 5-5 5 5" /> : <path d="M4 21h16M12 3v13m-5-5 5 5 5-5" /> : <>
      <path d="M4 5h16M4 19h16" />
      <path d={align === 'left' ? 'M4 12h10' : align === 'center' ? 'M7 12h10' : align === 'right' ? 'M10 12h10' : 'M4 12h16'} />
    </>}
  </svg>
}

export function TextAlignmentControl({ horizontal, vertical, onHorizontal, onVertical, translate }: { horizontal?: HorizontalAlign; vertical?: VerticalAlign; onHorizontal: (align: HorizontalAlign) => void; onVertical?: (align: VerticalAlign) => void; translate?: (key: MessageKey) => string }) {
  const fallback = useCanvasI18n(), t = translate || fallback
  return <Popover fitViewport label={t('alignment.label')} icon={<AlignmentIcon align={horizontal || 'left'} />} className="text-alignment-popover">
    <div className="text-alignment-row" role="group" aria-label={t('rich.horizontalAlign')}>
      {(['left', 'center', 'right', 'justify'] as const).map(align => <button type="button" key={align} data-keep-open aria-label={t(`style.align.${align}`)} title={t(`style.align.${align}`)} aria-pressed={horizontal === align} onClick={() => onHorizontal(align)}><AlignmentIcon align={align} /></button>)}
    </div>
    {onVertical && <div className="text-alignment-row is-vertical" role="group" aria-label={t('rich.verticalAlign')}>
      {(['top', 'middle', 'bottom'] as const).map(align => <button type="button" key={align} data-keep-open aria-label={t(`table.align.${align}`)} title={t(`table.align.${align}`)} aria-pressed={vertical === align} onClick={() => onVertical(align)}><AlignmentIcon align={align} /></button>)}
    </div>}
  </Popover>
}
