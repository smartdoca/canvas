import { useEffect, useRef, useState } from 'react'
import type { CanvasResource } from '../../../sdk/types'
import type { ResourceRuntime } from './slateRuntime'

type UploadTarget = { valid: () => boolean; insert: (resource: CanvasResource) => void; dispose: () => void }
type Task = { id: string; file: File; kind: 'image' | 'attachment'; progress: number; error?: boolean; controller: AbortController; target: UploadTarget }
/** Uploads stay in view state. Neither pending blobs nor authenticated URLs enter a document. */
export function useResourceUploads(runtime: ResourceRuntime | undefined, target: () => UploadTarget) {
  const [tasks, setTasks] = useState<Task[]>([]), live = useRef(new Map<string, Task>()), active = useRef(false)
  const publish = () => setTasks([...live.current.values()])
  useEffect(() => () => { live.current.forEach(task => { task.controller.abort(); task.target.dispose() }); live.current.clear() }, [])
  const run = async (task: Task) => {
    if (!runtime) return
    task.error = false; task.progress = 0; publish()
    try {
      const resource = await runtime.upload(task.file, task.controller.signal, progress => { task.progress = progress; publish() }, task.kind)
      task.controller.signal.throwIfAborted()
      if (!runtime.canEdit() || !task.target.valid()) throw new DOMException('Upload destination closed', 'AbortError')
      task.target.insert(resource); task.target.dispose(); live.current.delete(task.id); publish()
    } catch (error) {
      if (task.controller.signal.aborted || error instanceof DOMException && error.name === 'AbortError') { task.target.dispose(); live.current.delete(task.id) }
      else { task.error = true; runtime.error(error) }
      publish()
    }
  }
  const process = async () => {
    if (active.current) return
    active.current = true
    try {
      // Preserve a paste batch's order, even if the first file fails/retries.
      for (;;) {
        const task = live.current.values().next().value
        if (!task || task.error) break
        await run(task)
      }
    } finally { active.current = false }
  }
  return { tasks, add: (files: File[], requestedKind?: 'image' | 'attachment') => {
    for (const file of files) {
      const kind = requestedKind || (file.type.startsWith('image/') ? 'image' : 'attachment')
      if (!runtime?.canEdit() || !runtime.canUpload(kind)) continue
      const task = { id: crypto.randomUUID(), file, kind, progress: 0, controller: new AbortController(), target: target() }
      live.current.set(task.id, task)
    }
    publish(); void process()
  }, cancel: (id: string) => { const task = live.current.get(id); if (task) { task.controller.abort(); task.target.dispose(); live.current.delete(id); publish(); void process() } }, retry: (id: string) => { const task = live.current.get(id); if (task) { task.controller = new AbortController(); task.error = false; void process() } } }
}
