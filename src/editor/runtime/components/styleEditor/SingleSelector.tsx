import type { CSSProperties, FC, ReactNode } from 'react'
import type { styleValue } from '../../plugins/plugins'
import { useCanvasI18n } from '../../../../i18n/context'

interface SingleSelectorItem { label?: string; icon?: ReactNode; value: styleValue }
const SingleSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void; options: SingleSelectorItem[] }> = ({ value, onChange, options }) => <div className="option-row">
  {options.map((option, index) => { const serialized = JSON.stringify(option.value); return <button key={`${option.label ?? 'option'}-${serialized ?? index}`} data-tooltip={option.label} title={option.label} aria-label={option.label} className={`option-button ${JSON.stringify(value) === serialized ? 'is-selected' : ''}`} onClick={() => onChange(option.value)}>{option.icon || option.label}</button> })}
</div>

interface RangeSliderProps { value: styleValue; onChange: (value: styleValue) => void; min: number; max: number; step?: number; formatValue?: (value: number) => string }
const RangeSlider: FC<RangeSliderProps> = ({ value, onChange, min, max, step = 1, formatValue }) => {
  const numberValue = typeof value === 'number' ? value : min
  const progress = max === min ? 0 : (numberValue - min) / (max - min) * 100
  const label = formatValue ? formatValue(numberValue) : String(numberValue)
  const style = { '--range-progress': `${Math.min(100, Math.max(0, progress))}%` } as CSSProperties
  return <div className="range-control" style={style} data-value={label}>
    <input className="range-input" type="range" aria-valuetext={label} value={numberValue} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
  </div>
}
const StrokeWidthSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => <RangeSlider {...props} min={1} max={20} />
const OpacitySelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => <RangeSlider {...props} min={0} max={1} step={0.01} formatValue={(value) => `${Math.round(value * 100)}%`} />
const CornerRadiusSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => <RangeSlider {...props} min={0} max={80} />
const SidesSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => <RangeSlider {...props} min={3} max={12} />
const StrokeStyleSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => { const t = useCanvasI18n(); return <SingleSelector {...props} options={[{ label: t('style.stroke.solid'), value: undefined }, { label: t('style.stroke.dashed'), value: [10, 6] }, { label: t('style.stroke.dotted'), value: [2, 5] }]} /> }
const FontWeightSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => { const t = useCanvasI18n(); return <SingleSelector {...props} options={[{ label: t('style.weight.regular'), value: 400 }, { label: t('style.weight.medium'), value: 500 }, { label: t('style.weight.bold'), value: 700 }]} /> }
const RoughModeSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => { const t = useCanvasI18n(); return <SingleSelector {...props} options={[{ label: t('style.rough.standard'), value: false }, { label: t('style.rough.sketch'), value: true }]} /> }
const PatternIcon = ({ mode }: { mode: 'hachure' | 'cross-hatch' | 'zigzag' | 'dots' | 'solid' }) => <span className={`rough-pattern-icon is-${mode}`} />
const ROUGH_STROKE_ICONS = [
  'M3 10 L29 8',
  'M3 11 Q10 5 16 10 T29 7',
  'M3 12 Q8 3 14 11 T22 7 T29 10',
  'M3 12 Q7 4 12 11 T18 6 T24 12 T29 7',
  'M3 12 Q6 4 10 12 T15 5 T20 12 T25 5 T29 11',
]
const StrokeIcon = ({ level }: { level: number }) => <svg className="rough-stroke-icon" viewBox="0 0 32 18" aria-hidden="true"><path d={ROUGH_STROKE_ICONS[level] || ROUGH_STROKE_ICONS[1]} /></svg>
const RoughFillStyleSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => { const t = useCanvasI18n(); return <SingleSelector {...props} options={[{ label: t('style.fill.hachure'), icon: <PatternIcon mode="hachure" />, value: 'hachure' }, { label: t('style.fill.crossHatch'), icon: <PatternIcon mode="cross-hatch" />, value: 'cross-hatch' }, { label: t('style.fill.zigzag'), icon: <PatternIcon mode="zigzag" />, value: 'zigzag' }, { label: t('style.fill.dots'), icon: <PatternIcon mode="dots" />, value: 'dots' }, { label: t('style.fill.solid'), icon: <PatternIcon mode="solid" />, value: 'solid' }]} /> }
const RoughStrokeStyleSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => { const t = useCanvasI18n(); return <SingleSelector {...props} options={[{ label: t('style.strokeLevel.slight'), icon: <StrokeIcon level={0} />, value: 0 }, { label: t('style.strokeLevel.natural'), icon: <StrokeIcon level={1} />, value: 1 }, { label: t('style.strokeLevel.bold'), icon: <StrokeIcon level={2} />, value: 2 }, { label: t('style.strokeLevel.loose'), icon: <StrokeIcon level={3} />, value: 3 }, { label: t('style.strokeLevel.scribble'), icon: <StrokeIcon level={4} />, value: 4 }]} /> }
const ArrowHeadIcon = ({ type }: { type: string }) => <svg className="arrow-head-icon" viewBox="0 0 32 18" aria-hidden="true"><path d="M3 9 H27" />{type === 'angle' && <path d="M20 3 L27 9 L20 15" />}{type === 'triangle' && <path d="M19 3 L28 9 L19 15 Z" />}{type === 'circle' && <circle cx="25" cy="9" r="5" />}{type === 'diamond' && <path d="M18 9 L24 3 L30 9 L24 15 Z" />}{type === 'none' && <path d="M25 5 L29 9 L25 13" opacity=".25" />}</svg>
const ArrowHeadSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => { const t = useCanvasI18n(); return <SingleSelector {...props} options={[{ label: t('style.arrow.none'), icon: <ArrowHeadIcon type="none" />, value: 'none' }, { label: t('style.arrow.angle'), icon: <ArrowHeadIcon type="angle" />, value: 'angle' }, { label: t('style.arrow.triangle'), icon: <ArrowHeadIcon type="triangle" />, value: 'triangle' }, { label: t('style.arrow.circle'), icon: <ArrowHeadIcon type="circle" />, value: 'circle' }, { label: t('style.arrow.diamond'), icon: <ArrowHeadIcon type="diamond" />, value: 'diamond' }]} /> }
const ItalicSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => { const t = useCanvasI18n(); return <SingleSelector {...props} options={[{ label: t('style.italic.regular'), value: false }, { label: t('style.italic.italic'), icon: <span className="text-style-glyph is-italic">I</span>, value: true }]} /> }
const TextDecorationSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => { const t = useCanvasI18n(); return <SingleSelector {...props} options={[{ label: t('style.decoration.none'), value: 'none' }, { label: t('style.decoration.underline'), icon: <span className="text-style-glyph is-underline">U</span>, value: 'under' }, { label: t('style.decoration.strike'), icon: <span className="text-style-glyph is-strike">S</span>, value: 'delete' }]} /> }
const TextAlignIcon = ({ align }: { align: string }) => <span className={`text-align-icon is-${align}`}><i /><i /><i /></span>
const TextAlignSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => { const t = useCanvasI18n(); return <SingleSelector {...props} options={[{ label: t('style.align.left'), icon: <TextAlignIcon align="left" />, value: 'left' }, { label: t('style.align.center'), icon: <TextAlignIcon align="center" />, value: 'center' }, { label: t('style.align.right'), icon: <TextAlignIcon align="right" />, value: 'right' }, { label: t('style.align.justify'), icon: <TextAlignIcon align="justify" />, value: 'justify' }]} /> }
export { SingleSelector, RangeSlider, StrokeWidthSelector, OpacitySelector, StrokeStyleSelector, CornerRadiusSelector, SidesSelector, FontWeightSelector, RoughModeSelector, RoughFillStyleSelector, RoughStrokeStyleSelector, ArrowHeadSelector, ItalicSelector, TextDecorationSelector, TextAlignSelector }
