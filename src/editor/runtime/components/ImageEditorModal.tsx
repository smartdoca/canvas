import Cropper, { type CropperImage, type CropperSelection } from 'cropperjs'
import { useEffect, useRef, useState } from 'react'
import { useCanvasI18n } from '../../../i18n/context'
import type { MessageKey } from '../../../i18n/en'

type Ratio = 'free' | 'original' | '1:1' | '4:3' | '16:9' | 'custom'
type OutputMode = 'replace' | 'new'
type Adjustments = { brightness: number; contrast: number; saturation: number; hue: number; blur: number; grayscale: number; sepia: number; invert: number }
type OutputFormat = 'image/png' | 'image/jpeg' | 'image/webp'

export interface ImageEditResult { url: string; width: number; height: number; mode: OutputMode }
interface Props { sourceUrl: string; onCancel: () => void; onConfirm: (result: ImageEditResult) => void }

const initialAdjustments: Adjustments = { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0, invert: 0 }
const filterText = (value: Adjustments) => `brightness(${value.brightness}%) contrast(${value.contrast}%) saturate(${value.saturation}%) hue-rotate(${value.hue}deg) blur(${value.blur}px) grayscale(${value.grayscale}%) sepia(${value.sepia}%) invert(${value.invert}%)`

function fitSelectionToImage(selection: CropperSelection, cropperImage: CropperImage, canvas: HTMLElement, targetRatio: number) {
  const imageBounds = cropperImage.getBoundingClientRect()
  const canvasBounds = canvas.getBoundingClientRect()
  const left = Math.max(imageBounds.left, canvasBounds.left)
  const top = Math.max(imageBounds.top, canvasBounds.top)
  const right = Math.min(imageBounds.right, canvasBounds.right)
  const bottom = Math.min(imageBounds.bottom, canvasBounds.bottom)
  const availableWidth = Math.max(1, right - left)
  const availableHeight = Math.max(1, bottom - top)
  let width = availableWidth
  let height = width / targetRatio
  if (height > availableHeight) { height = availableHeight; width = height * targetRatio }
  selection.$change(
    left - canvasBounds.left + (availableWidth - width) / 2,
    top - canvasBounds.top + (availableHeight - height) / 2,
    width,
    height,
    targetRatio,
    true,
  )
}

export default function ImageEditorModal({ sourceUrl, onCancel, onConfirm }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>()
  const cropperRef = useRef<Cropper>()
  const t = useCanvasI18n()
  const tRef = useRef(t)
  tRef.current = t
  const [ready, setReady] = useState(false)
  const [naturalRatio, setNaturalRatio] = useState(1)
  const [ratio, setRatio] = useState<Ratio>('original')
  const [customRatio, setCustomRatio] = useState({ width: 3, height: 2 })
  const [flipX, setFlipX] = useState(false)
  const [flipY, setFlipY] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [adjustments, setAdjustments] = useState<Adjustments>(initialAdjustments)
  const [showOriginal, setShowOriginal] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('image/png')
  const [outputQuality, setOutputQuality] = useState(92)

  const getCropperImage = () => cropperRef.current?.getCropperImage() || hostRef.current?.querySelector<CropperImage>('cropper-image') || null
  const getSelection = () => cropperRef.current?.getCropperSelection() || hostRef.current?.querySelector<CropperSelection>('cropper-selection') || null

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    let cropper: Cropper | undefined
    const image = new window.Image()
    image.alt = tRef.current('imageEditor.pendingAlt')
    image.onload = () => {
      if (disposed) return
      const sourceRatio = image.naturalWidth / image.naturalHeight
      imageRef.current = image
      setNaturalRatio(sourceRatio)
      host.appendChild(image)
      const createdCropper = new Cropper(image, { container: host })
      cropper = createdCropper
      cropperRef.current = createdCropper
      const selection = createdCropper.getCropperSelection() || host.querySelector<CropperSelection>('cropper-selection')
      const cropperImage = createdCropper.getCropperImage() || host.querySelector<CropperImage>('cropper-image')
      if (selection) { selection.aspectRatio = sourceRatio; selection.initialAspectRatio = sourceRatio; selection.initialCoverage = 1 }
      void cropperImage?.$ready(async () => {
        cropperImage.$center('contain')
        await cropperImage.$nextTick()
        const canvas = createdCropper.getCropperCanvas()
        if (selection && canvas) fitSelectionToImage(selection, cropperImage, canvas, sourceRatio)
        setReady(true)
      })
    }
    image.src = sourceUrl
    return () => {
      disposed = true
      cropper?.destroy()
      cropperRef.current = undefined
      imageRef.current = undefined
      host.replaceChildren()
    }
  }, [sourceUrl])

  useEffect(() => {
    const image = getCropperImage()?.$image
    if (image) image.style.filter = showOriginal ? 'none' : filterText(adjustments)
  }, [adjustments, showOriginal])

  const ratioValue = (value: Ratio, custom = customRatio) => value === '1:1' ? 1 : value === '4:3' ? 4 / 3 : value === '16:9' ? 16 / 9 : value === 'custom' ? custom.width / custom.height : value === 'original' ? naturalRatio : NaN
  const chooseRatio = (value: Ratio, custom = customRatio) => {
    setRatio(value)
    const selection = getSelection()
    if (!selection) return
    const nextRatio = ratioValue(value, custom)
    selection.aspectRatio = nextRatio
    selection.initialAspectRatio = nextRatio
    if (value === 'free') return
    const cropperImage = getCropperImage()
    const canvas = cropperRef.current?.getCropperCanvas() || hostRef.current?.querySelector<HTMLElement>('cropper-canvas')
    if (cropperImage && canvas) fitSelectionToImage(selection, cropperImage, canvas, nextRatio)
  }

  const transformImage = (action: 'rotate' | 'flip-x' | 'flip-y') => {
    const image = getCropperImage()
    if (!image) return
    if (action === 'rotate') { image.$rotate('90deg'); setRotation((value) => (value + 90) % 360) }
    if (action === 'flip-x') { image.$scale(-1, 1); setFlipX((value) => !value) }
    if (action === 'flip-y') { image.$scale(1, -1); setFlipY((value) => !value) }
  }

  const reset = () => {
    const cropper = cropperRef.current
    const image = cropper?.getCropperImage() || hostRef.current?.querySelector<CropperImage>('cropper-image')
    image?.$resetTransform().$center('contain')
    setFlipX(false); setFlipY(false); setRotation(0); setAdjustments(initialAdjustments)
    if (image) void image.$nextTick(() => chooseRatio('original'))
    else chooseRatio('original')
  }

  const updateAdjustment = (key: keyof Adjustments, value: number) => setAdjustments((current) => ({ ...current, [key]: value }))

  const renderCroppedImage = async () => {
    const selection = getSelection()
    if (!selection) return null
    const requestedWidth = Math.min(1600, Math.max(1, imageRef.current?.naturalWidth || 1600))
    const cropped = await selection.$toCanvas({ width: requestedWidth })
    const output = document.createElement('canvas')
    output.width = cropped.width; output.height = cropped.height
    const context = output.getContext('2d')
    if (!context) return null
    context.filter = filterText(adjustments); context.drawImage(cropped, 0, 0); context.filter = 'none'
    return output
  }

  const confirm = async (mode: OutputMode) => {
    const selection = getSelection()
    if (!selection || processing) return
    setProcessing(true)
    try {
      const cropped = await renderCroppedImage()
      if (!cropped) return
      const output = document.createElement('canvas')
      output.width = cropped.width; output.height = cropped.height
      const context = output.getContext('2d')
      if (!context) return
      if (outputFormat === 'image/jpeg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, output.width, output.height) }
      context.drawImage(cropped, 0, 0)
      onConfirm({ url: output.toDataURL(outputFormat, outputQuality / 100), width: output.width, height: output.height, mode })
    } finally { setProcessing(false) }
  }

  const slider = (label: string, key: keyof Adjustments, min: number, max: number, suffix = '%') => <><label>{label} <span>{adjustments[key]}{suffix}</span></label><input type="range" min={min} max={max} value={adjustments[key]} onChange={(event) => updateAdjustment(key, Number(event.target.value))} /></>
  const applyPreset = (preset: 'clear' | 'vivid' | 'mono' | 'vintage') => {
    if (preset === 'clear') setAdjustments(initialAdjustments)
    if (preset === 'vivid') setAdjustments({ ...initialAdjustments, brightness: 105, contrast: 112, saturation: 135 })
    if (preset === 'mono') setAdjustments({ ...initialAdjustments, contrast: 108, grayscale: 100 })
    if (preset === 'vintage') setAdjustments({ ...initialAdjustments, brightness: 106, contrast: 92, saturation: 82, sepia: 45 })
  }

  return <div className="image-editor-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
    <section className="image-editor-modal" role="dialog" aria-modal="true" aria-label={t('imageEditor.title')}>
      <header className="image-editor-header"><div><strong>{t('imageEditor.title')}</strong><span>{t('imageEditor.hint')}</span></div><button aria-label={t('imageEditor.close')} onClick={onCancel}>×</button></header>
      <div className="image-editor-body">
        <div className="image-editor-preview">
          <div ref={hostRef} className="cropper-host" aria-label={t('imageEditor.cropRegion')} />
          {showOriginal && <img className="image-original-compare" src={sourceUrl} alt={t('imageEditor.compareAlt')} />}
        </div>
        <aside className="image-editor-tools">
          <label>{t('imageEditor.ratio')}</label><div className="image-editor-options">{(['free', 'original', '1:1', '4:3', '16:9', 'custom'] as Ratio[]).map((value) => <button key={value} className={ratio === value ? 'is-active' : ''} onClick={() => chooseRatio(value)}>{t(`imageEditor.ratio.${value === '1:1' ? 'square' : value === '4:3' ? 'landscape' : value === '16:9' ? 'widescreen' : value}` as MessageKey)}</button>)}</div>
          {ratio === 'custom' && <div className="custom-ratio-inputs"><input aria-label={t('imageEditor.ratioWidth')} type="number" min="1" value={customRatio.width} onChange={(event) => { const next = { ...customRatio, width: Math.max(1, Number(event.target.value) || 1) }; setCustomRatio(next); chooseRatio('custom', next) }} /><span>:</span><input aria-label={t('imageEditor.ratioHeight')} type="number" min="1" value={customRatio.height} onChange={(event) => { const next = { ...customRatio, height: Math.max(1, Number(event.target.value) || 1) }; setCustomRatio(next); chooseRatio('custom', next) }} /></div>}
          <label>{t('imageEditor.orientation')}</label><div className="image-editor-options"><button onClick={() => transformImage('flip-x')} className={flipX ? 'is-active' : ''}>{t('image.flipHorizontal')}</button><button onClick={() => transformImage('flip-y')} className={flipY ? 'is-active' : ''}>{t('image.flipVertical')}</button><button onClick={() => transformImage('rotate')}>{t('imageEditor.rotate', { degrees: rotation })}</button></div>
          <details className="image-editor-section">
            <summary>{t('imageEditor.adjust')}<span>{t('imageEditor.adjustHint')}</span></summary>
            <div className="image-editor-section-content">
              <label>{t('imageEditor.preset')}</label><div className="image-editor-options"><button onClick={() => applyPreset('clear')}>{t('imageEditor.preset.natural')}</button><button onClick={() => applyPreset('vivid')}>{t('imageEditor.preset.vivid')}</button><button onClick={() => applyPreset('mono')}>{t('imageEditor.preset.mono')}</button><button onClick={() => applyPreset('vintage')}>{t('imageEditor.preset.vintage')}</button></div>
              {slider(t('imageEditor.brightness'), 'brightness', 40, 160)}{slider(t('imageEditor.contrast'), 'contrast', 40, 160)}{slider(t('imageEditor.saturation'), 'saturation', 0, 200)}{slider(t('imageEditor.hue'), 'hue', -180, 180, '°')}{slider(t('imageEditor.blur'), 'blur', 0, 12, 'px')}{slider(t('imageEditor.grayscale'), 'grayscale', 0, 100)}{slider(t('imageEditor.sepia'), 'sepia', 0, 100)}{slider(t('imageEditor.invert'), 'invert', 0, 100)}
            </div>
          </details>
          <details className="image-editor-section">
            <summary>{t('imageEditor.output')}<span>{outputFormat.replace('image/', '').toUpperCase()}</span></summary>
            <div className="image-editor-section-content">
              <label>{t('imageEditor.format')}</label><select className="image-format-select" value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as OutputFormat)}><option value="image/png">{t('imageEditor.formatPng')}</option><option value="image/jpeg">{t('imageEditor.formatJpeg')}</option><option value="image/webp">{t('imageEditor.formatWebp')}</option></select>
              {outputFormat !== 'image/png' && <><label>{t('imageEditor.quality')} <span>{outputQuality}%</span></label><input type="range" min="40" max="100" value={outputQuality} onChange={(event) => setOutputQuality(Number(event.target.value))} /></>}
            </div>
          </details>
        </aside>
      </div>
      <footer className="image-editor-footer"><button onClick={reset}>{t('imageEditor.reset')}</button><button onPointerDown={() => setShowOriginal(true)} onPointerUp={() => setShowOriginal(false)} onPointerLeave={() => setShowOriginal(false)}>{t('imageEditor.holdOriginal')}</button><span /><button onClick={onCancel}>{t('imageEditor.cancel')}</button><button disabled={!ready || processing} onClick={() => void confirm('replace')}>{processing ? t('imageEditor.processing') : t('imageEditor.replace')}</button><button className="primary" disabled={!ready || processing} onClick={() => void confirm('new')}>{processing ? t('imageEditor.processing') : t('imageEditor.create')}</button></footer>
    </section>
  </div>
}
