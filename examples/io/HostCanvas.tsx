import { useEffect, useRef, useState } from 'react'
import { CanvasEditor, type CanvasEditorRef, type CanvasEditorResources } from 'aidcanvas'
import type { CanvasModel } from 'aidcanvas/model'
import { CANVAS_IO_CAPABILITIES, type CanvasExportOptions, type CanvasIOProgress, type CanvasIOWarning } from 'aidcanvas/io'
import { downloadCanvasFile } from './workflow'
import 'aidcanvas/style.css'

export function HostCanvas(props: {
  model: CanvasModel // Restored once by the host, including outbox subscription and remote updates.
  resources: CanvasEditorResources
  canEdit: boolean
  showWarnings(warnings: CanvasIOWarning[]): void
  reportError(error: unknown): void
}) {
  const editor = useRef<CanvasEditorRef>(null), picker = useRef<HTMLInputElement>(null)
  const pending = useRef<AbortController | null>(null)
  const [progress, setProgress] = useState<CanvasIOProgress | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  const run = async (operation: (controller: AbortController) => Promise<void>) => {
    pending.current?.abort()
    const controller = new AbortController(); pending.current = controller
    try { await operation(controller) } catch (error) { props.reportError(error) }
    finally { if (pending.current === controller) { pending.current = null; setProgress(null) } }
  }
  const insert = (file: File, position?: { x: number; y: number }) => run(async controller => {
    if (!editor.current || !props.canEdit) return
    const result = await editor.current.insertImageFile(file, { ...position, signal: controller.signal, onProgress: setProgress })
    props.showWarnings(result.warnings)
  })
  const exportFile = (options: CanvasExportOptions) => run(async controller => {
    if (!editor.current) return
    // An active edit must finish first. exportFile itself never flushes/changes the model.
    const result = await editor.current.exportFile({ ...options, signal: controller.signal, onProgress: setProgress })
    props.showWarnings(result.warnings)
    downloadCanvasFile(result)
  })
  return <section onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }}
    onDrop={event => {
      const file = event.dataTransfer.files[0]
      if (file && editor.current) { event.preventDefault(); void insert(file, editor.current.clientToScene({ x: event.clientX, y: event.clientY })) }
    }} onPaste={event => {
      const file = event.clipboardData.files[0]
      if (file) { event.preventDefault(); void insert(file) }
    }}>
    <input ref={picker} hidden type="file" accept={CANVAS_IO_CAPABILITIES.imports.flatMap(f => f.extensions).join(',')}
      onChange={event => { const file = event.target.files?.[0]; if (file) void insert(file); event.target.value = '' }} />
    {progress && <div role="status">{progress.phase}: {progress.completed}/{progress.total} <button onClick={() => pending.current?.abort()}>取消</button></div>}
    <button onClick={() => void exportFile({ format: 'png', scope: 'selection', background: 'transparent', scale: 2 })}>导出选区 PNG</button>
    <CanvasEditor ref={editor} model={props.model} hostManaged mode={props.canEdit ? 'edit' : 'readonly'}
      resources={props.resources} onImportRequest={() => picker.current?.click()} onExportRequest={options => void exportFile(options)} />
  </section>
}
