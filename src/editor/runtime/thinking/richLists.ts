import type { RichParagraph, RichValue } from './richText'

// slatetsx uses 22px indentation, an 18px marker and a 9px gap at 16px text.
// Express these in text units so they also follow canvas zoom and font sizes.
export const LIST_INDENT = 22 / 16
export const LIST_MARKER = 18 / 16
export const LIST_GAP = 9 / 16
export const TASK_CHECK_POINTS = [[4, 12], [9, 17], [20, 6]].map(([x, y]) => [2 + x * 14 / 24, 2 + y * 14 / 24])
export function taskCheckboxGeometry(box: { x: number; y: number; size: number }) {
  const border = box.size / 12, inset = border / 2, content = box.size - border * 2
  return { x: box.x + inset, y: box.y + inset, size: box.size - border, radius: box.size * 4 / 18 - inset, border, checkWidth: content / 12, points: TASK_CHECK_POINTS.map(([x, y]) => [box.x + border + x * content / 18, box.y + border + y * content / 18]) }
}
export const isRichList = (p: RichParagraph) => p.block === 'bullet' || p.block === 'number' || p.block === 'task'
const explicitOrder = (p: RichParagraph) => Number.isSafeInteger(p.listOrder) && p.listOrder! > 0 ? p.listOrder : undefined

export function orderedListNumber(value: RichValue, index: number): number {
  const paragraph = value[index], depth = paragraph.indent || 0
  const explicit = explicitOrder(paragraph)
  if (explicit) return explicit
  let extra = 0
  for (let i = index - 1; i >= 0; i--) {
    const sibling = value[i], siblingDepth = sibling.indent || 0
    if (!isRichList(sibling) || sibling.resource || sibling.custom || siblingDepth < depth) break
    if (siblingDepth === depth) {
      if (sibling.block !== 'number') break
      const start = explicitOrder(sibling)
      if (start) return start + 1 + extra
      extra++
    }
  }
  return 1 + extra
}

export function listMarker(value: RichValue, index: number): string {
  const p = value[index], depth = p.indent || 0
  if (p.block === 'bullet') return ['•', '◦', '▪'][depth % 3]
  if (p.block !== 'number') return ''
  const order = orderedListNumber(value, index)
  if (depth % 3 === 0) return `${order}.`
  let number = order, label = ''
  while (number > 0) { number--; label = String.fromCharCode(97 + number % 26) + label; number = Math.floor(number / 26) }
  return `${depth % 3 === 2 ? label.toUpperCase() : label}.`
}
