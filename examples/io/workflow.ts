import type { CanvasEditorResources } from 'aidcanvas'
import { createCanvasImportValue, parseCanvasFile, type CanvasExportResult, type CanvasIOOptions, type CanvasIOWarning } from 'aidcanvas/io'
import type { ModelValue } from 'aidcanvas/model'

/** Host workflow, NOT a converter or an operation on the currently open model. */
export async function importAsNewCanvas(file: File, host: {
  resources: CanvasEditorResources
  canCreate(): boolean
  showWarnings(warnings: CanvasIOWarning[]): void
  // Server must recheck permission and initialize ONE new epoch from this value.
  // Store its original checkpoint, then distribute that checkpoint to new sessions.
  createDocument(value: ModelValue, signal?: AbortSignal): Promise<{ documentId: string }>
}, options: CanvasIOOptions = {}) {
  const assertAllowed = () => {
    options.signal?.throwIfAborted()
    if (!host.canCreate()) throw new Error('Permission revoked')
  }
  assertAllowed()
  const parsed = await parseCanvasFile(file, options)
  host.showWarnings(parsed.warnings)
  const paths: Record<string, string> = {}
  for (const asset of parsed.resources) {
    assertAllowed()
    if (!host.resources.uploadImage) throw new Error('Upload adapter required')
    const uploaded = await host.resources.uploadImage(asset.blob, {
      signal: options.signal, source: 'api', fileName: parsed.filename,
      onProgress: completed => options.onProgress?.({ phase: 'upload', completed, total: 1 }),
    })
    paths[asset.id] = uploaded.path
  }
  assertAllowed()
  return host.createDocument(createCanvasImportValue(parsed, paths), options.signal)
  // Do NOT call setValue/initialize on an existing collaborative document.
  // If creation is cancelled after upload, the host garbage-collects unattached assets.
}

/** Only the host triggers a download. Converters return a Blob and never click links. */
export function downloadCanvasFile(result: CanvasExportResult) {
  const url = URL.createObjectURL(result.blob), link = document.createElement('a')
  link.href = url; link.download = result.filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function authenticatedAssetReader(authorize: (path: string, signal?: AbortSignal) => Promise<string>): NonNullable<CanvasEditorResources['readImage']> {
  return async (path, { signal }) => {
    const url = await authorize(path, signal)
    const response = await fetch(url, { signal, credentials: 'include' })
    if (!response.ok) throw new Error(`Asset authorization/read failed: ${response.status}`)
    return response.blob() // A temporary URL never enters the document or converter.
  }
}
