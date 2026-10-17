import { useEffect, useState } from 'react'
import { Transforms } from 'slate'
import { ReactEditor, useFocused, useSelected, type RenderElementProps } from 'slate-react'
import type { CanvasResource } from '../../../sdk/types'
import type { MessageKey } from '../../../i18n/en'
import { RESOURCE_DRAG, type ResourceRuntime } from './slateRuntime'
import { BoardIcon } from './BoardIcon'
import type { useResourceUploads } from './useResourceUploads'

export function UploadTasks({ uploads, t }: { uploads: ReturnType<typeof useResourceUploads>; t: (key: MessageKey) => string }) {
  return uploads.tasks.length > 0 && <div className="canvas-upload-tasks" role="status">{uploads.tasks.map(task => <div key={task.id}><span>{task.file.name}</span><span>{task.error ? t('resource.failed') : `${Math.round(task.progress * 100)}%`}</span>{task.error && <button type="button" onClick={() => uploads.retry(task.id)}>{t('resource.retry')}</button>}<button type="button" aria-label={t('resource.cancel')} onClick={() => uploads.cancel(task.id)}>×</button></div>)}</div>
}
export function ResourceBlock({ attributes, children, element, editor, runtime, t, baseSize, align, elementId }: RenderElementProps & { editor: ReactEditor; baseSize: number; elementId: string; align?: string; runtime?: ResourceRuntime; t: (key: MessageKey) => string }) {
  const [menu, setMenu] = useState(false)
  const resource = (element as unknown as { resource: CanvasResource }).resource, [url, setUrl] = useState<string>(), selected = useSelected(), focused = useFocused()
  useEffect(() => {
    if (!runtime || resource.kind !== 'image') return
    const controller = new AbortController()
    runtime.resolve(resource.path, controller.signal).then(result => { if (!controller.signal.aborted) setUrl(result) }).catch(error => { if (!controller.signal.aborted) runtime.error(error) })
    return () => controller.abort()
  }, [resource.path, resource.kind, runtime])
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(false)
    document.addEventListener('pointerdown', close); window.addEventListener('blur', close)
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('blur', close) }
  }, [menu])
  const download = () => { setMenu(false); void runtime?.download(resource).catch(runtime.error) }
  return <div {...attributes} className={`rich-resource-block${selected && focused ? ' is-selected' : ''}`} data-resource-kind={resource.kind} style={{ marginLeft: align === 'right' || align === 'center' ? 'auto' : undefined, marginRight: align === 'center' ? 'auto' : undefined, width: resource.kind === 'image' ? `min(100%, ${(resource.width || 240) / baseSize}em)` : undefined }}>
    <div contentEditable={false} draggable={runtime?.canEdit()} title={t('resource.dragOut')} onDragStart={event => { if (!runtime?.canEdit()) { event.preventDefault(); return }; event.dataTransfer.setData(RESOURCE_DRAG, JSON.stringify({ elementId, resourceId: resource.id })); event.dataTransfer.effectAllowed = 'move' }} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setMenu(true) }} onPointerDown={event => { event.stopPropagation(); if ((event.target as HTMLElement).closest('button')) return; Transforms.select(editor, ReactEditor.findPath(editor, element)); ReactEditor.focus(editor) }}>
      {resource.kind === 'image' && url ? <img src={url} alt={resource.name || ''} draggable={false} style={{ aspectRatio: `${resource.width || 4}/${resource.height || 3}` }} /> : <div className="rich-file-chip"><span className="resource-file-icon">{resource.name?.split('.').at(-1)?.slice(0, 4).toUpperCase() || 'FILE'}</span><span>{resource.name || resource.path}<small>{resource.size === undefined ? '' : `${Math.ceil(resource.size / 1024)} KB`}</small></span></div>}
      {resource.kind === 'attachment' && <button type="button" className="rich-resource-download" aria-label={t('resource.download')} title={t('resource.download')} onPointerDown={event => { event.preventDefault(); event.stopPropagation() }} onClick={download}><BoardIcon name="export" size={16} /></button>}
      {menu && <div role="menu" className="rich-resource-menu" onPointerDown={event => event.stopPropagation()}><button type="button" role="menuitem" onClick={download}>{t('resource.download')}</button></div>}
      {selected && focused && <button className="rich-resource-preview" type="button" aria-label={t('resource.preview')} onPointerDown={event => { event.preventDefault(); event.stopPropagation() }} onClick={() => runtime?.preview(resource)}>{t('resource.preview')}</button>}
    </div>{children}
  </div>
}
