import type { MessageKey } from '../../../i18n/en'
import type { CanvasRichTextExtension } from '../../../sdk/types'

// Native inner editors are mounted in their own React root. Keep the host's
// locale/message overrides available without serializing functions into scenes.
const translators = new WeakMap<object, (key: MessageKey) => string>()
export function setSlateTranslator(app: object, translate: (key: MessageKey) => string) { translators.set(app, translate) }
export function slateLabel(app: object, key: MessageKey) { return translators.get(app)?.(key) }

export interface ResourceRuntime {
  canEdit: () => boolean
  canUpload: (kind: 'image' | 'attachment') => boolean
  upload: (file: File, signal: AbortSignal, onProgress: (progress: number) => void, kind?: 'image' | 'attachment') => Promise<import('../../../sdk/types').CanvasResource>
  resolve: (path: string, signal: AbortSignal) => Promise<string>
  download: (resource: import('../../../sdk/types').CanvasResource, element?: import('../../../sdk/types').CanvasElement) => Promise<void>
  preview: (resource: import('../../../sdk/types').CanvasResource) => void
  error: (error: unknown) => void
}
const resourceRuntimes = new WeakMap<object, ResourceRuntime>()
export function setResourceRuntime(app: object, runtime: ResourceRuntime) { resourceRuntimes.set(app, runtime) }
export function resourceRuntime(app?: object | null) { return app ? resourceRuntimes.get(app) : undefined }

const richExtensions = new WeakMap<object, () => CanvasRichTextExtension[]>()
export function setRichExtensions(app: object, extensions: () => CanvasRichTextExtension[]) { richExtensions.set(app, extensions) }
export function getRichExtensions(app: object) { return richExtensions.get(app)?.() || [] }
export const RESOURCE_DRAG = 'application/x-aidcanvas-rich-resource'
