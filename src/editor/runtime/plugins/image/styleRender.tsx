import type { FC } from 'react'
import type { styleValue } from '../plugins'
import { RangeSlider, SingleSelector } from '../../components/styleEditor/SingleSelector'

type ControlProps = { value: styleValue; onChange: (value: styleValue) => void }

export const ImageSizeControl: FC<ControlProps> = (props) => <SingleSelector {...props} options={[
  { label: '原始比例', value: 'original' },
  { label: '锁定比例', value: 'locked' },
  { label: '自由变形', value: 'free' },
]} />

export const CropRatioControl: FC<ControlProps> = (props) => <SingleSelector {...props} options={[
  { label: '自由', value: 'free' },
  { label: '原始比例', value: 'original' },
  { label: '正方形 1:1', value: '1:1' },
  { label: '横向 4:3', value: '4:3' },
  { label: '宽屏 16:9', value: '16:9' },
]} />

export const ImageZoomControl: FC<ControlProps> = (props) => <RangeSlider {...props} value={typeof props.value === 'number' ? props.value : 1} min={1} max={3} step={0.05} formatValue={(value) => `${Math.round(value * 100)}%`} />
export const ImageOffsetControl: FC<ControlProps> = (props) => <RangeSlider {...props} value={typeof props.value === 'number' ? props.value : 0} min={-100} max={100} step={1} formatValue={(value) => `${value}%`} />
export const ImageFilterControl: FC<ControlProps> = (props) => <RangeSlider {...props} value={typeof props.value === 'number' ? props.value : 0} min={-1} max={1} step={0.05} formatValue={(value) => `${Math.round(value * 100)}`} />

export const ImageTransformControl: FC<ControlProps> = ({ onChange }) => <div className="property-action-row">
  <button className="property-action-button" title="水平翻转" data-tooltip="水平翻转" onClick={() => onChange('flip-x')}>水平翻转</button>
  <button className="property-action-button" title="垂直翻转" data-tooltip="垂直翻转" onClick={() => onChange('flip-y')}>垂直翻转</button>
  <button className="property-action-button" title="顺时针旋转 90°" data-tooltip="顺时针旋转 90°" onClick={() => onChange('rotate-90')}>旋转 90°</button>
</div>

export const ImageMaskControl: FC<ControlProps> = (props) => <SingleSelector {...props} options={[
  { label: '无蒙版', value: 'none' },
  { label: '圆角蒙版', value: 'rounded' },
  { label: '圆形蒙版', value: 'circle' },
]} />

export const ImageResetControl: FC<ControlProps> = ({ onChange }) => <button className="property-action-button" title="恢复完整原图与全部图片参数" data-tooltip="恢复完整原图与全部图片参数" onClick={() => onChange(true)}>重置图片</button>
