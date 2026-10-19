import type { IUI } from 'leafer-ui'
import type { CanvasResource } from '../../../sdk/types'

export const isNativeImage = (item?: IUI) => Boolean(item && (item.tag === 'Image' || item.name === 'image'))
export function nativeImageSource(item: IUI) {
  const fill = item.fill && typeof item.fill === 'object' && !Array.isArray(item.fill) ? item.fill as unknown as { url?: string } : undefined
  return String((item as unknown as { url?: string }).url || item.data?.sourceUrl || fill?.url || '')
}
export function nativeImageResource(item: IUI): CanvasResource {
  return { kind: 'image', id: item.id!, path: item.data?.resourcePath || nativeImageSource(item), name: item.data?.fileName,
    width: item.data?.naturalWidth || Number(item.width), height: item.data?.naturalHeight || Number(item.height) }
}
