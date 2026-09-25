import type { CSSProperties, FC, ReactNode } from 'react'
import type { IUIJSONData } from 'leafer-ui'
import type { CanvasDocument } from '../editor/core/document'
import type { CanvasModel, ElementAnchor, SessionSelection } from '../model'
import type { CanvasExportOptions, CanvasExportResult, CanvasInsertOptions, CanvasInsertResult, CanvasIOOptions } from '../io/types'

export type CanvasValue = CanvasDocument
export type CanvasElement = Record<string, unknown>

export interface CustomShapeDefinition {
  type: string
  label: string
  path: string
}

export interface CanvasElementBounds { x: number; y: number; width: number; height: number }

export interface CanvasElementPropertyControlProps {
  value: unknown
  selection: CanvasElement[]
  onChange: (value: unknown) => void
}

export interface CanvasElementProperty {
  key: string
  label: string
  order?: number
  defaultValue?: unknown
  control: FC<CanvasElementPropertyControlProps>
  getValue?: (element: CanvasElement) => unknown
  setValue?: (element: CanvasElement, value: unknown) => CanvasElement
}

export interface CanvasElementExtension {
  /** Unique element name persisted as element.name. */
  type: string
  label: string
  icon?: ReactNode
  shortcut?: string
  create: (context: { bounds: CanvasElementBounds; properties: Record<string, unknown> }) => IUIJSONData
  properties?: CanvasElementProperty[]
}

export interface CanvasSelectionActionContext {
  selection: CanvasElement[]
  getValue: () => CanvasValue
  updateSelection: (patch: CanvasElement) => void
  removeSelection: () => void
}

export interface CanvasSelectionAction {
  id: string
  label: string
  icon?: ReactNode
  /** Explicit host permission; omitted actions are edit-only. */
  allowInReadOnly?: boolean
  disabled?: boolean | ((selection: CanvasElement[]) => boolean)
  tooltip?: string
  visible?: (selection: CanvasElement[]) => boolean
  onClick: (context: CanvasSelectionActionContext) => void | Promise<void>
}

export interface CanvasImageStorageAdapter {
  /** Store an uploaded/edited image and return the URL persisted in canvas JSON. */
  save: (file: Blob, context: { fileName: string; source: 'upload' | 'edit' | 'api' }) => Promise<string>
}

export interface CanvasResourceUploadContext {
  fileName: string
  source: 'upload' | 'edit' | 'api'
  signal?: AbortSignal
  onProgress?: (progress: number) => void
}

export interface CanvasImageResource {
  /** Stable resource identifier/path persisted in the document. */
  path: string
  name?: string
  size?: number
  mimeType?: string
  width?: number
  height?: number
}

export interface CanvasEditorResources {
  uploadImage?: (file: Blob, context: CanvasResourceUploadContext) => Promise<CanvasImageResource>
  resolveUrl: (path: string, context: { signal?: AbortSignal }) => string | Promise<string>
  resolveDownloadUrl?: (path: string, context: { signal?: AbortSignal }) => string | Promise<string>
  /** Host authorizes and returns original bytes for self-contained export; converter never fetches URLs. */
  readImage?: (path: string, context: CanvasIOOptions & { purpose: 'export' }) => Promise<Blob>
}

export type CanvasConnectionStatus = 'loading' | 'syncing' | 'ready' | 'disconnected' | 'error'
export type CanvasSaveStatus = 'clean' | 'dirty' | 'saving' | 'error'

export interface CanvasCollaborationUpdate {
  id: string
  protocolVersion: 1
  codec: 'aidcanvas'
  schemaVersion: number
  epochId?: string
  value: CanvasValue
}

export interface CanvasCollaborationAck {
  id: string
  epochId?: string
  seq?: number
}

export interface CanvasCollaborationProvider {
  /** Establish one session. Identity and epoch must come from the server. */
  connect: (handlers: {
    onRemoteValue: (value: CanvasValue, meta?: { epochId?: string; seq?: number }) => void
    onStatusChange?: (status: CanvasConnectionStatus | 'connecting' | 'connected') => void
    onAcknowledgement?: (ack: CanvasCollaborationAck) => void
    onError?: (error: unknown) => void
  }) => void | (() => void)
  /** Returning an ACK enables strict durable-save state. Void remains supported for legacy providers. */
  publish: (value: CanvasValue, update?: CanvasCollaborationUpdate) => void | CanvasCollaborationAck | Promise<void | CanvasCollaborationAck>
}

export interface CanvasChangeMeta {
  source: 'local' | 'api' | 'remote'
}

export interface CanvasLocalTransaction {
  id: string
  origin: 'local'
  schemaVersion: number
  value: CanvasValue
}

export interface CanvasTextMatch {
  id: string
  elementId: string
  start: number
  end: number
  text: string
  revision: string
}

export interface CanvasFindOptions { caseSensitive?: boolean }
export interface CanvasAnchorDecoration { anchorId: string; anchor: ElementAnchor; resolved?: boolean; label?: string }
export interface CanvasAnchorClick { anchorId: string; anchor: ElementAnchor; elementIds: string[] }
export interface CanvasRevealOptions { padding?: number; maxZoom?: number }
export interface CanvasRevealResult {
  revealed: boolean
  elementIds: string[]
  missingIds: string[]
  hiddenIds: string[]
  bounds?: CanvasElementBounds
}

export interface CanvasEditorCapabilities {
  find: true
  replace: true
  resources: boolean
  collaborationCodec: 'snapshot' | 'aidcanvas-yjs'
  anchors: boolean
  presence: boolean
  anchorDecorations: boolean
  revealElements: true
  textRangeAnchors: false
  characterPresence: false
}

export interface CanvasEditorProps {
  /** Stable, bootstrapped instance from aidcanvas/model. Owns no network or storage. */
  model?: CanvasModel
  hostManaged?: boolean
  sessionId?: string
  remoteSelections?: SessionSelection[]
  onPresenceChange?: (selection: { elementIds: string[] } | null) => void
  /** Permanent element-comment decorations, independent from native selection and presence. */
  anchors?: CanvasAnchorDecoration[]
  activeAnchorId?: string | null
  onAnchorClick?: (event: CanvasAnchorClick) => void
  mode?: 'edit' | 'readonly'
  value?: CanvasValue
  defaultValue?: CanvasValue
  onChange?: (value: CanvasValue, meta: CanvasChangeMeta) => void
  customShapes?: CustomShapeDefinition[]
  elementExtensions?: CanvasElementExtension[]
  selectionActions?: CanvasSelectionAction[]
  /** Top host-owned actions; available without selection and with showToolbar=false.
   * Uses the same permission, icon, tooltip and dynamic disabled contract as selectionActions.
   */
  hostActions?: CanvasSelectionAction[]
  onImportRequest?: () => void
  onExportRequest?: (options: Pick<CanvasExportOptions, 'format'>) => void
  imageStorage?: CanvasImageStorageAdapter
  resources?: CanvasEditorResources
  /** Preferred shorthand for host-controlled image upload. Takes precedence over imageStorage. */
  onImageUpload?: CanvasImageStorageAdapter['save']
  /** Called by the built-in image download action. The host owns the download when supplied. */
  onImageDownload?: (context: CanvasImageDownloadContext) => void | Promise<void>
  collaboration?: CanvasCollaborationProvider
  /** Recommended Doca integration: forward local transactions to the host-owned outbox. */
  onLocalTransaction?: (transaction: CanvasLocalTransaction) => void
  /** Host-owned save state. When supplied it is the displayed source of truth. */
  saveStatus?: CanvasSaveStatus
  autoSave?: boolean
  storageKey?: string
  readOnly?: boolean
  showHeader?: boolean
  showToolbar?: boolean
  /** @deprecated Built-in layers UI was removed. Retained as a no-op for existing hosts. */
  showLayers?: boolean
  /** @deprecated Built-in layers UI was removed. Retained as a no-op for existing hosts. */
  layersPosition?: 'left' | 'right'
  showZoomControls?: boolean
  title?: ReactNode
  headerActions?: ReactNode
  toolbarStart?: ReactNode
  toolbarEnd?: ReactNode
  /** `zh` or `en`. Omitted means Chinese. Unknown codes fall back to English. */
  locale?: string
  /** Replaces individual built-in message keys. Other keys stay on the locale catalog. */
  messages?: Record<string, string>
  labels?: Partial<CanvasEditorLabels>
  style?: CSSProperties
  theme?: CSSProperties & Record<`--aidcanvas-${string}`, string | number>
  onSelectionChange?: (selection: CanvasElement[]) => void
  onSaveStatusChange?: (status: CanvasSaveStatus) => void
  onSaveRequest?: (value: CanvasValue) => void | Promise<void>
  onConnectionStatusChange?: (status: CanvasConnectionStatus) => void
  onError?: (error: unknown) => void
  onReady?: (handle: CanvasEditorRef) => void
  className?: string
}

export interface CanvasEditorLabels {
  title: string
  save: string
  import: string
  export: string
  exportPng: string
  exportSvg: string
  exportJson: string
  layers: string
}

export interface CanvasImageDownloadContext {
  element: CanvasElement
  url: string
  path?: string
  fileName: string
  download: () => Promise<void>
}

export interface AddImageOptions {
  signal?: AbortSignal
  fileName?: string
  x?: number
  y?: number
  width?: number
  height?: number
  select?: boolean
}

export interface CanvasEditorRef {
  clientToScene: (point: { x: number; y: number }) => { x: number; y: number }
  revealElements: (elementIds: string[], options?: CanvasRevealOptions) => CanvasRevealResult
  revealAnchor: (anchor: ElementAnchor, options?: CanvasRevealOptions) => CanvasRevealResult
  undo: () => void
  redo: () => void
  flush: () => void
  groupSelection: () => void
  ungroupSelection: () => void
  captureAnchor: () => ElementAnchor | null
  resolveAnchor: (anchor: ElementAnchor) => { valid: boolean; partial: boolean; elementIds: string[] }
  getValue: () => CanvasValue
  setValue: (value: CanvasValue) => void
  applyRemoteValue: (value: CanvasValue, meta?: { epochId?: string; seq?: number }) => void
  getSelection: () => CanvasElement[]
  select: (ids: string[]) => void
  updateSelection: (patch: CanvasElement) => void
  removeSelection: () => void
  addElement: (element: IUIJSONData) => CanvasElement | null
  addCustomShape: (type: string, options?: { x?: number; y?: number; width?: number; height?: number }) => CanvasElement | null
  addExtensionElement: (type: string, bounds?: CanvasElementBounds) => CanvasElement | null
  addImage: (source: File | Blob | string, options?: AddImageOptions) => Promise<CanvasElement | null>
  insertImageFile: (file: Blob, options?: CanvasInsertOptions) => Promise<CanvasInsertResult>
  exportFile: (options: CanvasExportOptions) => Promise<CanvasExportResult>
  /** Compatibility alias, now returns a typed file result and never triggers a download. */
  exportImage: (type?: 'png' | 'svg', options?: Omit<CanvasExportOptions, 'format'>) => Promise<CanvasExportResult>
  find: (query: string, options?: CanvasFindOptions) => CanvasTextMatch[]
  reveal: (match: CanvasTextMatch) => boolean
  replace: (match: CanvasTextMatch, text: string) => boolean
  replaceAll: (query: string, text: string, options?: CanvasFindOptions) => number
  capabilities: CanvasEditorCapabilities
}

export const dataUrlImageStorage: CanvasImageStorageAdapter = {
  save: (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error || new Error('图片读取失败'))
    reader.readAsDataURL(file)
  }),
}
