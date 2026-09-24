import { createElementId, type ModelValue } from '../model'
import { checkAbort, cancellable, decodeImage, imageDimensions, limits, progress, safeFilename } from './common'
import { CanvasIOError, type CanvasFileFormat, type CanvasImportOptions, type CanvasImportResult, type CanvasIOWarning } from './types'

const svgNS = 'http://www.w3.org/2000/svg'
const tags = new Set('svg g defs symbol path rect circle ellipse line polyline polygon text tspan title desc linearGradient radialGradient stop clipPath mask pattern use image filter feGaussianBlur feOffset feFlood feComposite feMerge feMergeNode feDropShadow'.split(' '))
const attrs = new Set('id x y x1 y1 x2 y2 cx cy r rx ry width height viewBox preserveAspectRatio d points transform fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity clip-path clip-rule mask display visibility font-family font-size font-weight font-style text-anchor dominant-baseline text-decoration letter-spacing word-spacing dx dy rotate textLength lengthAdjust offset stop-color stop-opacity gradientUnits gradientTransform spreadMethod fx fy fr patternUnits patternContentUnits patternTransform clipPathUnits maskUnits maskContentUnits filter filterUnits primitiveUnits stdDeviation flood-color flood-opacity in in2 result operator color-interpolation-filters'.split(' '))
const styleAttrs = new Set('fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity display visibility font-family font-size font-weight font-style text-anchor dominant-baseline text-decoration letter-spacing word-spacing stop-color stop-opacity'.split(' '))
function safeValue(value: string) {
  return !Array.from(value).some(c => c.charCodeAt(0) < 32) && !/[\\]|(?:javascript|data|blob|https?|file):|@|expression\s*\(/i.test(value) && !/url\s*\(/i.test(value.replace(/url\(\s*['"]?#[\w:.-]+['"]?\s*\)/gi, ''))
}

/** Conservative SVG allowlist; no DOM insertion, network access or platform callbacks. */
export function sanitizeCanvasSvg(text: string, options: CanvasImportOptions = {}) {
  checkAbort(options.signal)
  if (new Blob([text]).size > limits.maxSvgBytes) throw new CanvasIOError('SVG_TOO_LARGE')
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new CanvasIOError('SVG_DTD_FORBIDDEN')
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml'), root = doc.documentElement
  if (root.localName !== 'svg' || root.namespaceURI !== svgNS || doc.getElementsByTagName('parsererror').length) throw new CanvasIOError('INVALID_SVG')
  const nodes = [...root.querySelectorAll('*')]
  if (nodes.length > limits.maxSvgElements) throw new CanvasIOError('SVG_TOO_COMPLEX')
  const warnings: CanvasIOWarning[] = []
  const warn = (code: string) => { if (!warnings.some(w => w.code === code)) warnings.push({ code, message: code }) }
  if (nodes.some(el => el.localName === 'metadata' && /aidcanvas/i.test(new XMLSerializer().serializeToString(el)))) {
    if (!options.ignoreEditableData) throw new CanvasIOError('EDITABLE_SVG_UNSUPPORTED')
    warn('EDITABLE_DATA_IGNORED')
  }
  const clean = (el: Element, depth: number) => {
    if (depth > 64) throw new CanvasIOError('SVG_TOO_COMPLEX')
    for (const child of [...el.children]) {
      if (!tags.has(child.localName) || child.namespaceURI !== svgNS) { child.remove(); warn('SVG_UNSUPPORTED_CONTENT_REMOVED') }
      else clean(child, depth + 1)
    }
    for (const attr of [...el.attributes]) {
      const { name, value } = attr
      if (name === 'xmlns' && el === root) continue
      if (name === 'style') {
        for (const declaration of value.split(';')) {
          const split = declaration.indexOf(':'), key = declaration.slice(0, split).trim(), v = declaration.slice(split + 1).trim()
          if (styleAttrs.has(key) && safeValue(v)) el.setAttribute(key, v)
          else if (declaration.trim()) warn('SVG_UNSAFE_STYLE_REMOVED')
        }
        el.removeAttribute(name)
      } else if (name === 'href' || name === 'xlink:href') {
        if (['use', 'linearGradient', 'radialGradient'].includes(el.localName) && /^#[\w:.-]+$/.test(value)) { el.removeAttribute(name); el.setAttribute('href', value); continue }
        // Embedded raster is retained only after the same binary/dimension checks below.
        if (el.localName !== 'image' || !/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) { el.removeAttribute(name); warn('SVG_EXTERNAL_REFERENCE_REMOVED') }
        else { el.removeAttribute(name); el.setAttribute('href', value) }
      } else if (!attrs.has(name) || !safeValue(value)) { el.removeAttribute(name); warn('SVG_UNSAFE_ATTRIBUTE_REMOVED') }
    }
  }
  clean(root, 0)
  // Account for expanded references, not just XML node count. Reject loops and exponential use/pattern graphs.
  const byId = new Map<string, Element>()
  for (const node of [root, ...root.querySelectorAll('*')]) {
    if (node.id) { if (byId.has(node.id)) throw new CanvasIOError('SVG_DUPLICATE_ID'); byId.set(node.id, node) }
    if (node.hasAttribute('stdDeviation') && node.getAttribute('stdDeviation')!.split(/[ ,]+/).some(n => !Number.isFinite(Number(n)) || Number(n) < 0 || Number(n) > 128)) throw new CanvasIOError('SVG_FILTER_LIMIT')
  }
  let expanded = 0
  const walk = (node: Element, active: Set<Element>) => {
    if (active.has(node)) throw new CanvasIOError('SVG_REFERENCE_CYCLE')
    if (++expanded > limits.maxSvgElements || active.size > 64) throw new CanvasIOError('SVG_TOO_COMPLEX')
    const next = new Set(active).add(node)
    for (const attr of [...node.attributes]) {
      const targets = [...attr.value.matchAll(/url\(\s*['"]?#([\w:.-]+)/g)].map(m => m[1])
      if (attr.name === 'href' && attr.value.startsWith('#')) targets.push(attr.value.slice(1))
      for (const id of targets) { const target = byId.get(id); if (target) walk(target, next); else { node.removeAttribute(attr.name); warn('SVG_MISSING_REFERENCE_REMOVED') } }
    }
    for (const child of node.children) walk(child, next)
  }
  walk(root, new Set())
  const vb = (root.getAttribute('viewBox') || '').trim().split(/[ ,]+/).map(Number)
  const validBox = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0
  const dimension = (name: string, fallback: number | undefined) => {
    const raw = root.getAttribute(name)
    if (raw && /^\d+(?:\.\d+)?(?:px)?$/.test(raw)) return parseFloat(raw)
    if (fallback) return fallback
    throw new CanvasIOError('SVG_DIMENSIONS_REQUIRED')
  }
  const width = dimension('width', validBox ? vb[2] : undefined), height = dimension('height', validBox ? vb[3] : undefined)
  imageDimensions(width, height)
  // Bound offscreen filter surfaces as well as the outer image. Percentages are expanded against the viewport.
  for (const filter of root.querySelectorAll('filter')) {
    const side = (name: string, viewport: number) => {
      const raw = filter.getAttribute(name) || '120%'
      const number = Number(raw.replace(/%$/, ''))
      return raw.endsWith('%') ? number * viewport / 100 : filter.getAttribute('filterUnits') === 'userSpaceOnUse' ? number : number * viewport
    }
    const fw = side('width', width), fh = side('height', height)
    if (![fw, fh].every(n => Number.isFinite(n) && n > 0 && n <= limits.maxImageSide) || fw * fh > limits.maxImagePixels) throw new CanvasIOError('SVG_FILTER_LIMIT')
  }
  if (root.hasAttribute('viewBox') && !validBox) throw new CanvasIOError('INVALID_SVG_VIEWBOX')
  root.setAttribute('width', String(width)); root.setAttribute('height', String(height))
  root.setAttribute('xmlns', svgNS)
  return { root, width, height, warnings }
}

function rasterHeader(bytes: Uint8Array): { format: CanvasFileFormat; width: number; height: number } | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), ascii = (a: number, b: number) => String.fromCharCode(...bytes.subarray(a, b))
  if (bytes.length >= 24 && ascii(1, 4) === 'PNG' && bytes[0] === 137 && ascii(12, 16) === 'IHDR') return { format: 'png', width: view.getUint32(16), height: view.getUint32(20) }
  if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    const kind = ascii(12, 16), uint24 = (i: number) => bytes[i] + (bytes[i + 1] << 8) + (bytes[i + 2] << 16)
    if (kind === 'VP8X') return { format: 'webp', width: uint24(24) + 1, height: uint24(27) + 1 }
    if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) return { format: 'webp', width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
    if (kind === 'VP8L' && bytes[20] === 0x2f) return { format: 'webp', width: 1 + ((bytes[22] & 63) << 8 | bytes[21]), height: 1 + ((bytes[24] & 15) << 10 | bytes[23] << 2 | bytes[22] >> 6) }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2
    while (i + 8 < bytes.length) {
      if (bytes[i++] !== 0xff) break
      while (bytes[i] === 0xff) i++
      const marker = bytes[i++], length = view.getUint16(i)
      if (length < 2 || i + length > bytes.length) break
      if ([0xc0, 0xc1, 0xc2].includes(marker)) return { format: 'jpeg', width: view.getUint16(i + 5), height: view.getUint16(i + 3) }
      i += length
    }
  }
}

export async function parseCanvasFile(file: Blob, options: CanvasImportOptions = {}): Promise<CanvasImportResult> {
  progress(options, 'read', 0)
  if (!(file instanceof Blob) || !file.size) throw new CanvasIOError('EMPTY_FILE')
  if (file.size > limits.maxFileBytes) throw new CanvasIOError('FILE_TOO_LARGE')
  const bytes = new Uint8Array(await cancellable(file.arrayBuffer(), options.signal)), header = rasterHeader(bytes)
  const filename = options.filename || (file instanceof File ? file.name : 'asset')
  const warnings: CanvasIOWarning[] = []
  let format: CanvasFileFormat, width: number, height: number, blob: Blob
  if (header) {
    ;({ format, width, height } = header)
    imageDimensions(width, height)
    blob = new Blob([bytes], { type: `image/${format}` })
  } else {
    progress(options, 'sanitize', 0)
    let text: string
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { throw new CanvasIOError('UNSUPPORTED_FILE_TYPE') }
    const sanitized = sanitizeCanvasSvg(text, options)
    format = 'svg'; ({ width, height } = sanitized); warnings.push(...sanitized.warnings)
    let embeddedPixels = 0
    for (const image of sanitized.root.querySelectorAll('image')) {
      const href = image.getAttribute('href')
      if (!href) continue
      let raw: Uint8Array
      try { raw = Uint8Array.from(atob(href.split(',')[1]), c => c.charCodeAt(0)) } catch { throw new CanvasIOError('INVALID_EMBEDDED_IMAGE') }
      const h = rasterHeader(raw)
      if (!h) throw new CanvasIOError('INVALID_EMBEDDED_IMAGE')
      imageDimensions(h.width, h.height)
      embeddedPixels += h.width * h.height
      if (embeddedPixels > limits.maxImagePixels) throw new CanvasIOError('EMBEDDED_IMAGE_LIMIT')
      await decodeImage(new Blob([raw.slice().buffer as ArrayBuffer], { type: `image/${h.format}` }), options.signal)
    }
    blob = new Blob([new XMLSerializer().serializeToString(sanitized.root)], { type: 'image/svg+xml' })
  }
  const extension = filename.split('.').at(-1)?.toLowerCase(), expected = format === 'jpeg' ? ['jpg', 'jpeg'] : [format]
  if (filename.includes('.') && !expected.includes(extension!)) throw new CanvasIOError('FILE_EXTENSION_MISMATCH')
  if (file.type && file.type !== blob.type && file.type !== 'application/octet-stream') throw new CanvasIOError('FILE_MIME_MISMATCH')
  progress(options, 'decode', 0)
  const decoded = await decodeImage(blob, options.signal)
  imageDimensions(decoded.naturalWidth, decoded.naturalHeight)
  if (format !== 'svg') { width = decoded.naturalWidth; height = decoded.naturalHeight }
  progress(options, 'decode', 1)
  return { kind: 'image-asset', format, filename: safeFilename(filename, format === 'jpeg' ? 'jpg' : format), width, height,
    resources: [{ id: 'asset-1', blob, mimeType: blob.type, width, height }], warnings }
}

/** Pure scene construction for a NEW document. Host uploads resources first, then initializes a NEW collaboration lineage. */
export function createCanvasImportValue(parsed: CanvasImportResult, resourcePaths: Record<string, string>): ModelValue {
  if (parsed.kind !== 'image-asset' || parsed.resources.length !== 1 || !['png', 'jpeg', 'webp', 'svg'].includes(parsed.format)) throw new CanvasIOError('INVALID_IMPORT_RESULT')
  const resource = parsed.resources[0], path = resource && resourcePaths[resource.id]
  if (!path || /^(?:data|blob|javascript|file):/i.test(path) || /^https?:\/\/.*[?#]/i.test(path)) throw new CanvasIOError('STABLE_RESOURCE_PATH_REQUIRED')
  imageDimensions(parsed.width, parsed.height)
  return { version: 1, name: parsed.filename, updatedAt: '', scene: { tag: 'Leafer', children: [{
    id: createElementId(), tag: 'Image', name: 'image', url: path, width: parsed.width, height: parsed.height, x: 0, y: 0, lockRatio: true, editable: true,
    data: { resourcePath: path, sourceUrl: path, fileName: parsed.filename, mimeType: resource.mimeType, naturalWidth: parsed.width, naturalHeight: parsed.height, assetKind: parsed.format === 'svg' ? 'vector' : 'bitmap' },
  }] } }
}
