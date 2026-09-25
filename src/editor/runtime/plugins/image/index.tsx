import type { IUI } from 'leafer-ui'
import type { Plugins, styleValue } from '../plugins'
import { ImageSizeControl } from './styleRender'

function setImageSizeMode(item: IUI, value: styleValue) {
  const mode = String(value)
  const data: Record<string, unknown> = { ...(item.data || {}), imageSizeMode: mode }
  item.data = data
  if (mode === 'original') {
    const naturalWidth = Number(data.naturalWidth || 0)
    const naturalHeight = Number(data.naturalHeight || 0)
    if (naturalWidth && naturalHeight) {
      const oldHeight = Number(item.height || 1)
      const nextHeight = Number(item.width || naturalWidth) * naturalHeight / naturalWidth
      item.y = Number(item.y || 0) + (oldHeight - nextHeight) / 2
      item.height = nextHeight
    }
  }
  item.lockRatio = mode !== 'free'
}

// Image content editing deliberately lives in the isolated modal editor.
// The canvas property panel only owns element-level presentation attributes.
export const imagePlugin: Plugins = {
  name: 'image',
  AddMenu: () => null,
  styleControlKeys: ['imageSizeMode', 'opacity'],
  customStyleControlRenders: [{ key: 'imageSizeMode', title: 'style.imageSize', order: 0, render: ImageSizeControl }],
  setStyleCustom: { imageSizeMode: setImageSizeMode },
  getStyleCustom: { imageSizeMode: (item) => String(item.data?.imageSizeMode || (item.lockRatio ? 'locked' : 'free')) },
}
