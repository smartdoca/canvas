import { useResourceUploads } from './useResourceUploads'
import { useEffect, useRef } from 'react'
import type { App } from 'leafer-ui'
import type { CanvasResource } from '../../../sdk/types'
import { useCanvasI18n } from '../../../i18n/context'
import { RESOURCE_DRAG, resourceRuntime } from './slateRuntime'
import { UploadTasks } from './resources'
import { ownsCanvasCommands } from '../utils/keyboardOwnership'

/** The same host upload contract is used by the canvas and every rich text surface. */
export function CanvasResources({ app, onInsert, onExtract }: { app: App; onExtract: (source: { elementId: string; resourceId: string }, point: { x: number; y: number }) => void; onInsert: (resource: CanvasResource, point: { x: number; y: number }) => void }) {
  const t = useCanvasI18n(), point = useRef<{ x: number; y: number }>(), sequence = useRef(0), runtime = resourceRuntime(app)
  const uploads = useResourceUploads(runtime, () => {
    const host = (app.view as HTMLElement).closest<HTMLElement>('.canvas-app')!, bounds = host.getBoundingClientRect()
    const at = point.current || app.tree.getInnerPoint(app.tree.getWorldPointByClient({ clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 }))
    const offset = sequence.current++ * 24
    return { valid: () => !app.destroyed, dispose: () => {}, insert: resource => onInsert(resource, { x: at.x + offset, y: at.y + offset }) }
  })
  useEffect(() => {
    const host = (app.view as HTMLElement).closest<HTMLElement>('.canvas-app')!
    const isRich = (target: EventTarget | null) => target instanceof HTMLElement && target.closest('input,textarea,[contenteditable],.canvas-slate-mount')
    const paste = (event: ClipboardEvent) => {
      if (!ownsCanvasCommands(event, host) || isRich(event.target) || !event.clipboardData?.files.length) return
      event.preventDefault(); point.current = undefined; sequence.current = 0; uploads.add([...event.clipboardData.files])
    }
    const over = (event: DragEvent) => { if (!isRich(event.target) && (event.dataTransfer?.types.includes('Files') || event.dataTransfer?.types.includes(RESOURCE_DRAG))) event.preventDefault() }
    const drop = (event: DragEvent) => {
      const encoded = event.dataTransfer?.getData(RESOURCE_DRAG)
      if (encoded && !isRich(event.target) && (app.view as HTMLElement).closest('.canvas-host')!.contains(event.target as Node) && runtime?.canEdit()) {
        event.preventDefault(); event.stopPropagation()
        try { const source = JSON.parse(encoded); if (typeof source.elementId === 'string' && typeof source.resourceId === 'string') onExtract(source, app.tree.getInnerPoint(app.tree.getWorldPointByClient(event))) } catch { /* Untrusted drag payload. */ }
        return
      }
      if (event.defaultPrevented || isRich(event.target) || !event.dataTransfer?.files.length) return
      event.preventDefault(); point.current = app.tree.getInnerPoint(app.tree.getWorldPointByClient(event)); sequence.current = 0; uploads.add([...event.dataTransfer.files])
    }
    window.addEventListener('paste', paste); host.addEventListener('dragover', over); host.addEventListener('drop', drop)
    return () => { window.removeEventListener('paste', paste); host.removeEventListener('dragover', over); host.removeEventListener('drop', drop) }
  }, [app, uploads, onExtract, runtime])
  return <div className="canvas-board-upload-status"><UploadTasks uploads={uploads} t={t} /></div>
}
