import type { FC } from 'react'
import type { styleValue } from '../../plugins/plugins'

interface ColorSelectorProps { presets: string[]; value: styleValue; onChange: (value: styleValue) => void; disableClear?: boolean }

const ColorSelector: FC<ColorSelectorProps> = ({ presets, value, onChange, disableClear }) => {
  const current = typeof value === 'string' ? value : undefined
  return <div className="color-row">
    {!disableClear && <button aria-label="无颜色" title="无颜色" data-tooltip="无颜色" className={`color-swatch is-clear ${current === undefined ? 'is-selected' : ''}`} onClick={() => onChange(undefined)} />}
    {presets.map((color) => <button key={color} aria-label={color} title={color} data-tooltip={color} className={`color-swatch ${current === color ? 'is-selected' : ''}`} style={{ background: color }} onClick={() => onChange(color)} />)}
    <input aria-label="自定义颜色" title="自定义颜色" className="color-input" type="color" value={current || '#6257e8'} onChange={(event) => onChange(event.target.value)} />
  </div>
}

const FillColorSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => <ColorSelector {...props} presets={['#ffffff', '#ffc9c9', '#ffd8a8', '#ffec99', '#a5d8ff', '#b2f2bb', '#d0bfff', '#fcc2d7', '#99e9f2', '#c3fae8', '#e9ecef', '#ced4da']} />
const StrokeColorSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => <ColorSelector {...props} presets={['#1b1b1f', '#e03131', '#f08c00', '#1971c2', '#2f9e44', '#6741d9', '#c2255c', '#0c8599', '#5f3dc4', '#495057', '#087f5b', '#9c36b5']} />
const FontColorSelector: FC<{ value: styleValue; onChange: (value: styleValue) => void }> = (props) => <ColorSelector {...props} disableClear presets={['#1b1b1f', '#e03131', '#f08c00', '#1971c2', '#2f9e44', '#6741d9', '#c2255c', '#0c8599', '#5f3dc4', '#495057', '#087f5b', '#9c36b5']} />

export { ColorSelector, FillColorSelector, StrokeColorSelector, FontColorSelector }
