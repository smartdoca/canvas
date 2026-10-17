import { readRich, plainText, richFromHtml, cleanRichValue, type RichLeaf, type RichValue } from './richText'
import { Frame, Text, type Group, type IUI } from 'leafer-ui'
import { createElementId } from '../../../model'

export type CellPoint = { row: number; column: number }
export type CellRange = { anchor: CellPoint; focus: CellPoint }
const label = (cell: IUI) => cell.children?.find(item => item.tag === 'Text') as Text | undefined
export const tableCells = (table: Group) => table.children.filter(item => item.data?.kind === 'table-cell') as Frame[]
export const cellAt = (table: Group, row: number, column: number) => tableCells(table).find(cell => cell.data?.row === row && cell.data?.column === column)
export function rangeBounds(table: Group, range: CellRange) {
  const result = { minRow: Math.min(range.anchor.row, range.focus.row), maxRow: Math.max(range.anchor.row, range.focus.row), minColumn: Math.min(range.anchor.column, range.focus.column), maxColumn: Math.max(range.anchor.column, range.focus.column) }
  let changed = true
  while (changed) {
    changed = false
    tableCells(table).filter(cell => Number(cell.data?.rowSpan || 1) > 1 || Number(cell.data?.columnSpan || 1) > 1).forEach(cell => {
      const row = Number(cell.data!.row), column = Number(cell.data!.column), endRow = row + Number(cell.data?.rowSpan || 1) - 1, endColumn = column + Number(cell.data?.columnSpan || 1) - 1
      if (row > result.maxRow || endRow < result.minRow || column > result.maxColumn || endColumn < result.minColumn) return
      const before = JSON.stringify(result)
      result.minRow = Math.min(result.minRow, row); result.maxRow = Math.max(result.maxRow, endRow); result.minColumn = Math.min(result.minColumn, column); result.maxColumn = Math.max(result.maxColumn, endColumn)
      changed ||= before !== JSON.stringify(result)
    })
  }
  return result
}
export function cellsInRange(table: Group, range: CellRange) {
  const b = rangeBounds(table, range)
  return tableCells(table).filter(cell => Number(cell.data?.row) >= b.minRow && Number(cell.data?.row) <= b.maxRow && Number(cell.data?.column) >= b.minColumn && Number(cell.data?.column) <= b.maxColumn)
}
export function visibleCell(table: Group, point: CellPoint) {
  const cell = cellAt(table, point.row, point.column)
  return cell?.data?.coveredBy ? tableCells(table).find(item => item.id === cell.data?.coveredBy) : cell
}
export function tableSizes(table: Group) {
  const columns = Number(table.data?.columns || 1), rows = Number(table.data?.rows || 1)
  return {
    widths: Array.from({ length: columns }, (_, index) => Math.max(48, Number(table.data?.columnWidths?.[index] || cellAt(table, 0, index)?.width || 140))),
    heights: Array.from({ length: rows }, (_, index) => Math.max(28, Number(table.data?.rowHeights?.[index] || 46))),
  }
}
export function layoutTable(table: Group) {
  const { widths, heights } = tableSizes(table), cells = tableCells(table)
  if (!table.data?.columnWidths || !table.data?.rowHeights) table.data = { ...table.data, columnWidths: widths, rowHeights: heights }
  const xs = widths.map((_, index) => widths.slice(0, index).reduce((a, b) => a + b, 0)), ys = heights.map((_, index) => heights.slice(0, index).reduce((a, b) => a + b, 0))
  const coverage = new Map<string, string>()
  cells.filter(cell => cell.data?.rowSpan || cell.data?.columnSpan).forEach(cell => {
    const row = Number(cell.data!.row), column = Number(cell.data!.column)
    for (let r = row; r < row + Number(cell.data?.rowSpan || 1); r++) for (let c = column; c < column + Number(cell.data?.columnSpan || 1); c++) if (r !== row || c !== column) coverage.set(`${r}:${c}`, cell.id!)
  })
  cells.forEach(cell => {
    const row = Number(cell.data!.row), column = Number(cell.data!.column), rowSpan = Number(cell.data?.rowSpan || 1), columnSpan = Number(cell.data?.columnSpan || 1)
    const width = widths.slice(column, column + columnSpan).reduce((a, b) => a + b, 0), height = heights.slice(row, row + rowSpan).reduce((a, b) => a + b, 0), coveredBy = coverage.get(`${row}:${column}`)
    const data = { ...cell.data }; if (coveredBy) data.coveredBy = coveredBy; else delete data.coveredBy
    if (JSON.stringify(data) !== JSON.stringify(cell.data)) cell.data = data
    cell.set({ x: xs[column], y: ys[row], width, height, visible: !coveredBy, overflow: 'hide', editConfig: { moveable: false, resizeable: false, rotateable: false } })
    label(cell)?.set({ width: Math.max(12, width - 24), height: Math.max(12, height - 20) })
  })
}
function newCell(row: number, column: number) {
  const cell = new Frame({ id: createElementId(), name: 'table-cell', width: 140, height: 46, fill: row === 0 ? '#eaf1ff' : '#ffffff', stroke: '#cfd3d8', strokeWidth: 1, editable: false, hitChildren: false, data: { kind: 'table-cell', row, column } })
  cell.add(new Text({ id: createElementId(), name: 'text', text: '', x: 12, y: 10, width: 116, height: 26, fontSize: 14, fill: '#1f2329', fontFamily: 'Arial, "PingFang SC", sans-serif', fontWeight: row === 0 ? 600 : 400, verticalAlign: 'top', editable: true, data: { kind: 'cell-label' } }))
  return cell
}
export function insertTableAxis(table: Group, axis: 'row' | 'column', at: number) {
  const key = axis === 'row' ? 'row' : 'column', countKey = axis === 'row' ? 'rows' : 'columns', count = Number(table.data?.[countKey] || 1)
  if (count >= (axis === 'row' ? 100 : 30)) return false
  at = Math.max(0, Math.min(count, at))
  const sizes = tableSizes(table), cells = tableCells(table)
  cells.forEach(cell => {
    const index = Number(cell.data?.[key]), spanKey = axis === 'row' ? 'rowSpan' : 'columnSpan', span = Number(cell.data?.[spanKey] || 1)
    if (index >= at) cell.data = { ...cell.data, [key]: index + 1 }
    else if (index + span > at) cell.data = { ...cell.data, [spanKey]: span + 1 }
  })
  const cross = Number(table.data?.[axis === 'row' ? 'columns' : 'rows'] || 1)
  for (let index = 0; index < cross; index++) table.add(newCell(axis === 'row' ? at : index, axis === 'column' ? at : index))
  if (axis === 'row') sizes.heights.splice(at, 0, 46); else sizes.widths.splice(at, 0, 140)
  table.data = { ...table.data, [countKey]: count + 1, columnWidths: sizes.widths, rowHeights: sizes.heights }
  layoutTable(table); return true
}
export function splitTableCells(table: Group, range: CellRange) {
  cellsInRange(table, range).forEach(cell => { const data = { ...cell.data }; delete data.rowSpan; delete data.columnSpan; delete data.coveredBy; cell.data = data })
  layoutTable(table)
}
export function mergeTableCells(table: Group, range: CellRange) {
  const b = rangeBounds(table, range)
  if (b.minRow === b.maxRow && b.minColumn === b.maxColumn) return false
  const cells = cellsInRange(table, range), anchor = cellAt(table, b.minRow, b.minColumn)!, texts = cells.filter(cell => !cell.data?.coveredBy).sort((a, b) => Number(a.data?.row) - Number(b.data?.row) || Number(a.data?.column) - Number(b.data?.column)).flatMap(cell => { const text = label(cell); return text && text.text ? readRich(text) : [] })
  splitTableCells(table, range)
  cells.forEach(cell => { const text = label(cell); if (text) { text.text = cell === anchor ? plainText(texts) : ''; const data = { ...text.data }; if (cell === anchor && texts.length) data.richText = { version: 1, value: texts }; else delete data.richText; text.data = data } })
  anchor.data = { ...anchor.data, rowSpan: b.maxRow - b.minRow + 1, columnSpan: b.maxColumn - b.minColumn + 1 }
  layoutTable(table); fitTableContent(table); return true
}
export function deleteTableAxis(table: Group, axis: 'row' | 'column', at: number) {
  const key = axis === 'row' ? 'row' : 'column', countKey = axis === 'row' ? 'rows' : 'columns', count = Number(table.data?.[countKey] || 1)
  if (count <= 1) { table.remove(); return }
  const sizes = tableSizes(table), cells = tableCells(table)
  // Preserve merged content if its anchor is removed but the region survives.
  cells.filter(cell => Number(cell.data?.[key]) === at && Number(cell.data?.[axis === 'row' ? 'rowSpan' : 'columnSpan'] || 1) > 1).forEach(cell => {
    const next = cellAt(table, Number(cell.data!.row) + (axis === 'row' ? 1 : 0), Number(cell.data!.column) + (axis === 'column' ? 1 : 0))
    if (next) { const content = label(cell), target = label(next); if (content && target) target.set({ text: content.text, data: { ...content.data } }); next.data = { ...next.data, rowSpan: Math.max(1, Number(cell.data?.rowSpan || 1) - (axis === 'row' ? 1 : 0)), columnSpan: Math.max(1, Number(cell.data?.columnSpan || 1) - (axis === 'column' ? 1 : 0)) } }
  })
  cells.forEach(cell => {
    const index = Number(cell.data?.[key]), spanKey = axis === 'row' ? 'rowSpan' : 'columnSpan', span = Number(cell.data?.[spanKey] || 1)
    if (index === at) cell.remove()
    else { const data = { ...cell.data, [key]: index > at ? index - 1 : index }; if (index < at && index + span > at) data[spanKey] = span - 1; cell.data = data }
  })
  if (axis === 'row') sizes.heights.splice(at, 1); else sizes.widths.splice(at, 1)
  table.data = { ...table.data, [countKey]: count - 1, columnWidths: sizes.widths, rowHeights: sizes.heights }; layoutTable(table)
}
export function clearTableCells(cells: IUI[]) { cells.forEach(cell => { const text = label(cell); if (text) { text.text = ''; const data = { ...text.data }; delete data.richText; text.data = data } }) }
export function pasteTableText(table: Group, point: CellPoint, content: string) {
  const rows = content.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(row => row.split('\t'))
  const neededRows = point.row + rows.length, neededColumns = point.column + Math.max(...rows.map(row => row.length))
  if (neededRows > 100 || neededColumns > 30) return false
  while (Number(table.data?.rows) < neededRows) insertTableAxis(table, 'row', Number(table.data?.rows))
  while (Number(table.data?.columns) < neededColumns) insertTableAxis(table, 'column', Number(table.data?.columns))
  splitTableCells(table, { anchor: point, focus: { row: neededRows - 1, column: neededColumns - 1 } })
  rows.forEach((row, r) => row.forEach((value, c) => { const cell = visibleCell(table, { row: point.row + r, column: point.column + c }), text = cell && label(cell); if (text) { text.text = value; const data = { ...text.data }; delete data.richText; text.data = data } }))
  return true
}

/** Reconcile bounded cell geometry; overflowing content scrolls inside it. */
export function fitTableContent(table: Group) { layoutTable(table) }

export const TABLE_CLIPBOARD = 'application/x-aidcanvas-table'
export function copyTableFragment(table: Group, range: CellRange) {
  const b = rangeBounds(table, range), rows = []
  for (let row = b.minRow; row <= b.maxRow; row++) {
    const cells = []
    for (let column = b.minColumn; column <= b.maxColumn; column++) { const cell = cellAt(table, row, column), text = cell && label(cell); cells.push({ value: text ? readRich(text) : [{ type: 'paragraph', children: [{ text: '' }] }], fill: cell?.fill, fontSize: text?.fontSize, fontWeight: text?.fontWeight, textAlign: text?.textAlign }) }
    rows.push(cells)
  }
  return { version: 1, rows }
}
export function pasteTableFragment(table: Group, point: CellPoint, input: unknown) {
  const data = input as { version?: number; rows?: { value?: RichValue; fill?: string; fontSize?: number; fontWeight?: number; textAlign?: string }[][] }
  if (data?.version !== 1 || !Array.isArray(data.rows) || !data.rows.length || data.rows.length > 100 || data.rows.some(row => !Array.isArray(row) || !row.length || row.length > 30 || row.some(cell => !Array.isArray(cell?.value) || !cell.value.every(p => Array.isArray(p?.children))))) return false
  // Grow/split once, then replace each cell with its own rich value (including multiline paragraphs).
  if (!pasteTableText(table, point, data.rows.map(row => row.map(() => '').join('\t')).join('\n') + '\n')) return false
  data.rows.forEach((row, r) => row.forEach((source, c) => {
    const cell = cellAt(table, point.row + r, point.column + c), text = cell && label(cell)
    if (!cell || !text) return
    const value = cleanRichValue(source.value!)
    text.set({ text: plainText(value), data: { ...text.data, richText: { version: 1, value } }, ...(Number.isFinite(source.fontSize) ? { fontSize: Math.min(96, Math.max(10, Number(source.fontSize))) } : {}), ...(Number.isFinite(source.fontWeight) ? { fontWeight: (Math.round(Math.min(900, Math.max(100, Number(source.fontWeight))) / 100) * 100) as Text['fontWeight'] } : {}), ...(['left', 'center', 'right'].includes(source.textAlign || '') ? { textAlign: source.textAlign as 'left' } : {}) })
    if (typeof source.fill === 'string' && CSS.supports('color', source.fill) && !/var\(|url\(/i.test(source.fill)) cell.fill = source.fill
  }))
  fitTableContent(table); return true
}
export function tableFragmentFromHtml(html: string) {
  const table = new DOMParser().parseFromString(html.slice(0, 1_000_000), 'text/html').querySelector('table')
  if (!table) return undefined
  const rows = [...table.rows].map(row => [...row.cells].map(cell => ({ value: richFromHtml(cell.innerHTML) })))
  return { version: 1, rows }
}

export function formatTableCells(table: Group, range: CellRange, key: keyof Omit<RichLeaf, 'text'>, value: string | number | boolean = true) {
  const texts = cellsInRange(table, range).filter(cell => !cell.data?.coveredBy).map(label).filter((text): text is Text => Boolean(text))
  const remove = texts.every(text => readRich(text).every(p => p.children.every(leaf => (leaf[key] ?? (key === 'bold' && Number(text.fontWeight || 400) >= 600)) === value)))
  texts.forEach(text => { const rich = readRich(text); rich.forEach(p => p.children.forEach(leaf => { if (remove) { if (key === 'bold' && Number(text.fontWeight || 400) >= 600) leaf.bold = false; else delete leaf[key] } else Object.assign(leaf, { [key]: value }) })); text.data = { ...text.data, richText: { version: 1, value: rich } } })
  fitTableContent(table)
}
