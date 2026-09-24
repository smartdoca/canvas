import { Group, Text, PathConvert, type IUI, type IUIJSONData } from 'leafer-ui'
import '@leafer-in/arrow'
import rough from 'roughjs'
import { CanvasModel, toPersistedCanvasScene, type SceneNode } from '../model'
import { updateRoughGeometry } from '../editor/runtime/utils/roughStyle'
import { parseCanvasFile } from './import'
import { cancellable, checkAbort, dataUrl, decodeImage, limits, progress, safeFilename } from './common'
import { CanvasIOError, type CanvasExportOptions, type CanvasExportResult, type CanvasExportSource, type CanvasIOWarning } from './types'

const ns = 'http://www.w3.org/2000/svg'
function el(tag: string, attrs: Record<string, unknown> = {}) {
  const node = document.createElementNS(ns, tag)
  Object.entries(attrs).forEach(([key, value]) => { if (value !== undefined && value !== null) node.setAttribute(key, String(value)) })
  return node
}
function color(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'none'
  if (typeof value !== 'string' || !CSS.supports('color', value) || /var\(|url\(/i.test(value)) throw new CanvasIOError('UNSUPPORTED_PAINT')
  return value
}
function selectedScene(scene: SceneNode, ids: Set<string>): SceneNode {
  const visit = (node: SceneNode): SceneNode | undefined => {
    if (node.id && ids.has(node.id)) return node
    const children = node.children?.map(visit).filter((n): n is SceneNode => Boolean(n))
    if (children?.length) {
      const shell: SceneNode = { ...node, children }
      delete shell.fill; delete shell.stroke; delete shell.shadow
      return shell
    }
  }
  return { tag: 'Leafer', children: scene.children?.map(visit).filter((n): n is SceneNode => Boolean(n)) || [] }
}

/** Browser-only conversion on a detached scene; never exports an editor App or its sky/controls. */
export async function exportCanvasFile(source: CanvasExportSource, options: CanvasExportOptions): Promise<CanvasExportResult> {
  checkAbort(options.signal)
  if (!['png', 'svg'].includes(options.format)) throw new CanvasIOError('UNSUPPORTED_EXPORT_FORMAT')
  if (options.preserveEditData) throw new CanvasIOError('EDITABLE_SVG_UNSUPPORTED')
  if (options.scope && !['all', 'selection'].includes(options.scope)) throw new CanvasIOError('INVALID_EXPORT_SCOPE')
  const scale = options.scale ?? 1
  if (!Number.isFinite(scale) || scale < limits.minScale || scale > limits.maxScale) throw new CanvasIOError('EXPORT_SCALE_EXCEEDED')
  const warnings: CanvasIOWarning[] = [], warn = (code: string, id?: string) => {
    if (!warnings.some(w => w.code === code && w.elementId === id)) warnings.push({ code, message: code, elementId: id })
  }
  let scene = toPersistedCanvasScene(source.scene)
  // Validate input without touching any existing model, and strip root viewport/business metadata.
  const validator = CanvasModel.initialize('isolated-export-validation', { version: 1, scene })
  try { scene = validator.getValue().scene } finally { validator.dispose() }
  if (options.scope === 'selection') {
    if (!options.elementIds?.length) throw new CanvasIOError('EMPTY_SELECTION')
    const all = new Set<string>(), gather = (n: SceneNode) => { if (n.id) all.add(n.id); n.children?.forEach(gather) }
    gather(scene)
    if (options.elementIds.some(id => !all.has(id))) throw new CanvasIOError('SELECTION_NOT_FOUND')
    scene = selectedScene(scene, new Set(options.elementIds))
  }
  const pruneHidden = (node: SceneNode) => { if (node.children) { node.children = node.children.filter(n => n.visible !== false && n.opacity !== 0); node.children.forEach(pruneHidden) } }
  pruneHidden(scene)
  const nodes: SceneNode[] = [], gather = (n: SceneNode) => { nodes.push(n); n.children?.forEach(gather) }
  scene.children?.forEach(gather)
  if (!nodes.length) throw new CanvasIOError(options.scope === 'selection' ? 'EMPTY_SELECTION' : 'EMPTY_CANVAS')
  if (nodes.length > limits.maxSceneElements) throw new CanvasIOError('SCENE_TOO_COMPLEX')
  const assets = new Map<string, string>()
  let assetBytes = 0, assetPixels = 0
  for (const node of nodes) {
    const id = String(node.id)
    // Effect support is explicit: these properties do not silently disappear.
    for (const key of ['mask', 'eraser', 'innerShadow', 'blur', 'backgroundBlur', 'blendMode']) {
      if (node[key] && node[key] !== 'normal') { warn('UNSUPPORTED_EFFECT_' + key, id); delete node[key] }
    }
    if (node.strokeAlign && node.strokeAlign !== 'center') warn('STROKE_ALIGNMENT_APPROXIMATED', id)
    if (node.tag !== 'Image') {
      for (const key of ['fill', 'stroke']) if (node[key] && typeof node[key] !== 'string') { warn('UNSUPPORTED_PAINT_' + key, id); node[key] = null }
    }
    // No asset URL is assigned to a native element during layout/conversion.
    if (node.tag === 'Image') { node.url = ''; node.fill = null }
  }
  progress(options, 'resources', 0, nodes.filter(n => n.tag === 'Image').length)
  const images = nodes.filter(n => n.tag === 'Image')
  for (let i = 0; i < images.length; i++) {
    const node = images[i], path = String((node.data as Record<string, unknown>)?.resourcePath || '')
    if (!path || !options.readAsset) throw new CanvasIOError('ASSET_READER_REQUIRED')
    if (!assets.has(path)) {
      let blob: Blob
      try { blob = await cancellable(options.readAsset(path, { signal: options.signal, purpose: 'export', onProgress: options.onProgress }), options.signal) }
      catch (error) { if (error instanceof CanvasIOError) throw error; throw new CanvasIOError('ASSET_READ_FAILED', error instanceof Error ? error.message : 'Asset read failed') }
      assetBytes += blob.size
      if (assetBytes > limits.maxExportAssetBytes) throw new CanvasIOError('EXPORT_ASSETS_TOO_LARGE')
      const parsed = await parseCanvasFile(blob, { signal: options.signal })
      assetPixels += parsed.width * parsed.height
      if (assetPixels > limits.maxImagePixels) throw new CanvasIOError('EXPORT_ASSETS_TOO_LARGE')
      parsed.warnings.forEach(w => warnings.push({ ...w, elementId: node.id }))
      assets.set(path, await dataUrl(parsed.resources[0].blob, options.signal))
    }
    progress(options, 'resources', i + 1, images.length)
  }
  await cancellable(document.fonts.ready, options.signal)
  const group = new Group({ children: scene.children as IUIJSONData[] })
  try {
    const normalize = (items: IUI[]) => items.forEach(item => {
      if (item.data?.roughMode) updateRoughGeometry(item, false)
      if (item.children) normalize(item.children)
    })
    normalize(group.children)
    group.updateLayout()
    // Leafer 2.1 detached nodes rerun a FULL root layout on every geometry/text
    // getter. After this complete layout the export tree is read-only; hold its
    // reentrancy guard for serialization (never on the live editor).
    const layoutRoot = group as Group & { __fullLayouting?: boolean }
    layoutRoot.__fullLayouting = true
    const allItems: IUI[] = [], visible = (items: IUI[]) => items.forEach(item => {
      if (item.visible === false || item.opacity === 0) return
      allItems.push(item); if (item.children) visible(item.children)
    })
    visible(group.children)
    if (!allItems.some(n => n.tag !== 'Group' && (n.tag !== 'Text' || Boolean((n as Text).text)))) throw new CanvasIOError('EMPTY_VISIBLE_CONTENT')
    const bounds = group.getBounds('render', 'inner')
    // Conservative fringe for antialiasing, italic glyphs, and arrow joins.
    const fringe = Math.max(2, ...allItems.filter(n => n.tag === 'Text').map(n => Number((n as Text).fontSize || 12) * 0.3))
    const x = Math.floor(bounds.x - fringe), y = Math.floor(bounds.y - fringe)
    const width = Math.ceil(bounds.width + fringe * 2), height = Math.ceil(bounds.height + fringe * 2)
    const outputWidth = Math.ceil(width * scale), outputHeight = Math.ceil(height * scale)
    if (![x, y, width, height, outputWidth, outputHeight].every(Number.isFinite) || width <= 0 || height <= 0 || outputWidth > limits.maxExportSide || outputHeight > limits.maxExportSide || outputWidth * outputHeight > limits.maxExportPixels) throw new CanvasIOError('EXPORT_DIMENSIONS_EXCEEDED')
    const svg = el('svg', { xmlns: ns, width: outputWidth, height: outputHeight, viewBox: `${x} ${y} ${width} ${height}` }), defs = el('defs')
    svg.append(defs)
    if (options.background && options.background !== 'transparent') svg.append(el('rect', { x, y, width, height, fill: color(options.background) }))
    let nextId = 0
    const id = () => `ac-export-${++nextId}`
    const serialize = (item: IUI): Element | null => {
      checkAbort(options.signal)
      if (item.visible === false || item.opacity === 0) return null
      const data = item.toJSON() as SceneNode, matrix = item.localTransform
      const wrapper = el('g', { transform: `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`, opacity: item.opacity })
      const paint = (value: unknown) => { try { return color(value) } catch { warn('UNSUPPORTED_PAINT', item.id); return 'none' } }
      const stroke = paint(item.stroke), fill = paint(item.fill), path = item.getPathString(true, true)
      const shape = el('path', { d: path, fill: item.tag === 'Text' ? 'none' : fill, stroke,
        'stroke-width': data.strokeWidth ?? 1, 'stroke-linecap': data.strokeCap === 'none' ? 'butt' : data.strokeCap,
        'stroke-linejoin': data.strokeJoin, 'stroke-dasharray': Array.isArray(data.dashPattern) ? data.dashPattern.join(' ') : undefined,
        'stroke-dashoffset': data.dashOffset, 'fill-rule': data.windingRule || 'nonzero' })
      if (item.tag === 'Text') {
        const text = item as Text
        warn('FONT_NOT_EMBEDDED_SYSTEM_FALLBACK', item.id)
        const font = String(data.fontFamily || 'Arial').replace(/[<>]/g, '') + ', sans-serif'
        const textElement = el('text', { fill, stroke, 'stroke-width': data.strokeWidth ?? 1, 'font-family': font, 'font-size': data.fontSize || 12, 'font-weight': data.fontWeight || 'normal', 'font-style': data.italic ? 'italic' : 'normal', 'xml:space': 'preserve', 'text-decoration': data.textDecoration === 'none' ? undefined : data.textDecoration })
        for (const row of text.textDrawData.rows) {
          if (row.text !== undefined) { const span = el('tspan', { x: row.x || 0, y: row.y || 0 }); span.textContent = row.text; textElement.append(span) }
          else for (const char of row.data || []) { const span = el('tspan', { x: char.x || 0, y: row.y || 0 }); span.textContent = char.char || ''; textElement.append(span) }
        }
        wrapper.append(textElement)
        if (data.textOverflow && data.textOverflow !== 'show') warn('TEXT_OVERFLOW_APPROXIMATED', item.id)
      } else if (item.tag === 'Image') {
        const path = String(item.data?.resourcePath), href = assets.get(path)
        if (!href) throw new CanvasIOError('ASSET_MISSING')
        const clip = id(), clipping = el('clipPath', { id: clip }); clipping.append(el('path', { d: item.getPathString(true, false) })); defs.append(clipping)
        wrapper.append(el('image', { href, x: 0, y: 0, width: item.width, height: item.height, preserveAspectRatio: 'none', 'clip-path': `url(#${clip})` }))
      } else if (item.tag !== 'Group') {
        if (item.data?.roughMode && item.data?.roughFillStyle !== 'solid' && typeof item.data?.roughOriginalFill === 'string') {
          const patternId = id(), box = item.getBounds('box', 'inner')
          const w = Math.max(48, Math.min(1024, Math.round(box.width * Math.abs(Number(item.scaleX ?? 1))))), h = Math.max(48, Math.min(1024, Math.round(box.height * Math.abs(Number(item.scaleY ?? 1)))))
          const pattern = el('pattern', { id: patternId, patternUnits: 'userSpaceOnUse', x: box.x, y: box.y, width: Math.max(1, box.width), height: Math.max(1, box.height), viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' })
          const g = rough.generator(), seed = Number(item.data.roughSeed || 1), c = paint(item.data.roughOriginalFill), style = String(item.data.roughFillStyle || 'hachure')
          const factor = Math.max(0.55, Math.min(2.4, Math.min(w, h) / 160)), gap = factor * 12
          const add = (drawable: ReturnType<typeof g.rectangle>) => g.toPaths(drawable).forEach(p => pattern.append(el('path', { d: p.d, fill: p.fill || 'none', stroke: p.stroke || 'none', 'stroke-width': p.strokeWidth })))
          if (style === 'dots') {
            let state = seed | 0
            const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return ((state >>> 0) % 10000) / 10000 }
            for (let yy = -gap; yy <= h + gap; yy += gap) for (let xx = -gap; xx <= w + gap; xx += gap) add(g.circle(xx + (random() - 0.5) * gap / 2, yy + (random() - 0.5) * gap / 2, 4.5 * factor, { seed: Math.floor(random() * 2_000_000_000) + 1, roughness: 0.55, stroke: 'none', fill: c, fillStyle: 'solid' }))
          } else add(g.rectangle(-8, -8, w + 16, h + 16, { seed, roughness: 0.55, bowing: 0.45, stroke: 'none', fill: c, fillStyle: style === 'zigzag-line' ? 'zigzag' : style, fillWeight: 1.2 * factor, hachureAngle: -43, hachureGap: gap, zigzagOffset: gap, disableMultiStrokeFill: false }))
          defs.append(pattern); shape.setAttribute('fill', `url(#${patternId})`)
        }
        wrapper.append(shape)
        // Leafer 2.1 adapter: closed/filled arrow heads are separate from the public render path.
        const arrows = item.__ as unknown as { __startArrowPath?: { data: number[]; fill: boolean }; __endArrowPath?: { data: number[]; fill: boolean } }
        for (const arrow of [arrows.__startArrowPath, arrows.__endArrowPath]) if (arrow) wrapper.append(el('path', { d: PathConvert.stringify(PathConvert.toCanvasData(arrow.data, true)), fill: arrow.fill ? stroke : 'none', stroke, 'stroke-width': data.strokeWidth || 1 }))
      }
      const shadows = data.shadow ? Array.isArray(data.shadow) ? data.shadow : [data.shadow] : []
      if (shadows.length) {
        const filterId = id(), b = item.getBounds('render', 'inner')
        const filter = el('filter', { id: filterId, filterUnits: 'userSpaceOnUse', x: b.x - 2, y: b.y - 2, width: b.width + 4, height: b.height + 4, 'color-interpolation-filters': 'sRGB' })
        const merge = el('feMerge')
        for (const [index, raw] of shadows.entries()) {
          const s = raw as Record<string, unknown>, blur = Number(s.blur || 0)
          if (!Number.isFinite(blur) || blur > 128 || s.spread || s.box) { warn('SHADOW_APPROXIMATED', item.id); continue }
          const result = `shadow-${index}`
          filter.append(el('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: Math.max(0, blur / 2), result: 'blur' }), el('feOffset', { in: 'blur', dx: s.x || 0, dy: s.y || 0, result: 'offset' }), el('feFlood', { 'flood-color': paint(s.color || '#000000'), 'flood-opacity': s.opacity ?? 1, result: 'color' }), el('feComposite', { in: 'color', in2: 'offset', operator: 'in', result }))
          merge.append(el('feMergeNode', { in: result }))
        }
        merge.append(el('feMergeNode', { in: 'SourceGraphic' })); filter.append(merge); defs.append(filter); wrapper.setAttribute('filter', `url(#${filterId})`)
      }
      if (item.children) {
        const children = el('g')
        if (data.overflow === 'hide') { const clipId = id(), clip = el('clipPath', { id: clipId }); clip.append(el('path', { d: item.getPathString(true, false) })); defs.append(clip); children.setAttribute('clip-path', `url(#${clipId})`) }
        item.children.forEach(child => { const result = serialize(child); if (result) children.append(result) }); wrapper.append(children)
      }
      return wrapper
    }
    progress(options, 'render', 0)
    for (const item of group.children) { const output = serialize(item); if (output) svg.append(output) }
    const svgBlob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
    progress(options, 'render', 1)
    let blob = svgBlob
    if (options.format === 'png') {
      const image = await decodeImage(svgBlob, options.signal), canvas = document.createElement('canvas')
      canvas.width = outputWidth; canvas.height = outputHeight
      try {
        const context = canvas.getContext('2d')
        if (!context) throw new CanvasIOError('CANVAS_CONTEXT_UNAVAILABLE')
        context.drawImage(image, 0, 0, outputWidth, outputHeight)
        blob = await cancellable(new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new CanvasIOError('PNG_ENCODE_FAILED')), 'image/png')), options.signal)
      } finally { canvas.width = canvas.height = 0 }
    }
    progress(options, 'encode', 1)
    return { blob, filename: safeFilename(options.filename || 'aidcanvas', options.format), mimeType: options.format === 'png' ? 'image/png' : 'image/svg+xml', width: outputWidth, height: outputHeight, warnings }
  } finally { delete (group as Group & { __fullLayouting?: boolean }).__fullLayouting; group.destroy() }
}
