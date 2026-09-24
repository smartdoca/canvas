import type { ModelValue, SceneNode } from '../model'

export type CanvasFileFormat = 'png' | 'jpeg' | 'webp' | 'svg'
export interface CanvasIOWarning { code: string; message: string; elementId?: string }
export interface CanvasIOProgress { phase: 'read' | 'sanitize' | 'decode' | 'upload' | 'resources' | 'render' | 'encode'; completed: number; total: number }
export interface CanvasIOOptions { signal?: AbortSignal; onProgress?: (progress: CanvasIOProgress) => void }
export interface CanvasImportOptions extends CanvasIOOptions {
  filename?: string
  /** Explicit host-approved fallback; otherwise editor metadata is rejected in phase 1. */
  ignoreEditableData?: boolean
}
export interface CanvasImportResource { id: string; blob: Blob; mimeType: string; width: number; height: number }
export interface CanvasImportResult {
  kind: 'image-asset'
  format: CanvasFileFormat
  filename: string
  width: number
  height: number
  resources: CanvasImportResource[]
  warnings: CanvasIOWarning[]
}
export interface CanvasInsertOptions extends CanvasImportOptions {
  /** Scene coordinates of top-left; omit to center in the current viewport. */
  x?: number; y?: number
  /** Bounding box; contain fit always preserves aspect ratio. */
  width?: number; height?: number
  select?: boolean
}
export interface CanvasInsertResult { elementId: string; element: SceneNode; warnings: CanvasIOWarning[] }
export interface CanvasExportOptions extends CanvasIOOptions {
  format: 'png' | 'svg'
  scope?: 'all' | 'selection'
  /** Used by standalone exportCanvasFile; the editor handle supplies its own selection. */
  elementIds?: string[]
  background?: 'transparent' | string
  scale?: number
  filename?: string
  /** Phase 2 only. true currently fails explicitly with EDITABLE_SVG_UNSUPPORTED. */
  preserveEditData?: boolean
  readAsset?: (path: string, context: CanvasIOOptions & { purpose: 'export' }) => Promise<Blob>
}
export interface CanvasExportResult { blob: Blob; filename: string; mimeType: 'image/png' | 'image/svg+xml'; width: number; height: number; warnings: CanvasIOWarning[] }
export type CanvasExportSource = Pick<ModelValue, 'scene'>
export const CANVAS_IO_CAPABILITIES = Object.freeze({
  phase: 1, editableSvgRoundtrip: false, jsonFiles: false,
  imports: [
    { format: 'png', mimeType: 'image/png', extensions: ['.png'] },
    { format: 'jpeg', mimeType: 'image/jpeg', extensions: ['.jpg', '.jpeg'] },
    { format: 'webp', mimeType: 'image/webp', extensions: ['.webp'] },
    { format: 'svg', mimeType: 'image/svg+xml', extensions: ['.svg'] },
  ],
  exports: ['png', 'svg'],
  limits: Object.freeze({ maxFileBytes: 10 * 1024 * 1024, maxSvgBytes: 2 * 1024 * 1024, maxImageSide: 16384, maxImagePixels: 32_000_000, maxSvgElements: 10000, maxSceneElements: 10000, maxExportSide: 8192, maxExportPixels: 32_000_000, maxExportAssetBytes: 40 * 1024 * 1024, minScale: 0.1, maxScale: 4 }),
} as const)

export class CanvasIOError extends Error {
  readonly code: string
  constructor(code: string, message = code) { super(message); this.name = 'CanvasIOError'; this.code = code }
}
