import { Path, type IUI } from 'leafer-ui'
import rough from 'roughjs'
import { SPECIAL_SHAPES } from '../plugins/specialShape/const'
import { getStyleParamsFromLocalStorage } from './styleLocalStorage'

export const ROUGH_STYLE_KEY = 'roughMode'
export const ROUGH_FILL_STYLE_KEY = 'roughFillStyle'
export const ROUGH_STROKE_STYLE_KEY = 'roughStrokeStyle'
const supportedNames = new Set(['rect', 'square', 'ellipse', 'circle', 'line', 'arrow', 'polygon', 'star', 'frame', 'special-shape'])
const generator = rough.generator()
const creationPreviews = new WeakMap<IUI, { path: Path; fillReady: boolean }>()

type RoughData = Record<string, unknown> & {
  roughMode?: boolean
  roughSeed?: number
  roughOriginalPath?: unknown
  roughOriginalFill?: unknown
  roughFillStyle?: string
  roughStrokeStyle?: number
  roughOriginalEditSize?: string | null
  roughOriginalBounds?: { x: number; y: number; width: number; height: number }
  specialShapeType?: string
}

export function supportsRoughStyle(item: IUI) {
  return Boolean(item.name && supportedNames.has(item.name))
}

export function supportsRoughStyleName(name: string) {
  return supportedNames.has(name)
}

function polygonPoints(width: number, height: number, sides: number, innerRatio?: number) {
  const points: Array<[number, number]> = []
  const count = innerRatio ? sides * 2 : sides
  for (let index = 0; index < count; index += 1) {
    const radius = innerRatio && index % 2 ? innerRatio : 1
    const angle = -Math.PI / 2 + index * Math.PI * 2 / count
    points.push([width / 2 + Math.cos(angle) * width / 2 * radius, height / 2 + Math.sin(angle) * height / 2 * radius])
  }
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  return points.map(([x, y]) => [
    (x - minX) / Math.max(1, maxX - minX) * width,
    (y - minY) / Math.max(1, maxY - minY) * height,
  ] as [number, number])
}

function getCornerRadius(item: IUI) {
  const value = (item as unknown as Record<string, unknown>).cornerRadius
  const values = Array.isArray(value) ? value : [value]
  return Math.max(0, ...values.map(entry => Number(entry) || 0))
}

function pathNumber(value: number) {
  // SVG path data cannot safely receive JavaScript's scientific notation:
  // Rough's parser can interpret the `e` in values such as 1.2e-14 as a path
  // command and draw a long stray segment.
  return Number(value.toFixed(3))
}

function pathTokens(path: string) {
  return path.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || []
}

function roundedRectPath(width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2)
  return `M ${r} 0 L ${width - r} 0 Q ${width} 0 ${width} ${r} L ${width} ${height - r} Q ${width} ${height} ${width - r} ${height} L ${r} ${height} Q 0 ${height} 0 ${height - r} L 0 ${r} Q 0 0 ${r} 0 Z`
}

function roundedPolygonPath(points: Array<[number, number]>, radius: number) {
  const corners = points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length]
    const next = points[(index + 1) % points.length]
    const previousLength = Math.hypot(previous[0] - point[0], previous[1] - point[1])
    const nextLength = Math.hypot(next[0] - point[0], next[1] - point[1])
    const offset = Math.min(radius, previousLength / 2, nextLength / 2)
    const entry: [number, number] = [
      point[0] + (previous[0] - point[0]) / Math.max(0.001, previousLength) * offset,
      point[1] + (previous[1] - point[1]) / Math.max(0.001, previousLength) * offset,
    ]
    const exit: [number, number] = [
      point[0] + (next[0] - point[0]) / Math.max(0.001, nextLength) * offset,
      point[1] + (next[1] - point[1]) / Math.max(0.001, nextLength) * offset,
    ]
    return { point, entry, exit }
  })
  return corners.map(({ point, entry, exit }, index) => `${index ? 'L' : 'M'} ${pathNumber(entry[0])} ${pathNumber(entry[1])} Q ${pathNumber(point[0])} ${pathNumber(point[1])} ${pathNumber(exit[0])} ${pathNumber(exit[1])}`).join(' ') + ' Z'
}

function seededRandom(seed: number) {
  let value = seed | 0
  return () => {
    value ^= value << 13
    value ^= value >>> 17
    value ^= value << 5
    return ((value >>> 0) % 10_000) / 10_000
  }
}

function withBoundsAnchors(path: string, minX: number, minY: number, maxX: number, maxY: number) {
  // Move-only subpaths are invisible, but make the authored logical box the
  // stable Path box. Leafer can then switch native/rough paths without using
  // the random outline as a new horizontal or vertical scaling reference.
  return `${path} M ${minX} ${minY} M ${maxX} ${maxY}`
}

function specialSketchPath(path: string, seed: number, wobble: number, includeBoundsAnchors = true) {
  const random = seededRandom(seed)
  const tokens = pathTokens(path)
  const coordinates: Array<{ index: number; axis: 0 | 1; original: number; jittered: number }> = []
  let parameterIndex = 0
  tokens.forEach((token, index) => {
    if (/^[A-Za-z]$/.test(token)) { parameterIndex = 0; return }
    const original = Number(token)
    coordinates.push({ index, axis: parameterIndex % 2 as 0 | 1, original, jittered: original + (random() - 0.5) * wobble * 2 })
    parameterIndex += 1
  })
  ;([0, 1] as const).forEach((axis) => {
    const entries = coordinates.filter((entry) => entry.axis === axis)
    const originalMin = Math.min(...entries.map((entry) => entry.original))
    const originalMax = Math.max(...entries.map((entry) => entry.original))
    const jitteredMin = Math.min(...entries.map((entry) => entry.jittered))
    const jitteredMax = Math.max(...entries.map((entry) => entry.jittered))
    entries.forEach((entry) => {
      entry.jittered = originalMin + (entry.jittered - jitteredMin) / Math.max(1, jitteredMax - jitteredMin) * (originalMax - originalMin)
    })
  })
  coordinates.forEach((entry) => { tokens[entry.index] = entry.jittered.toFixed(2) })
  const xs = coordinates.filter(entry => entry.axis === 0).map(entry => entry.original)
  const ys = coordinates.filter(entry => entry.axis === 1).map(entry => entry.original)
  const result = tokens.join(' ')
  return includeBoundsAnchors ? withBoundsAnchors(result, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)) : result
}

export function stabilizeSpecialPath(path: string) {
  return specialSketchPath(path, 1, 0)
}

function stripSpecialBoundsAnchors(path: string) {
  const number = '[-+]?(?:\\d*\\.\\d+|\\d+\\.?)(?:[eE][-+]?\\d+)?'
  return path.replace(new RegExp(`\\s+M\\s+${number}\\s+${number}\\s+M\\s+${number}\\s+${number}\\s*$`, 'i'), '').trim()
}

export function fitSpecialPath(path: string, sourceBounds: { x: number; y: number; width: number; height: number }, width: number, height: number) {
  const tokens = pathTokens(path)
  let parameterIndex = 0
  tokens.forEach((token, index) => {
    if (/^[A-Za-z]$/.test(token)) { parameterIndex = 0; return }
    const axis = parameterIndex % 2
    const sourceStart = axis ? sourceBounds.y : sourceBounds.x
    const sourceSize = Math.max(0.001, axis ? sourceBounds.height : sourceBounds.width)
    const targetSize = axis ? height : width
    tokens[index] = String(pathNumber((Number(token) - sourceStart) / sourceSize * targetSize))
    parameterIndex += 1
  })
  return tokens.join(' ')
}

export function bakeSpecialShapeScale(item: IUI) {
  if (item.name !== 'special-shape') return false
  const attrs = item as unknown as Record<string, unknown>
  const scaleX = Number(item.scaleX ?? 1)
  const scaleY = Number(item.scaleY ?? 1)
  if (Math.abs(Math.abs(scaleX) - 1) < 0.001 && Math.abs(Math.abs(scaleY) - 1) < 0.001) return false
  if (typeof attrs.path !== 'string') return false

  const beforeWorld = { ...item.getBounds('box', 'world') }
  const beforeInner = { ...item.getBounds('box', 'inner') }
  const targetWidth = beforeInner.width * Math.abs(scaleX)
  const targetHeight = beforeInner.height * Math.abs(scaleY)
  attrs.path = fitSpecialPath(attrs.path, beforeInner, targetWidth, targetHeight)
  item.scaleX = Math.sign(scaleX) || 1
  item.scaleY = Math.sign(scaleY) || 1

  const data = { ...(item.data || {}) } as RoughData
  if (data.roughMode && typeof data.roughOriginalPath === 'string' && data.roughOriginalBounds) {
    data.roughOriginalPath = fitSpecialPath(data.roughOriginalPath, data.roughOriginalBounds, targetWidth, targetHeight)
    data.roughOriginalBounds = { x: 0, y: 0, width: targetWidth, height: targetHeight }
    item.data = data
  }

  item.updateLayout()
  const afterWorld = item.getBounds('box', 'world')
  item.moveWorld(
    beforeWorld.x + beforeWorld.width / 2 - afterWorld.x - afterWorld.width / 2,
    beforeWorld.y + beforeWorld.height / 2 - afterWorld.y - afterWorld.height / 2,
  )
  return true
}

function normalizeOpenPath(path: string, endX: number, endY: number, flatSpread = 1.4) {
  const tokens = pathTokens(path)
  const coordinates: Array<{ index: number; axis: 0 | 1; value: number }> = []
  let parameterIndex = 0
  tokens.forEach((token, index) => {
    if (/^[A-Za-z]$/.test(token)) { parameterIndex = 0; return }
    coordinates.push({ index, axis: parameterIndex % 2 as 0 | 1, value: Number(token) })
    parameterIndex += 1
  })
  ;([0, 1] as const).forEach((axis) => {
    const entries = coordinates.filter((entry) => entry.axis === axis)
    if (!entries.length) return
    const sourceMin = Math.min(...entries.map((entry) => entry.value))
    const sourceMax = Math.max(...entries.map((entry) => entry.value))
    const end = axis === 0 ? endX : endY
    const targetMin = Math.min(0, end)
    const targetMax = Math.max(0, end)
    // Horizontal/vertical lines need a small stable cross-axis extent so the
    // hand-drawn wobble remains visible without changing bounds by roughness.
    const flatAxis = targetMax - targetMin < 0.001
    const normalizedMin = flatAxis ? targetMin - flatSpread / 2 : targetMin
    const normalizedMax = flatAxis ? targetMax + flatSpread / 2 : targetMax
    entries.forEach((entry) => {
      entry.value = normalizedMin + (entry.value - sourceMin) / Math.max(0.001, sourceMax - sourceMin) * (normalizedMax - normalizedMin)
    })
  })
  coordinates.forEach((entry) => { tokens[entry.index] = entry.value.toFixed(2) })
  return tokens.join(' ')
}

function normalizeClosedPath(path: string, width: number, height: number, offsetX = 0, offsetY = 0) {
  const tokens = pathTokens(path)
  const coordinates: Array<{ index: number; axis: 0 | 1; value: number }> = []
  let parameterIndex = 0
  tokens.forEach((token, index) => {
    if (/^[A-Za-z]$/.test(token)) { parameterIndex = 0; return }
    coordinates.push({ index, axis: parameterIndex % 2 as 0 | 1, value: Number(token) })
    parameterIndex += 1
  })
  ;([0, 1] as const).forEach((axis) => {
    const entries = coordinates.filter((entry) => entry.axis === axis)
    if (!entries.length) return
    const sourceMin = Math.min(...entries.map((entry) => entry.value))
    const sourceMax = Math.max(...entries.map((entry) => entry.value))
    const target = axis === 0 ? width : height
    const offset = axis === 0 ? offsetX : offsetY
    entries.forEach((entry) => { entry.value = offset + (entry.value - sourceMin) / Math.max(0.001, sourceMax - sourceMin) * target })
  })
  coordinates.forEach((entry) => { tokens[entry.index] = entry.value.toFixed(2) })
  return tokens.join(' ')
}

interface RoughOperation { op: string; data: number[] }
interface RoughDrawableLike { sets: Array<{ type: string; ops: RoughOperation[] }> }

function operationCommand(operation: RoughOperation) {
  const data = operation.data.map(pathNumber).join(' ')
  if (operation.op === 'move') return `M ${data}`
  if (operation.op === 'lineTo') return `L ${data}`
  if (operation.op === 'bcurveTo') return `C ${data}`
  if (operation.op === 'qcurveTo') return `Q ${data}`
  return ''
}

function closeNativeRoughOutline(drawable: RoughDrawableLike, passes: number) {
  const operations = drawable.sets.filter((set) => set.type === 'path').flatMap((set) => set.ops)
  const segments: RoughOperation[][] = []
  operations.forEach((operation) => {
    if (operation.op === 'move' || !segments.length) segments.push([operation])
    else segments[segments.length - 1].push(operation)
  })
  const passCount = segments.length % passes === 0 ? passes : 1
  const edgeCount = segments.length / passCount
  const paths: string[] = []
  for (let pass = 0; pass < passCount; pass += 1) {
    const commands: string[] = []
    for (let edge = 0; edge < edgeCount; edge += 1) {
      const segment = segments[edge * passCount + pass]
      if (!segment?.length) continue
      const [move, ...drawing] = segment
      if (!commands.length) commands.push(operationCommand(move))
      drawing.forEach((operation) => commands.push(operationCommand(operation)))
    }
    if (commands.length) paths.push(`${commands.join(' ')} Z`)
  }
  return paths.join(' ')
}

function createRoughPath(item: IUI, seed: number, strokeStyle = 1, originalPath?: unknown, specialShapeType?: string, originalBounds?: RoughData['roughOriginalBounds']) {
  const width = Math.max(1, Number(item.width || 1))
  const height = Math.max(1, Number(item.height || 1))
  const options = { seed, roughness: [0.35, 0.7, 1.2, 1.8, 2.5][strokeStyle] ?? 0.7, bowing: [0.25, 0.55, 1, 1.5, 2.1][strokeStyle] ?? 0.55, stroke: '#000', strokeWidth: 1, disableMultiStroke: strokeStyle === 0 }
  const attrs = item as unknown as Record<string, unknown>
  const passes = options.disableMultiStroke ? 1 : 2
  const cornerRadius = getCornerRadius(item)
  if (item.name === 'special-shape') {
    const presetPath = SPECIAL_SHAPES.find((shape) => shape.type === specialShapeType)?.path
    const source = presetPath || (typeof originalPath === 'string' ? originalPath : '')
    if (source) {
      const targetBounds = originalBounds || item.getBounds('box', 'inner')
      const subpaths = source.match(/[Mm][^Zz]*[Zz]/g) || [source]
      const nativePath = subpaths.map((subpath) => closeNativeRoughOutline(generator.path(subpath, options), passes)).join(' ')
      return normalizeClosedPath(nativePath, targetBounds.width, targetBounds.height, targetBounds.x, targetBounds.y)
    }
  }
  let drawable: RoughDrawableLike | undefined
  if (item.name === 'ellipse' || item.name === 'circle') drawable = generator.ellipse(width / 2, height / 2, width, height, options)
  if (item.name === 'polygon') {
    const points = polygonPoints(width, height, Number(attrs.sides || 5))
    drawable = cornerRadius ? generator.path(roundedPolygonPath(points, cornerRadius), options) : generator.polygon(points, options)
  }
  if (item.name === 'star') {
    const points = polygonPoints(width, height, Number(attrs.corners || 5), Number(attrs.innerRadius || 0.45))
    drawable = cornerRadius ? generator.path(roundedPolygonPath(points, cornerRadius), options) : generator.polygon(points, options)
  }
  if (!drawable && item.name !== 'line' && item.name !== 'arrow') {
    drawable = cornerRadius ? generator.path(roundedRectPath(width, height, cornerRadius), options) : generator.rectangle(0, 0, width, height, options)
  }
  if (drawable) return normalizeClosedPath(closeNativeRoughOutline(drawable, passes), width, height)

  const toPoint = attrs.toPoint as { x?: number; y?: number } | undefined
  const endX = Number(toPoint?.x ?? width), endY = Number(toPoint?.y ?? height)
  const flatSpread = [0.5, 1.2, 2, 3, 4.2][strokeStyle] ?? 1.2
  return normalizeOpenPath(generator.toPaths(generator.line(0, 0, endX, endY, options)).map((path) => path.d).join(' '), endX, endY, flatSpread)
}

function createHachureFill(color: string, seed: number, fillStyle: string, sourceWidth: number, sourceHeight: number) {
  const canvas = document.createElement('canvas')
  // Render one complete Rough.js fill for the element instead of repeating a
  // small bitmap. This matches Rough's official hachure character (variable,
  // slightly doubled strokes) while completely removing tile seams.
  const width = Math.max(48, Math.min(1024, Math.round(sourceWidth || 100)))
  const height = Math.max(48, Math.min(1024, Math.round(sourceHeight || 100)))
  canvas.width = width
  canvas.height = height
  const roughCanvas = rough.canvas(canvas)
  const roughFillStyle = fillStyle === 'cross-hatch' || fillStyle === 'dots' || fillStyle === 'zigzag' || fillStyle === 'zigzag-line'
    ? fillStyle === 'zigzag-line' ? 'zigzag' : fillStyle
    : 'hachure'
  const dimensionScale = Math.max(0.55, Math.min(2.4, Math.min(width, height) / 160))
  const gap = 12 * dimensionScale
  if (roughFillStyle === 'dots') {
    // Rough.js 4.x DotFiller uses unseeded Math.random for dot centers, even
    // when options.seed is set. Keep a local PRNG; never patch global random.
    const random = seededRandom(seed || 1)
    for (let y = -gap; y <= height + gap; y += gap) {
      for (let x = -gap; x <= width + gap; x += gap) {
        roughCanvas.circle(x + (random() - 0.5) * gap / 2, y + (random() - 0.5) * gap / 2, 4.5 * dimensionScale, {
          seed: Math.floor(random() * 2_000_000_000) + 1, roughness: 0.55, stroke: 'none', fill: color, fillStyle: 'solid',
        })
      }
    }
    return canvas.toDataURL('image/png')
  }
  roughCanvas.rectangle(-8, -8, width + 16, height + 16, {
    seed,
    roughness: 0.55,
    bowing: 0.45,
    stroke: 'none',
    fill: color,
    fillStyle: roughFillStyle,
    fillWeight: 1.2 * dimensionScale,
    hachureAngle: -43,
    hachureGap: gap,
    zigzagOffset: gap,
    disableMultiStrokeFill: false,
  })
  return canvas.toDataURL('image/png')
}

function applyRoughFill(item: IUI, data: RoughData, seed: number) {
  const attrs = item as unknown as Record<string, unknown>
  const fill = data.roughOriginalFill
  if (data.roughFillStyle === 'solid') {
    attrs.fill = fill ?? (item.name === 'frame' ? 'rgba(0,0,0,0)' : null)
    if (item.name === 'frame') attrs.hitFill = fill == null ? 'none' : 'path'
    return
  }
  const hasFill = typeof fill === 'string' && fill !== 'transparent' && fill !== 'rgba(0,0,0,0)'
  // Local geometry + authored scale only. World bounds include viewport zoom,
  // ancestor transforms and rotation: those must not change a seeded pattern.
  // fill.url is a native render cache; toPersistedCanvasScene strips it BEFORE
  // scene diffing. Restoring the canonical color recreates this texture here.
  const layout = item.getBounds('box', 'inner')
  attrs.fill = hasFill
    ? { type: 'image', url: createHachureFill(fill, seed, data.roughFillStyle || 'hachure', layout.width * Math.abs(Number(item.scaleX ?? 1)), layout.height * Math.abs(Number(item.scaleY ?? 1))), format: 'png', mode: 'stretch' }
    : item.name === 'frame' ? 'rgba(0,0,0,0)' : null
  if (item.name === 'frame') attrs.hitFill = hasFill ? 'path' : 'none'
}

function preserveGeometry(item: IUI, mutate: () => void) {
  const beforeInner = { ...item.getBounds('box', 'inner') }
  const beforeWorld = { ...item.getBounds('box', 'world') }
  mutate()
  item.updateLayout()

  // Compare the path's own bounds, without its transform. `local` already
  // includes scale/rotation; using it here applies the transform twice and
  // makes special paths grow or shrink after every style toggle.
  if (item.name !== 'line' && item.name !== 'arrow') {
    const afterInner = item.getBounds('box', 'inner')
    if (beforeInner.width > 0.001 && beforeInner.height > 0.001 && afterInner.width > 0.001 && afterInner.height > 0.001) {
      item.scaleX = Number(item.scaleX ?? 1) * beforeInner.width / afterInner.width
      item.scaleY = Number(item.scaleY ?? 1) * beforeInner.height / afterInner.height
      item.updateLayout()
    }
  }
  const afterWorld = item.getBounds('box', 'world')
  item.moveWorld(
    beforeWorld.x + beforeWorld.width / 2 - afterWorld.x - afterWorld.width / 2,
    beforeWorld.y + beforeWorld.height / 2 - afterWorld.y - afterWorld.height / 2,
  )
}

export function setRoughStyle(item: IUI, enabled: boolean) {
  if (!supportsRoughStyle(item)) return
  // Normalize resized path-based special shapes before either style switch.
  if (item.name === 'special-shape') bakeSpecialShapeScale(item)
  const attrs = item as unknown as Record<string, unknown>
  const data = { ...(item.data || {}) } as RoughData
  if (enabled) {
    const seed = data.roughSeed || Math.floor(Math.random() * 2_000_000_000) + 1
    if (!data.roughMode) {
      data.roughOriginalEditSize = item.editConfig?.editSize || null
      // Native Rect/Ellipse/Polygon path getters expose Leafer's computed
      // numeric command array. Persisting that value and writing it back later
      // silently converts the native element into a custom Path and changes its
      // bounds. Only special shapes have a real authored SVG path to restore.
      if (item.name === 'special-shape') {
        const preset = SPECIAL_SHAPES.find(shape => shape.type === data.specialShapeType)?.path
        data.roughOriginalPath = typeof attrs.path === 'string' ? stripSpecialBoundsAnchors(attrs.path) : typeof data.customPath === 'string' ? data.customPath : preset || null
        data.roughOriginalBounds = { ...item.getBounds('box', 'inner') }
      } else data.roughOriginalPath = null
      data.roughOriginalFill = attrs.fill
    }
    data.roughMode = true
    data.roughSeed = seed
    data.roughFillStyle ||= 'hachure'
    data.roughStrokeStyle ??= 1
    item.data = data
    item.editConfig = { ...(item.editConfig || {}), editSize: 'scale' }
    preserveGeometry(item, () => {
      attrs.path = createRoughPath(item, seed, data.roughStrokeStyle, data.roughOriginalPath, data.specialShapeType, data.roughOriginalBounds)
    })
    applyRoughFill(item, data, seed)
  } else {
    const restoreStyle = () => {
      // Leafer treats an `undefined` attribute assignment as "leave unchanged"
      // in some Chromium update paths. Use null to explicitly remove the
      // generated path and let Rect/Ellipse/etc. render their native geometry.
      if (item.name === 'special-shape') {
        const preset = SPECIAL_SHAPES.find(shape => shape.type === data.specialShapeType)?.path
        const original = typeof data.roughOriginalPath === 'string' ? data.roughOriginalPath : typeof data.customPath === 'string' ? data.customPath : preset
        attrs.path = original ? stripSpecialBoundsAnchors(original) : null
      } else attrs.path = null
      attrs.fill = data.roughOriginalFill ?? (item.name === 'frame' ? 'rgba(0,0,0,0)' : null)
      if (item.name === 'frame') attrs.hitFill = data.roughOriginalFill == null ? 'none' : 'path'
    }
    preserveGeometry(item, restoreStyle)
    const restoredEditConfig = { ...(item.editConfig || {}) } as Record<string, unknown>
    if (data.roughOriginalEditSize) restoredEditConfig.editSize = data.roughOriginalEditSize
    else delete restoredEditConfig.editSize
    item.editConfig = restoredEditConfig as typeof item.editConfig
    delete data.roughMode
    delete data.roughSeed
    delete data.roughOriginalPath
    delete data.roughOriginalFill
    delete data.roughOriginalEditSize
    delete data.roughOriginalBounds
    item.data = data
  }
}

export function applyCurrentRoughStyle(item: IUI) {
  const preview = creationPreviews.get(item)
  if (preview) {
    preview.path.destroy()
    creationPreviews.delete(item)
    item.visible = true
  }
  const style = getStyleParamsFromLocalStorage()
  if (!style[ROUGH_STYLE_KEY] || !supportsRoughStyle(item)) return
  item.data = {
    ...(item.data || {}),
    roughFillStyle: String(style[ROUGH_FILL_STYLE_KEY] || 'hachure'),
    roughStrokeStyle: Number(style[ROUGH_STROKE_STYLE_KEY] ?? 1),
  }
  setRoughStyle(item, true)
}

export function updateCurrentRoughPreview(item: IUI) {
  const style = getStyleParamsFromLocalStorage()
  if (!style[ROUGH_STYLE_KEY] || !supportsRoughStyle(item)) return
  const seed = Number(item.data?.roughSeed || Math.floor(Math.random() * 2_000_000_000) + 1)
  const roughFillStyle = String(style[ROUGH_FILL_STYLE_KEY] || 'hachure')
  const roughStrokeStyle = Number(style[ROUGH_STROKE_STYLE_KEY] ?? 1)
  item.data = { ...(item.data || {}), roughSeed: seed, roughFillStyle, roughStrokeStyle }

  let preview = creationPreviews.get(item)
  if (!preview) {
    const path = new Path({ name: 'rough-creation-preview', editable: false, hittable: false })
    const app = item.app as unknown as { sky?: { add(child: Path): void } }
    if (!app.sky) return
    app.sky.add(path)
    preview = { path, fillReady: false }
    creationPreviews.set(item, preview)
  }

  const attrs = item as unknown as Record<string, unknown>
  preview.path.set({
    path: createRoughPath(item, seed, roughStrokeStyle, undefined, String(item.data?.specialShapeType || ''), item.data?.roughOriginalBounds as RoughData['roughOriginalBounds']),
    stroke: (attrs.stroke ?? '#1b1b1f') as string,
    strokeWidth: Number(attrs.strokeWidth ?? 1),
    dashPattern: attrs.dashPattern as number[] | undefined,
    opacity: Number(attrs.opacity ?? 1),
    strokeCap: attrs.strokeCap as 'none' | 'round' | 'square' | undefined,
    strokeJoin: attrs.strokeJoin as 'miter' | 'bevel' | 'round' | undefined,
  })
  preview.path.setTransform(item.getTransform('world'))
  if (!preview.fillReady) {
    const data = { roughOriginalFill: attrs.fill, roughFillStyle } as RoughData
    applyRoughFill(preview.path, data, seed)
    preview.fillReady = true
  }
  item.visible = false
}

export function updateRoughFill(item: IUI, fill: unknown) {
  const data = { ...(item.data || {}) } as RoughData
  if (!data.roughMode) return false
  data.roughOriginalFill = fill
  item.data = data
  applyRoughFill(item, data, data.roughSeed || 1)
  return true
}

export function refreshRoughFill(item: IUI) {
  const data = { ...(item.data || {}) } as RoughData
  if (!data.roughMode) return false
  applyRoughFill(item, data, data.roughSeed || 1)
  return true
}

export function updateRoughGeometry(item: IUI, refreshFill = true) {
  const data = { ...(item.data || {}) } as RoughData
  if (!data.roughMode) return false
  item.data = data
  item.editConfig = { ...(item.editConfig || {}), editSize: 'scale' }
  // Parameter changes regenerate geometry inside the element's existing local
  // box. Measuring the slightly jittered path on every change feeds its visual
  // bounds back into width/height, making the element progressively smaller.
  preserveGeometry(item, () => {
    ;(item as unknown as Record<string, unknown>).path = createRoughPath(item, data.roughSeed || 1, data.roughStrokeStyle, data.roughOriginalPath, data.specialShapeType, data.roughOriginalBounds)
  })
  if (refreshFill) applyRoughFill(item, data, data.roughSeed || 1)
  return true
}

export function updateRoughOption(item: IUI, key: string, value: unknown) {
  const data = { ...(item.data || {}) } as RoughData
  if (!data.roughMode) return false
  if (key === ROUGH_FILL_STYLE_KEY) data.roughFillStyle = String(value)
  if (key === ROUGH_STROKE_STYLE_KEY) data.roughStrokeStyle = Number(value)
  item.data = data
  return key === ROUGH_FILL_STYLE_KEY ? (applyRoughFill(item, data, data.roughSeed || 1), true) : updateRoughGeometry(item)
}
