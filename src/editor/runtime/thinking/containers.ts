import { Frame, Path, Rect, Text, type IUI } from 'leafer-ui'
import { createElementId } from '../../../model'
import type { Translator } from '../../../i18n/context'
import type { MessageKey } from '../../../i18n/en'
import { syncPhoneFrame } from './phoneFrame'

export const containerGroups = [
  { key: 'boards', types: ['section', 'board', 'corkboard'] },
  { key: 'print', types: ['wide', 'standard', 'portrait', 'square', 'a4', 'presentation'] },
  { key: 'devices', types: ['phone', 'tablet', 'web', 'watch'] },
  { key: 'layout', types: ['horizontal', 'vertical'] },
  { key: 'swimlane', types: ['swimlane-horizontal', 'swimlane-vertical'] },
  { key: 'special', types: ['axes', 'matrix'] },
] as const
export type ContainerType = typeof containerGroups[number]['types'][number]
type Preset = { width: number; height: number; icon: string; ratio?: number; fill?: string; radius?: number }
export const containerPresets: Record<ContainerType, Preset> = {
  section: { width: 480, height: 320, icon: 'section', fill: 'transparent', radius: 8 },
  board: { width: 800, height: 600, icon: 'artboard' },
  corkboard: { width: 800, height: 560, icon: 'corkboard', fill: '#faf1df', radius: 8 },
  wide: { width: 800, height: 450, icon: 'wide', ratio: 16 / 9 },
  standard: { width: 800, height: 600, icon: 'standard', ratio: 4 / 3 },
  portrait: { width: 600, height: 800, icon: 'portrait', ratio: 3 / 4 },
  square: { width: 640, height: 640, icon: 'square-ratio', ratio: 1 },
  a4: { width: 595, height: 842, icon: 'paper', ratio: 595 / 842 },
  presentation: { width: 960, height: 540, icon: 'presentation', ratio: 16 / 9 },
  phone: { width: 390, height: 844, icon: 'phone', radius: 46, ratio: 390 / 844 },
  tablet: { width: 820, height: 1180, icon: 'tablet', radius: 24, ratio: 820 / 1180 },
  web: { width: 1280, height: 800, icon: 'web', radius: 8, ratio: 1280 / 800 },
  watch: { width: 198, height: 242, icon: 'watch', radius: 42, ratio: 198 / 242 },
  horizontal: { width: 640, height: 280, icon: 'horizontal', radius: 8 },
  vertical: { width: 320, height: 560, icon: 'vertical', radius: 8 },
  'swimlane-horizontal': { width: 800, height: 480, icon: 'swimlane-horizontal' },
  'swimlane-vertical': { width: 800, height: 480, icon: 'swimlane-vertical' },
  axes: { width: 640, height: 480, icon: 'axes' },
  matrix: { width: 640, height: 480, icon: 'matrix' },
}
export const containerLabel = (type: ContainerType) => `container.${type}` as MessageKey
export function containerType(key: string): ContainerType | undefined {
  if (key === 'frame') return 'section'
  const type = key.startsWith('container:') ? key.slice(10) : ''
  return Object.hasOwn(containerPresets, type) ? type as ContainerType : undefined
}
export const isCanvasContainer = (item: IUI | undefined | null): item is Frame => item instanceof Frame && item.name === 'frame' && (!item.data?.kind || item.data.kind === 'container')
export const isContainerPart = (item: IUI) => item.name === 'frame-title' || Boolean(item.data?.containerPart)
export const containerContents = (frame: IUI) => (frame.children || []).filter(item => !isContainerPart(item))
export const isAutoLayout = (frame: IUI) => ['horizontal', 'vertical'].includes(frame.data?.containerType)

/** Click, drag, preview and library insertion all use the same dimensions. */
export function containerBounds(type: ContainerType, start: { x: number; y: number }, end?: { x: number; y: number }) {
  const preset = containerPresets[type]
  if (!end) return { x: start.x - preset.width / 2, y: start.y - preset.height / 2, width: preset.width, height: preset.height }
  let width = Math.max(120, Math.abs(end.x - start.x)), height = Math.max(100, Math.abs(end.y - start.y))
  if (preset.ratio) { width = Math.max(width, height * preset.ratio); height = width / preset.ratio }
  return { x: end.x < start.x ? start.x - width : start.x, y: end.y < start.y ? start.y - height : start.y, width, height }
}

export function makeContainer(type: ContainerType, bounds: { x: number; y: number; width: number; height: number }, t: Translator) {
  const preset = containerPresets[type], title = t(containerLabel(type)), layout = ['horizontal', 'vertical'].includes(type)
  const frame = new Frame({ id: createElementId(), name: 'frame', ...bounds, fill: preset.fill || '#ffffff', stroke: type === 'section' || layout ? '#9aaff0' : '#b8bec9', strokeWidth: 1,
    dashPattern: type === 'section' || layout ? [8, 4] : undefined, cornerRadius: preset.radius || 0, hitFill: preset.fill === 'transparent' ? 'none' : 'path', hitStroke: 'path',
    overflow: ['section', 'corkboard', 'horizontal', 'vertical'].includes(type) ? 'show' : 'hide', editable: true, lockRatio: Boolean(preset.ratio),
    editConfig: preset.ratio ? { lockRatio: true } : undefined,
    data: { kind: 'container', containerType: type, title, gap: 24, padding: 28 } })
  const part = (role: string, index = 0) => ({ id: createElementId(), name: `container-${role}`, editable: false, hittable: false, data: { kind: 'container-decoration', containerPart: role, index } })
  frame.add(new Text({ id: createElementId(), name: 'frame-title', text: title, x: 20, y: 14, width: bounds.width - 40, height: 24, fill: '#646a73', fontSize: 14, fontWeight: 600, editable: true, data: { containerPart: 'title' } }))
  if (type.startsWith('swimlane-') || type === 'matrix') {
    const count = type === 'matrix' ? 4 : 3
    for (let i = 0; i < count; i++) {
      frame.add(new Rect({ ...part('cell', i), fill: (type === 'matrix' ? ['#f0f5ff', '#f1f8f4', '#fff8e8', '#f6f1fb'] : ['#f3f6fc', '#f3f8f5', '#fcf8ee'])[i], stroke: '#d5dae3', strokeWidth: 1 }))
      frame.add(new Text({ ...part('label', i), text: t(type === 'matrix' ? 'container.quadrant' : 'container.lane', { index: i + 1 }), fill: '#646a73', fontSize: 14, editable: true, hittable: true }))
    }
  }
  if (type === 'axes') {
    frame.add(new Path({ ...part('axes'), stroke: '#8a929f', strokeWidth: 1.5 }))
    for (let i = 0; i < 2; i++) frame.add(new Text({ ...part('axis-label', i), text: t(i ? 'container.yAxis' : 'container.xAxis'), fontSize: 14, fill: '#646a73', editable: true, hittable: true }))
  }
  if (layout) frame.add(new Text({ ...part('layout-hint'), text: t('container.layoutHint'), fontSize: 14, fill: '#a0a6b1', textAlign: 'center', verticalAlign: 'middle' }))
  if (type === 'phone' || type === 'tablet' || type === 'watch') frame.add(new Rect({ ...part('device-bar'), fill: '#d5dae3', cornerRadius: 3 }))
  if (type === 'web') frame.add(new Path({ ...part('browser-bar'), stroke: '#d5dae3', strokeWidth: 1 }))
  syncContainerGeometry(frame)
  return frame
}

const positioning = new WeakSet<IUI>()
/** Update existing guides, preserving edited labels and every content element. */
export function syncContainerGeometry(frame: Frame) {
  if (positioning.has(frame) || !frame.data?.containerType) return
  positioning.add(frame)
  try {
    const width = Number(frame.width), height = Number(frame.height), type: ContainerType = frame.data.containerType
    if (containerPresets[type]?.ratio) {
      frame.lockRatio = true
      if (frame.editConfig?.lockRatio !== true) frame.editConfig = { ...frame.editConfig, lockRatio: true }
    }
    const title = frame.children.find(item => item.name === 'frame-title')
    if (type === 'phone') syncPhoneFrame(frame)
    // Keep the existing right inset while honoring the title's actual origin.
    // Right-aligned authored titles otherwise extend beyond a clipped Frame.
    else title?.set({ width: Math.max(40, width - Number(title.x) - 20) })
    for (const item of frame.children) {
      const role = item.data?.containerPart, i = Number(item.data?.index || 0), top = 50
      if (role === 'cell' || role === 'label') {
        const vertical = type === 'swimlane-vertical', matrix = type === 'matrix', columns = matrix ? 2 : vertical ? 3 : 1, rows = matrix ? 2 : vertical ? 1 : 3
        const w = width / columns, h = Math.max(30, height - top) / rows, x = (matrix ? i % 2 : vertical ? i : 0) * w, y = top + (matrix ? Math.floor(i / 2) : vertical ? 0 : i) * h
        item.set(role === 'cell' ? { x, y, width: w, height: h } : { x: x + 16, y: y + 12, width: Math.max(20, w - 32), height: 22 })
      }
      if (role === 'axes') item.set({ path: `M48 ${height - 44}V60m-5 8 5-8 5 8M48 ${height - 44}H${width - 30}m-8-5 8 5-8 5` })
      if (role === 'axis-label') item.set(i ? { x: 18, y: 54, width: 28, height: 24 } : { x: width - 50, y: height - 32, width: 40, height: 24 })
      if (role === 'layout-hint') item.set({ x: 28, y: 56, width: Math.max(40, width - 56), height: Math.max(40, height - 84), visible: containerContents(frame).length === 0 })
      if (role === 'device-bar' && type !== 'phone') item.set({ x: width / 2 - 20, y: height - 14, width: 40, height: 4 })
      if (role === 'browser-bar') item.set({ path: `M0 44H${width}M18 23h2m8 0h2m8 0h2` })
    }
  } finally { positioning.delete(frame) }
}

export function layoutContainer(frame: Frame, reorder = false) {
  if (!isAutoLayout(frame) || positioning.has(frame)) return
  positioning.add(frame)
  try {
    // Freehand ink is positioned by the drawing gesture. It stays attached to
    // the frame, but must not be moved or measured as a row/column layout item.
    const horizontal = frame.data?.containerType === 'horizontal', contents = containerContents(frame).filter(item => item.name !== 'path'), original = [...contents], padding = Number(frame.data?.padding ?? 28), gap = Number(frame.data?.gap ?? 24)
    if (reorder) contents.sort((a, b) => Number(horizontal ? a.x : a.y) - Number(horizontal ? b.x : b.y))
    let cursor = padding, cross = 0
    contents.forEach(item => {
      const bounds = item.getBounds('box', 'local'), x = horizontal ? cursor : padding, y = horizontal ? 56 : cursor + 28
      item.set({ x: Number(item.x || 0) + x - bounds.x, y: Number(item.y || 0) + y - bounds.y })
      cursor += (horizontal ? bounds.width : bounds.height) + gap; cross = Math.max(cross, horizontal ? bounds.height : bounds.width)
    })
    if (reorder && contents.some((item, i) => item !== original[i])) contents.forEach(item => frame.add(item))
    if (contents.length) frame.set({ width: Math.max(Number(frame.width), horizontal ? cursor - gap + padding : cross + padding * 2), height: Math.max(Number(frame.height), horizontal ? cross + 56 + padding : cursor - gap + padding + 28) })
  } finally { positioning.delete(frame) }
  syncContainerGeometry(frame)
}
