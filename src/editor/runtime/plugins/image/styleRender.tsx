import type { FC } from 'react'
import type { styleValue } from '../plugins'
import { RangeSlider, SingleSelector } from '../../components/styleEditor/SingleSelector'
import { useCanvasI18n } from '../../../../i18n/context'

type ControlProps = { value: styleValue; onChange: (value: styleValue) => void }

export const ImageSizeControl: FC<ControlProps> = (props) => { const t = useCanvasI18n(); return <SingleSelector {...props} options={[
  { label: t('image.size.original'), value: 'original' },
  { label: t('image.size.locked'), value: 'locked' },
  { label: t('image.size.free'), value: 'free' },
]} /> }

export const CropRatioControl: FC<ControlProps> = (props) => { const t = useCanvasI18n(); return <SingleSelector {...props} options={[
  { label: t('image.crop.free'), value: 'free' },
  { label: t('image.crop.original'), value: 'original' },
  { label: t('image.crop.square'), value: '1:1' },
  { label: t('image.crop.landscape'), value: '4:3' },
  { label: t('image.crop.widescreen'), value: '16:9' },
]} /> }

export const ImageZoomControl: FC<ControlProps> = (props) => <RangeSlider {...props} value={typeof props.value === 'number' ? props.value : 1} min={1} max={3} step={0.05} formatValue={(value) => `${Math.round(value * 100)}%`} />
export const ImageOffsetControl: FC<ControlProps> = (props) => <RangeSlider {...props} value={typeof props.value === 'number' ? props.value : 0} min={-100} max={100} step={1} formatValue={(value) => `${value}%`} />
export const ImageFilterControl: FC<ControlProps> = (props) => <RangeSlider {...props} value={typeof props.value === 'number' ? props.value : 0} min={-1} max={1} step={0.05} formatValue={(value) => `${Math.round(value * 100)}`} />

export const ImageTransformControl: FC<ControlProps> = ({ onChange }) => { const t = useCanvasI18n(); return <div className="property-action-row">
  <button className="property-action-button" title={t('image.flipHorizontal')} data-tooltip={t('image.flipHorizontal')} onClick={() => onChange('flip-x')}>{t('image.flipHorizontal')}</button>
  <button className="property-action-button" title={t('image.flipVertical')} data-tooltip={t('image.flipVertical')} onClick={() => onChange('flip-y')}>{t('image.flipVertical')}</button>
  <button className="property-action-button" title={t('image.rotate90')} data-tooltip={t('image.rotate90')} onClick={() => onChange('rotate-90')}>{t('image.rotate90Short')}</button>
</div> }

export const ImageMaskControl: FC<ControlProps> = (props) => { const t = useCanvasI18n(); return <SingleSelector {...props} options={[
  { label: t('image.mask.none'), value: 'none' },
  { label: t('image.mask.rounded'), value: 'rounded' },
  { label: t('image.mask.circle'), value: 'circle' },
]} /> }

export const ImageResetControl: FC<ControlProps> = ({ onChange }) => { const t = useCanvasI18n(); return <button className="property-action-button" title={t('image.resetHint')} data-tooltip={t('image.resetHint')} onClick={() => onChange(true)}>{t('image.reset')}</button> }
