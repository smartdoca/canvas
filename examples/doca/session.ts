import { CanvasModel, type CanvasCheckpoint, type CanvasUpdate } from 'aidcanvas/model'

/** Implemented by Doca's existing authenticated room runtime. */
export interface DocaRuntime {
  enqueue(update: CanvasUpdate): void
  onRemoteUpdate(callback: (update: CanvasCheckpoint) => void): () => void
  publishSelection(selection: { elementIds: string[] } | null): void
  reportError(error: unknown): void
}

/** Create once per document session, before mounting. Checkpoint comes from the authority. */
export function createDocaCanvasSession(checkpoint: CanvasCheckpoint, runtime: DocaRuntime) {
  const model = CanvasModel.restore(checkpoint)
  const stopLocal = model.onLocalUpdate(update => runtime.enqueue(update))
  const stopRemote = runtime.onRemoteUpdate(update => {
    try { model.applyUpdate(update) } catch (error) { runtime.reportError(error) }
  })
  return {
    model,
    prepareClose() { return model.checkpoint() },
    dispose() { model.dispose(); stopRemote(); stopLocal() },
  }
}
