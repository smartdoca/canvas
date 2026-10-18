import { useEffect, useRef, useState } from 'react'
import CanvasEditor from '../editor/runtime/CanvasEditor'
import type { CanvasEditorRef, CanvasElementExtension, CanvasResource } from '../sdk/types'
import { parseDocument } from '../editor/core/document'
import { translate } from '../i18n/translate'
import { demoResources } from './assets'

const badgeExtension: CanvasElementExtension = {
  type: 'demo-badge',
  label: '自定义卡片',
  icon: <span style={{ fontSize: 11, fontWeight: 700 }}>卡</span>,
  shortcut: 'b',
  properties: [{
    key: 'fill',
    label: '卡片颜色',
    defaultValue: '#6257e8',
    control: ({ value, onChange }) => <input aria-label="卡片颜色" type="color" value={String(value || '#6257e8')} onChange={event => onChange(event.target.value)} />,
  }],
  create: ({ bounds, properties }) => ({
    tag: 'Frame', name: 'demo-badge', editable: true, resizeChildren: true,
    ...bounds, fill: String(properties.fill || '#6257e8'), cornerRadius: 16,
    children: [{ tag: 'Text', text: '自定义元素', x: 12, y: 10, fill: '#ffffff', fontSize: 14 }],
  }),
}

export function DemoApp() {
  const params = new URLSearchParams(window.location.search)
  const locale = params.get('locale') || undefined
  const ref = useRef<CanvasEditorRef>(null)
  const input = useRef<HTMLInputElement>(null)
  const errorTimer = useRef<ReturnType<typeof setTimeout>>()
  const [preview, setPreview] = useState<{ resource: CanvasResource; url: string }>()
  const previewResource = async (resource: CanvasResource) => setPreview({ resource, url: await demoResources.resolveUrl(resource.path, {}) })
  const [error, setError] = useState('')
  const reportError = (key: 'status.importFailed' | 'status.exportFailed' | 'status.operationFailed') => {
    setError(translate(locale, key))
    clearTimeout(errorTimer.current)
    errorTimer.current = setTimeout(() => setError(''), 4000)
  }
  useEffect(() => {
    document.documentElement.lang = !locale || locale === 'zh' ? 'zh-CN' : 'en'
    return () => clearTimeout(errorTimer.current)
  }, [locale])
  return <>
    {preview && <div className="demo-resource-backdrop" onPointerDown={() => setPreview(undefined)}><section className="demo-resource-preview" role="dialog" aria-label={translate(locale, 'resource.preview')} onPointerDown={event => event.stopPropagation()}><header><span>{preview.resource.name}</span><a href={preview.url} download={preview.resource.name}>{translate(locale, 'resource.download')}</a><button type="button" aria-label={translate(locale, 'resource.close')} onClick={() => setPreview(undefined)}>×</button></header>{preview.resource.kind === 'image' ? <img src={preview.url} alt={preview.resource.name || ''} /> : preview.resource.mimeType === 'application/pdf' ? <iframe title={preview.resource.name} src={preview.url} /> : <p>{preview.resource.name} · {Math.ceil((preview.resource.size || 0) / 1024)} KB</p>}</section></div>}
    <CanvasEditor ref={ref} locale={locale} resources={demoResources} elementExtensions={[badgeExtension]}
      storageKey={params.get('document') ? `aidcanvas.document.${params.get('document')}` : undefined}
      headerActions={error ? <span className="demo-error" role="alert">{error}</span> : undefined}
      onAttachmentPreview={previewResource}
      onResourcePreview={previewResource}
      onError={() => reportError('status.operationFailed')}
      onImportRequest={() => input.current?.click()}
      onExportRequest={async options => {
        try {
          ref.current?.flush()
          const result = await ref.current!.exportFile({ ...options, background: 'transparent' })
          const url = URL.createObjectURL(result.blob)
          const anchor = document.createElement('a')
          anchor.href = url; anchor.download = result.filename; anchor.click()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        } catch { reportError('status.exportFailed') }
      }} />
    <input ref={input} hidden type="file" aria-label={translate(locale, 'toolbar.imageFile')} accept="image/png,image/jpeg,image/webp,image/svg+xml,.canvas,.json" onChange={async event => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      try {
        if (/\.(canvas|json)$/i.test(file.name)) ref.current?.setValue(parseDocument(await file.text()))
        else await ref.current?.insertImageFile(file, { filename: file.name })
      } catch { reportError('status.importFailed') }
    }} />
  </>
}
