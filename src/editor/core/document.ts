import type { IUIJSONData } from 'leafer-ui'

export const CANVAS_DOCUMENT_VERSION = 1
export const CANVAS_STORAGE_KEY = 'aidcanvas.document'

export interface CanvasDocument {
  version: number
  name: string
  updatedAt: string
  scene: IUIJSONData
}

export function createDocument(scene: IUIJSONData, name = '未命名画布'): CanvasDocument {
  return {
    version: CANVAS_DOCUMENT_VERSION,
    name,
    updatedAt: new Date().toISOString(),
    scene,
  }
}

export function parseDocument(value: string): CanvasDocument {
  const document = JSON.parse(value) as CanvasDocument
  if (document.version !== CANVAS_DOCUMENT_VERSION || !document.scene) {
    throw new Error('不支持的画布文件版本')
  }
  return document
}

export function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
