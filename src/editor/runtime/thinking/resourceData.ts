import type { App, Text } from 'leafer-ui'
import type { CanvasResource } from '../../../sdk/types'
import { resourceRuntime } from './slateRuntime'

export const RESOURCE_MARKER = '\uFFFC'
export function cleanResource(value?: CanvasResource): CanvasResource | undefined {
  if (!value || !['image', 'attachment'].includes(value.kind) || typeof value.id !== 'string' || !value.id || typeof value.path !== 'string' || !value.path.trim() || /^(blob|data|javascript|file):/i.test(value.path) || /^https?:\/\/[^\s]*[?#]/i.test(value.path)) return
  return { id: value.id, kind: value.kind, path: value.path,
    ...(typeof value.name === 'string' ? { name: value.name } : {}), ...(Number.isFinite(value.size) ? { size: value.size } : {}), ...(typeof value.mimeType === 'string' ? { mimeType: value.mimeType } : {}),
    ...(Number(value.width) > 0 ? { width: Number(value.width) } : {}), ...(Number(value.height) > 0 ? { height: Number(value.height) } : {}) }
}
const imageViews = new WeakMap<object, Map<string, { image?: HTMLImageElement; loading?: boolean }>>()
export function resourceImage(app: object | null | undefined, path: string) { return app && imageViews.get(app)?.get(path)?.image }
export function prepareResourceImage(text: Text, resource: CanvasResource) {
  const app = text.app as App, runtime = resourceRuntime(app)
  if (!app || !runtime || resource.kind !== 'image') return
  let cache = imageViews.get(app)
  if (!cache) imageViews.set(app, cache = new Map())
  const entry = cache.get(resource.path) || {}
  if (entry.image || entry.loading) return
  cache.set(resource.path, entry); entry.loading = true
  const controller = new AbortController()
  runtime.resolve(resource.path, controller.signal).then(url => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.crossOrigin = 'anonymous'; image.onload = () => resolve(image); image.onerror = reject; image.src = url
  })).then(image => { if (app.destroyed || text.destroyed) return; entry.image = image; text.forceUpdate('fontSize'); app.forceRender() }).catch(error => { if (!app.destroyed && !text.destroyed) runtime.error(error) }).finally(() => { entry.loading = false })
}
