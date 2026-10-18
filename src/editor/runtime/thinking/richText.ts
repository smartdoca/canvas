import { Paint, PropertyEvent, Text } from 'leafer-ui'
import { richContainer, richScroll } from './richBounds'
import type { Descendant } from 'slate'
import type { CanvasRichTextElement, CanvasResource } from '../../../sdk/types'
import { RESOURCE_MARKER, cleanResource, prepareResourceImage, resourceImage } from './resourceData'
import { isRichList, listMarker, LIST_GAP, LIST_INDENT, LIST_MARKER, taskCheckboxGeometry } from './richLists'

// Canvas-sized adaptation of slatetsx's RichText leaves. The original native Text
// stays authoritative for search and character CRDTs; formatting lives in schema-1 data.
export type RichLeaf = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; code?: boolean; color?: string; backgroundColor?: string; fontSize?: number; url?: string }
export type RichParagraph = { type: 'paragraph'; custom?: CanvasRichTextElement; resource?: CanvasResource; align?: 'left' | 'center' | 'right' | 'justify'; block?: 'heading' | 'quote' | 'bullet' | 'number' | 'task' | 'code'; level?: number; indent?: number; listOrder?: number; checked?: boolean; children: RichLeaf[] }
export type RichValue = RichParagraph[]
export const horizontalAlign = (value?: string): NonNullable<RichParagraph['align']> => value === 'both' || value === 'justify' ? 'justify' : value === 'center' || value === 'right' ? value : 'left'
type RichPayload = { version: 1; value: RichValue }
export const plainText = (value: RichValue | Descendant[]) => (value as RichValue).map(p => (p.resource || p.custom) ? RESOURCE_MARKER : p.children.map(leaf => leaf.text).join('')).join('\n')
export const fromPlain = (text: string): RichValue => text.split('\n').map(line => ({ type: 'paragraph', children: [{ text: line }] }))
const safeColor = (value?: string) => value && CSS.supports('color', value) && !/var\(|url\(/i.test(value) ? value : undefined
export function safeLink(input?: string): string | undefined {
  const value = input?.trim()
  if (!value || [...value].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return
  const url = value.startsWith('www.') ? `https://${value}` : value
  try { if (['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(url).protocol)) return url } catch { /* Unsupported URL. */ }
}
export const headingScale = (p: RichParagraph) => p.block === 'heading' ? [1.7, 1.5, 1.3, 1.15, 1.05, 1][Math.max(0, Math.min(5, (p.level || 1) - 1))] : 1
export function cleanCustom(value?: CanvasRichTextElement): CanvasRichTextElement | undefined {
  if (!value || typeof value.id !== 'string' || !value.id || typeof value.type !== 'string' || !value.type || typeof value.label !== 'string') return
  try { const data = JSON.parse(JSON.stringify(value.data ?? null)); return { id: value.id, type: value.type, label: value.label, data } } catch { return }
}
export function cleanRichValue(value: Descendant[] | RichValue): RichValue {
  const leaves = (children: unknown[]): RichLeaf[] => children.flatMap(child => {
    if (!child || typeof child !== 'object') return []
    const node = child as RichLeaf & { children?: unknown[] }
    return Array.isArray(node.children) ? leaves(node.children) : typeof node.text === 'string' ? [node] : []
  })
  const paragraphs = (value as (RichParagraph & { list?: string; indentation?: number; title?: string; quote?: boolean })[]).map(p => {
    if (!p || typeof p !== 'object') return p
    const block = p.block || ({ ul: 'bullet', ol: 'number', checkbox: 'task' } as const)[p.list as 'ul'] || (p.title ? 'heading' : p.quote ? 'quote' : undefined)
    return { ...p, block, indent: p.indent ?? p.indentation, level: p.level ?? (p.title ? Number(p.title.slice(1)) : undefined) }
  })
  return paragraphs.filter(p => p && typeof p === 'object' && Array.isArray(p.children)).map(p => ({ type: 'paragraph', ...(cleanCustom(p.custom) ? { custom: cleanCustom(p.custom) } : {}), ...(cleanResource(p.resource) ? { resource: cleanResource(p.resource) } : {}), ...(p.align && ['left', 'center', 'right', 'justify'].includes(p.align) ? { align: p.align } : {}),
    ...(p.block && ['heading', 'quote', 'bullet', 'number', 'task', 'code'].includes(p.block) ? { block: p.block } : {}),
    ...(p.level ? { level: Math.max(1, Math.min(6, Number(p.level) || 1)) } : {}), ...(p.indent ? { indent: Math.max(0, Math.min(8, Math.floor(Number(p.indent) || 0))) } : {}), ...(p.block === 'number' && Number.isSafeInteger(p.listOrder) && p.listOrder! > 0 ? { listOrder: p.listOrder } : {}), ...(typeof p.checked === 'boolean' ? { checked: p.checked } : {}),
    children: p.resource || p.custom ? [{ text: '' }] : (leaves(p.children).length ? leaves(p.children) : [{ text: '' }]).map(leaf => ({
    text: String(leaf.text || ''), ...Object.fromEntries(['bold', 'italic', 'underline', 'strikethrough', 'code'].filter(key => typeof leaf[key as keyof RichLeaf] === 'boolean').map(key => [key, leaf[key as keyof RichLeaf]])),
    ...(safeColor(leaf.color) ? { color: leaf.color } : {}), ...(safeColor(leaf.backgroundColor) ? { backgroundColor: leaf.backgroundColor } : {}),
    ...(Number.isFinite(leaf.fontSize) ? { fontSize: Math.min(96, Math.max(10, Number(leaf.fontSize))) } : {}),
    ...(safeLink(leaf.url) ? { url: safeLink(leaf.url) } : {}),
  })) }))
}
export function hasRichFormatting(value: RichValue) { return value.some(p => p.resource || p.custom || p.align || p.block || p.indent || p.children.some(leaf => Object.keys(leaf).some(key => key !== 'text'))) }

/** Import supported blocks and marks; URLs are restricted to navigable protocols. */
export function richFromHtml(html: string): RichValue {
  const body = new DOMParser().parseFromString(html.slice(0, 1_000_000), 'text/html').body
  const result: RichValue = []
  let active: RichParagraph | undefined
  const current = (props: Partial<RichParagraph>) => active ||= (result.push({ type: 'paragraph', ...props, children: [] }), result.at(-1)!)
  const walk = (node: globalThis.Node, inherited: Omit<RichLeaf, 'text'> = {}, props: Partial<RichParagraph> = {}, depth = 0) => {
    if (node.nodeType === globalThis.Node.TEXT_NODE) { if (!active && !node.textContent?.trim()) return; current(props).children.push({ ...inherited, text: node.textContent || '' }); return }
    if (!(node instanceof HTMLElement) || ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG'].includes(node.tagName)) return
    if (node.tagName === 'INPUT' || node.getAttribute('contenteditable') === 'false') return
    if (node.tagName === 'BR') { current(props); active = undefined; current(props); return }
    if (node.tagName === 'UL' || node.tagName === 'OL') {
      active = undefined
      const items = [...node.children].filter(child => child.tagName === 'LI'), start = Math.max(1, Number(node.getAttribute('start')) || 1)
      items.forEach((child, index) => {
        const order = Number(child.getAttribute('value')) || (index === 0 ? start : undefined)
        walk(child, inherited, { block: node.tagName === 'OL' ? 'number' : 'bullet', ...(depth ? { indent: depth } : {}), ...(order ? { listOrder: order } : {}) }, depth + 1)
      })
      active = undefined; return
    }
    const block = /^(P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE)$/.test(node.tagName)
    if (block && active?.children.length) active = undefined
    const paragraph = { ...props }
    if (/^H[1-6]$/.test(node.tagName)) Object.assign(paragraph, { block: 'heading', level: Number(node.tagName[1]) })
    if (node.tagName === 'BLOCKQUOTE') paragraph.block = 'quote'
    if (node.tagName === 'PRE') paragraph.block = 'code'
    if (node.tagName === 'LI') {
      const checkbox = node.querySelector<HTMLInputElement>(':scope > input[type=checkbox]')
      if (checkbox) Object.assign(paragraph, { block: 'task', checked: checkbox.checked })
    }
    if (block) Object.assign(current(paragraph), paragraph)
    const style = { ...inherited }
    if (['B', 'STRONG'].includes(node.tagName) || Number(node.style.fontWeight) >= 600 || node.style.fontWeight === 'bold') style.bold = true
    if (['I', 'EM'].includes(node.tagName) || node.style.fontStyle === 'italic') style.italic = true
    if (node.tagName === 'U' || node.style.textDecoration.includes('underline')) style.underline = true
    if (['S', 'DEL', 'STRIKE'].includes(node.tagName) || node.style.textDecoration.includes('line-through')) style.strikethrough = true
    if (node.tagName === 'CODE') style.code = true
    if (node.tagName === 'A' && safeLink(node.getAttribute('href') || '')) style.url = safeLink(node.getAttribute('href')!)
    if (node.style.color) style.color = node.style.color
    if (node.style.backgroundColor) style.backgroundColor = node.style.backgroundColor
    if (node.style.fontSize.endsWith('px')) style.fontSize = parseFloat(node.style.fontSize)
    node.childNodes.forEach(child => walk(child, style, paragraph, depth))
    if (block) active = undefined
  }
  body.childNodes.forEach(node => walk(node))
  return cleanRichValue(result.filter(p => p.children.length))
}

/** Rebase formatting across plain-text changes without ever replacing concurrent text. */
export function rebaseRich(value: RichValue, next: string): RichValue {
  const previous = plainText(value)
  if (previous === next) return value
  let prefix = 0, suffix = 0
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix++
  while (suffix < previous.length - prefix && suffix < next.length - prefix && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++
  const chars: (RichLeaf & { resource?: CanvasResource; custom?: CanvasRichTextElement })[] = []
  value.forEach((p, index) => { if (index) chars.push({ text: '\n' }); if (p.custom) chars.push({ text: RESOURCE_MARKER, custom: p.custom }); else if (p.resource) chars.push({ text: RESOURCE_MARKER, resource: p.resource }); else p.children.forEach(leaf => { for (let i = 0; i < leaf.text.length; i++) chars.push({ ...leaf, text: leaf.text[i] }) }) })
  const style = { ...chars[Math.max(0, prefix - 1)] || { text: '' } }; delete style.resource; delete style.custom
  chars.splice(prefix, previous.length - prefix - suffix, ...next.slice(prefix, next.length - suffix).split('').map(text => ({ ...style, text })))
  const result: RichValue = [{ type: 'paragraph', children: [] }]
  chars.forEach(leaf => {
    if (leaf.text === '\n') { result.push({ type: 'paragraph', children: [] }); return }
    if (leaf.custom && leaf.text === RESOURCE_MARKER) { result.at(-1)!.custom = leaf.custom; return }
    if (leaf.resource && leaf.text === RESOURCE_MARKER) { result.at(-1)!.resource = leaf.resource; return }
    const children = result.at(-1)!.children, last = children.at(-1)
    if (last && JSON.stringify({ ...last, text: '' }) === JSON.stringify({ ...leaf, text: '' })) last.text += leaf.text
    else children.push({ ...leaf })
  })
  result.forEach((p, i) => { if (!p.children.length) p.children.push({ text: '' }); if (value[i]) { const block = { ...value[i] }; delete block.resource; delete block.custom; Object.assign(p, { ...block, children: p.children }) } })
  return result
}
export function readRich(text: Text): RichValue {
  const payload = text.data?.richText as RichPayload | undefined
  if (payload?.version !== 1 || !Array.isArray(payload.value) || !payload.value.length || !payload.value.every(p => Array.isArray(p.children) && p.children.length && p.children.every(leaf => typeof leaf.text === 'string'))) return fromPlain(String(text.text || ''))
  return rebaseRich(cleanRichValue(payload.value), String(text.text || ''))
}
export function alignTextContent(text: Text, align: 'left' | 'center' | 'right' | 'justify') {
  text.textAlign = align === 'justify' ? 'both' : align
  if (text.data?.richText) text.data = { ...text.data, richText: { version: 1, value: readRich(text).map(p => ({ ...p, align })) } }
}

export type RichGlyph = { offset?: number; text: string; x: number; y: number; width: number; size: number; font: string; color: string; background?: string; underline: boolean; strike: boolean; url?: string }
export type RichMedia = { resource: CanvasResource; x: number; y: number; width: number; height: number }
export type RichCheckbox = { index: number; checked: boolean; x: number; y: number; size: number }
export type RichLayout = { carets: { offset: number; x: number; y: number; height: number }[]; media: RichMedia[]; checkboxes: RichCheckbox[]; glyphs: RichGlyph[]; decorations: { x: number; y: number; width: number; height: number; color: string }[]; rows: { x: number; y: number; width: number; height: number; data: { char: string; x: number; width: number }[] }[]; width: number; height: number }
let measure: CanvasRenderingContext2D | null
const cache = new WeakMap<Text, { key: string; result: RichLayout; formatted: boolean }>()
export function richLayout(text: Text, force = false): RichLayout | undefined {
  const payload = text.data?.richText
  if (!payload && !force) return
  const autoWidth = text.__.__autoWidth, maxWidth = autoWidth ? Infinity : Number(text.width || 1)
  const key = JSON.stringify([payload, text.text, maxWidth, text.height, text.fontFamily, text.fontSize, text.fontWeight, text.italic, text.fill, text.lineHeight, text.textAlign, text.verticalAlign, richScroll(text)])
  const cached = cache.get(text)
  if (cached?.key === key) return force || cached.formatted ? cached.result : undefined
  const value = readRich(text)
  const formatted = hasRichFormatting(value)
  if (!formatted && !force) return
  measure ||= document.createElement('canvas').getContext('2d')
  if (!measure) return
  const carets: RichLayout['carets'] = [], media: RichMedia[] = [], checkboxes: RichCheckbox[] = [], glyphs: RichGlyph[] = [], rows: RichLayout['rows'] = [], decorations: RichLayout['decorations'] = []
  const baseSize = Number(text.fontSize || 16), line = text.lineHeight
  const lineRatio = typeof line === 'object' && line?.type === 'percent' ? line.value : typeof line === 'number' ? line / baseSize : 1.5
  let y = 0, widest = 0
  let paragraphOffset = 0
  value.forEach((p, index) => {
    let characterOffset = paragraphOffset; paragraphOffset += plainText([p]).length + 1
    if (p.custom) {
      const label = p.custom.label || p.custom.type, size = baseSize, height = size * 1.8
      measure!.font = `${size}px ${text.fontFamily || 'Arial'}`
      const width = Math.min(maxWidth, measure!.measureText(label).width + 16), align = p.align || text.textAlign
      const x = Number.isFinite(maxWidth) ? align === 'center' ? (maxWidth - width) / 2 : align === 'right' ? maxWidth - width : 0 : 0
      carets.push({ offset: characterOffset, x, y, height }, { offset: characterOffset + 1, x: x + width, y, height })
      decorations.push({ x, y, width, height, color: '#eaf1ff' })
      glyphs.push({ text: label, x: x + 8, y: y + size * 1.2, width: width - 16, size, font: measure!.font, color: '#245bdb', underline: false, strike: false })
      rows.push({ x, y: y + size * 1.2, width, height, data: [{ char: RESOURCE_MARKER, x, width }] })
      widest = Math.max(widest, width); y += height; return
    }
    if (p.resource) {
      const width = Math.max(1, Math.min(Number.isFinite(maxWidth) ? maxWidth : 240, p.resource.kind === 'image' ? p.resource.width || 240 : 320))
      const height = p.resource.kind === 'image' ? width * (p.resource.height || 180) / (p.resource.width || 240) : 56
      const align = p.align || text.textAlign, x = Number.isFinite(maxWidth) ? align === 'center' ? (maxWidth - width) / 2 : align === 'right' ? maxWidth - width : 0 : 0
      carets.push({ offset: characterOffset, x, y, height }, { offset: characterOffset + 1, x: x + width, y, height }); media.push({ resource: p.resource, x, y, width, height }); widest = Math.max(widest, width); y += height + 8; return
    }
    const sizeBase = baseSize * headingScale(p), prefixSize = p.children.find(leaf => leaf.text)?.fontSize || sizeBase, prefix = listMarker(value, index), list = isRichList(p), startY = y
    measure!.font = `${prefixSize}px ${text.fontFamily || 'Arial'}`
    const prefixWidth = measure!.measureText(prefix).width, markerWidth = Math.max(prefixSize * LIST_MARKER, prefixWidth), indent = (p.indent || 0) * baseSize * LIST_INDENT
    const inset = indent + (list ? markerWidth + baseSize * LIST_GAP : p.block === 'quote' ? baseSize : 0)
    let pending: RichGlyph[] = [], x = inset, rowSize = sizeBase, firstRow = true
    const finish = (wrapped = false) => {
      const height = rowSize * lineRatio, baseline = y + (height + rowSize * .7) / 2
      const align = p.align || text.textAlign
      if (wrapped && (align === 'justify' || align === 'both') && Number.isFinite(maxWidth) && maxWidth > x) {
        const gaps = pending.flatMap((glyph, index) => index < pending.length - 1 && (/\s/.test(glyph.text) || /[\u2e80-\u9fff\uf900-\ufaff]/.test(glyph.text + pending[index + 1].text)) ? [index] : [])
        if (gaps.length) { const space = (maxWidth - x) / gaps.length; let offset = 0; pending.forEach((glyph, index) => { glyph.x += offset; if (gaps.includes(index)) { glyph.width += space; offset += space } }); x = maxWidth }
      }
      const offset = Number.isFinite(maxWidth) ? align === 'center' ? (maxWidth - x) / 2 : align === 'right' ? maxWidth - x : 0 : 0
      pending.forEach(glyph => { glyph.x += offset; glyph.y = baseline; glyphs.push(glyph); carets.push({ offset: glyph.offset!, x: glyph.x, y, height }) })
      carets.push({ offset: pending.length ? pending.at(-1)!.offset! + pending.at(-1)!.text.length : characterOffset, x: pending.length ? pending.at(-1)!.x + pending.at(-1)!.width : offset + inset, y, height })
      if (firstRow && p.block === 'task') checkboxes.push({ index, checked: Boolean(p.checked), x: indent, y: y + (height - prefixSize * LIST_MARKER) / 2, size: prefixSize * LIST_MARKER })
      if (prefix && firstRow) glyphs.push({ text: prefix, x: indent + markerWidth - prefixWidth, y: baseline, width: markerWidth, size: prefixSize, font: `${prefixSize}px ${text.fontFamily || 'Arial'}`, color: '#3370ff', underline: false, strike: false })
      firstRow = false
      rows.push({ x: offset, y: baseline, width: x, height, data: pending.map(g => ({ char: g.text, x: g.x, width: g.width })) })
      widest = Math.max(widest, x); y += height; x = inset; rowSize = sizeBase; pending = []
    }
    p.children.forEach(leaf => {
      const size = leaf.fontSize || sizeBase, font = `${leaf.italic || text.italic ? 'italic ' : ''}${leaf.bold === false ? 400 : leaf.bold || p.block === 'heading' ? 700 : text.fontWeight || 400} ${size}px ${leaf.code || p.block === 'code' ? 'ui-monospace, monospace' : text.fontFamily || 'Arial'}`
      if (!leaf.text) rowSize = Math.max(rowSize, size)
      measure!.font = font
      for (const char of leaf.text) {
        if (char === '\n') { characterOffset++; rowSize = Math.max(rowSize, size); finish(); rowSize = Math.max(rowSize, size); continue }
        const width = measure!.measureText(char).width
        if (x > inset && x + width > maxWidth && text.textWrap !== 'none') finish(true)
        pending.push({ offset: characterOffset, text: char, x, y: 0, width, size, font, color: safeColor(leaf.color) || (leaf.url ? '#3370ff' : p.block === 'task' && p.checked ? '#8f959e' : String(text.fill || '#1f2329')), background: safeColor(leaf.backgroundColor), underline: Boolean(leaf.url || leaf.underline || text.textDecoration === 'under'), strike: Boolean(p.block === 'task' && p.checked || leaf.strikethrough || text.textDecoration === 'delete'), url: leaf.url })
        characterOffset += char.length; x += width; rowSize = Math.max(rowSize, size)
      }
    })
    finish()
    if (p.block === 'quote') decorations.push({ x: indent, y: startY, width: 3, height: y - startY, color: '#c9cdd4' })
    if (p.block === 'code') decorations.push({ x: 0, y: startY, width: Number.isFinite(maxWidth) ? maxWidth : widest, height: y - startY, color: '#f2f3f5' })
  })
  const spare = text.__.__autoHeight ? 0 : Math.max(0, Number(text.height) - y)
  const vertical = (text.verticalAlign === 'middle' ? spare / 2 : text.verticalAlign === 'bottom' ? spare : 0) - (richContainer(text) ? Math.min(richScroll(text), Math.max(0, y - Number(text.height))) : 0)
  carets.forEach(caret => caret.y += vertical); media.forEach(m => m.y += vertical); checkboxes.forEach(c => c.y += vertical); glyphs.forEach(g => g.y += vertical); rows.forEach(row => row.y += vertical); decorations.forEach(d => d.y += vertical)
  const result = { carets, media, checkboxes, glyphs, decorations, rows, width: widest, height: y }
  cache.set(text, { key, result, formatted }); return result
}

const enhanced = new WeakSet<Text>()
/** Install a per-element layout adapter. No derived geometry enters content data. */
export function enhanceRichText(text: Text) {
  if (enhanced.has(text)) return
  enhanced.add(text)
  const prepare = () => readRich(text).forEach(p => { if (p.resource) prepareResourceImage(text, p.resource) })
  prepare()
  text.on(PropertyEvent.CHANGE, (event: PropertyEvent) => { if (event.target === text && event.attrName === 'data') { text.forceUpdate('fontSize'); prepare() } })
  const update = text.__updateTextDrawData
  text.__updateTextDrawData = function () {
    update.call(this)
    const layout = richLayout(this, Boolean(richContainer(this)))
    if (!layout) return
    const draw = this.__.__textDrawData
    if (!draw) return
    draw.rows = layout.rows
    Object.assign(draw.bounds, { x: 0, y: 0, width: this.__.__autoWidth ? layout.width : Math.min(Number(this.width), layout.width), height: richContainer(this) ? Math.min(Number(this.height), layout.height) : layout.height })
  }
}

// Leafer exposes Paint as its drawing extension point; plain Text is untouched.
const fillText = Paint.fillText
Paint.fillText = (text, canvas, options) => {
  const layout = richLayout(text as Text, Boolean(richContainer(text as Text)))
  if (!layout) { fillText(text, canvas, options); return }
  canvas.save()
  if (richContainer(text as Text)) { canvas.beginPath?.(); canvas.rect(0, 0, Number(text.width), Number(text.height)); canvas.clip() }
  layout.decorations.forEach(d => { canvas.fillStyle = d.color; canvas.fillRect(d.x, d.y, d.width, d.height) })
  layout.checkboxes.forEach(c => {
    const geometry = taskCheckboxGeometry(c)
    canvas.beginPath?.(); canvas.roundRect(geometry.x, geometry.y, geometry.size, geometry.size, geometry.radius)
    canvas.fillStyle = c.checked ? '#3370ff' : '#ffffff'; canvas.fill()
    canvas.strokeStyle = c.checked ? '#3370ff' : '#bbbfc4'; canvas.lineWidth = geometry.border; canvas.stroke()
    if (c.checked) {
      canvas.beginPath?.(); geometry.points.forEach(([x, y], i) => { if (i) canvas.lineTo(x, y); else canvas.moveTo(x, y) })
      canvas.strokeStyle = '#ffffff'; canvas.lineWidth = geometry.checkWidth; canvas.lineCap = 'round'; canvas.lineJoin = 'round'; canvas.stroke()
    }
  })
  layout.media.forEach(m => {
    const image = m.resource.kind === 'image' && resourceImage(text.app, m.resource.path)
    if (image) canvas.drawImage(image, m.x, m.y, m.width, m.height)
    else {
      canvas.fillStyle = '#f2f5fa'; canvas.fillRect(m.x, m.y, m.width, m.height)
      canvas.fillStyle = '#3370ff'; canvas.font = '12px Arial'; canvas.fillText(m.resource.kind === 'image' ? '▧' : '▤', m.x + 8, m.y + 22)
      canvas.fillStyle = '#1f2329'; canvas.font = '12px Arial'
      const name = m.resource.name || m.resource.path; canvas.fillText(name.length > m.width / 8 ? name.slice(0, Math.max(1, Math.floor(m.width / 8) - 2)) + '…' : name, m.x + 26, m.y + 22)
    }
  })
  layout.glyphs.forEach(g => {
    if (g.background) { canvas.fillStyle = g.background; canvas.fillRect(g.x, g.y - g.size, g.width, g.size * 1.25) }
    canvas.font = g.font; canvas.fillStyle = g.color; canvas.fillText(g.text, g.x, g.y)
    if (g.underline) canvas.fillRect(g.x, g.y + g.size * .13, g.width, Math.max(1, g.size / 16))
    if (g.strike) canvas.fillRect(g.x, g.y - g.size * .3, g.width, Math.max(1, g.size / 16))
  })
  canvas.restore()
}
