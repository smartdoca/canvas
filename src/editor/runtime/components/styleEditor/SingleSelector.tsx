import type { CSSProperties, FC, ReactNode } from 'react'
import type { styleValue } from '../../plugins/plugins'

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
const StrokeStyleSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => <SingleSelector {...props} options={[{ label: '实线', value: undefined }, { label: '虚线', value: [10, 6] }, { label: '点线', value: [2, 5] }]} />
const FontWeightSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => <SingleSelector {...props} options={[{ label: '常规', value: 400 }, { label: '中等', value: 500 }, { label: '粗体', value: 700 }]} />
const RoughModeSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => <SingleSelector {...props} options={[{ label: '标准', value: false }, { label: '手绘', value: true }]} />
const PatternIcon = ({ mode }: { mode: 'hachure' | 'cross-hatch' | 'zigzag' | 'dots' | 'solid' }) => <span className={`rough-pattern-icon is-${mode}`} />
const ROUGH_STROKE_ICONS = [
  'M3 10 L29 8',
  'M3 11 Q10 5 16 10 T29 7',
  'M3 12 Q8 3 14 11 T22 7 T29 10',
  'M3 12 Q7 4 12 11 T18 6 T24 12 T29 7',
  'M3 12 Q6 4 10 12 T15 5 T20 12 T25 5 T29 11',
]
const StrokeIcon = ({ level }: { level: number }) => <svg className="rough-stroke-icon" viewBox="0 0 32 18" aria-hidden="true"><path d={ROUGH_STROKE_ICONS[level] || ROUGH_STROKE_ICONS[1]} /></svg>
const RoughFillStyleSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => <SingleSelector {...props} options={[{ label: '斜线填充', icon: <PatternIcon mode="hachure" />, value: 'hachure' }, { label: '交叉填充', icon: <PatternIcon mode="cross-hatch" />, value: 'cross-hatch' }, { label: '锯齿填充', icon: <PatternIcon mode="zigzag" />, value: 'zigzag' }, { label: '点状填充', icon: <PatternIcon mode="dots" />, value: 'dots' }, { label: '全部填充', icon: <PatternIcon mode="solid" />, value: 'solid' }]} />
const RoughStrokeStyleSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => <SingleSelector {...props} options={[{ label: '轻微手绘', icon: <StrokeIcon level={0} />, value: 0 }, { label: '自然手绘', icon: <StrokeIcon level={1} />, value: 1 }, { label: '粗犷手绘', icon: <StrokeIcon level={2} />, value: 2 }, { label: '随性手绘', icon: <StrokeIcon level={3} />, value: 3 }, { label: '涂鸦手绘', icon: <StrokeIcon level={4} />, value: 4 }]} />
const ArrowHeadIcon = ({ type }: { type: string }) => <svg className="arrow-head-icon" viewBox="0 0 32 18" aria-hidden="true"><path d="M3 9 H27" />{type === 'angle' && <path d="M20 3 L27 9 L20 15" />}{type === 'triangle' && <path d="M19 3 L28 9 L19 15 Z" />}{type === 'circle' && <circle cx="25" cy="9" r="5" />}{type === 'diamond' && <path d="M18 9 L24 3 L30 9 L24 15 Z" />}{type === 'none' && <path d="M25 5 L29 9 L25 13" opacity=".25" />}</svg>
const ArrowHeadSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => <SingleSelector {...props} options={[{ label: '无箭头', icon: <ArrowHeadIcon type="none" />, value: 'none' }, { label: '折线箭头', icon: <ArrowHeadIcon type="angle" />, value: 'angle' }, { label: '实心箭头', icon: <ArrowHeadIcon type="triangle" />, value: 'triangle' }, { label: '圆形端点', icon: <ArrowHeadIcon type="circle" />, value: 'circle' }, { label: '菱形端点', icon: <ArrowHeadIcon type="diamond" />, value: 'diamond' }]} />
const ItalicSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => <SingleSelector {...props} options={[{ label: '常规', value: false }, { label: '斜体', icon: <span className="text-style-glyph is-italic">I</span>, value: true }]} />
const TextDecorationSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => <SingleSelector {...props} options={[{ label: '无装饰', value: 'none' }, { label: '下划线', icon: <span className="text-style-glyph is-underline">U</span>, value: 'under' }, { label: '删除线', icon: <span className="text-style-glyph is-strike">S</span>, value: 'delete' }]} />
const TextAlignIcon = ({ align }: { align: string }) => <span className={`text-align-icon is-${align}`}><i /><i /><i /></span>
const TextAlignSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => <SingleSelector {...props} options={[{ label: '左对齐', icon: <TextAlignIcon align="left" />, value: 'left' }, { label: '居中', icon: <TextAlignIcon align="center" />, value: 'center' }, { label: '右对齐', icon: <TextAlignIcon align="right" />, value: 'right' }, { label: '两端对齐', icon: <TextAlignIcon align="justify" />, value: 'justify' }]} />
export { SingleSelector, RangeSlider, StrokeWidthSelector, OpacitySelector, StrokeStyleSelector, CornerRadiusSelector, SidesSelector, FontWeightSelector, RoughModeSelector, RoughFillStyleSelector, RoughStrokeStyleSelector, ArrowHeadSelector, ItalicSelector, TextDecorationSelector, TextAlignSelector }
