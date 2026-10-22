import { useCallback, useEffect, useRef, useState, useMemo, type PointerEvent as ReactPointerEvent } from 'react'
import { ownsCanvasCommands } from '../utils/keyboardOwnership'
import { MoveEvent, PropertyEvent, ZoomEvent, type App, type Group, type IUI } from 'leafer-ui'
import { EditorEvent, InnerEditorEvent } from '@leafer-in/editor'
import { useCanvasI18n } from '../../../i18n/context'
import { horizontalAlign, readRich, type RichLeaf } from './richText'
import { Popover } from '../../ui/Popover'
import { Dropdown } from '../../ui/Dropdown'
import { BoardIcon } from './BoardIcon'
import { TextAlignmentControl } from './TextAlignmentControl'
import { allItems, ancestor, kind, labelOf } from './scene'
import { TABLE_CLIPBOARD, formatTableCells, copyTableFragment, pasteTableFragment, tableFragmentFromHtml, fitTableContent, cellAt, cellsInRange, clearTableCells, deleteTableAxis, insertTableAxis, mergeTableCells, pasteTableText, rangeBounds, splitTableCells, tableCells, tableSizes, visibleCell, type CellPoint, type CellRange } from './table'

type Resize = { axis: 'row' | 'column' | 'move'; index: number; start: { x: number; y: number }; delta: number; dx: number; dy: number }
const pointOf = (cell: IUI): CellPoint => ({ row: Number(cell.data?.row), column: Number(cell.data?.column) })
function selectedRange(table: Group | undefined, selection: IUI[], preferred?: CellRange): CellRange | undefined {
  if (!table) return
  const cells = [...new Set(selection.map(item => ancestor(item, 'table-cell')).filter((cell): cell is IUI => Boolean(cell) && ancestor(cell, 'table') === table))]
  if (!cells.length) return
  if (preferred) {
    const expected = cellsInRange(table, preferred).filter(cell => !cell.data?.coveredBy)
    if (expected.length === cells.length && expected.every(cell => cells.includes(cell))) return preferred
  }
  const points = cells.map(pointOf)
  return { anchor: { row: Math.min(...points.map(p => p.row)), column: Math.min(...points.map(p => p.column)) }, focus: { row: Math.max(...points.map(p => p.row)), column: Math.max(...points.map(p => p.column)) } }
}
/** slatetsx-style cell/axis selection, with Slate rich text mounted in the active cell. */
export function TableInteractions({ app, activeKey, selection, onComplete }: { app: App; activeKey: string; selection: IUI[]; onComplete: (items: IUI[]) => void }) {
  const t = useCanvasI18n(), root = useRef<HTMLDivElement>(null), toolbar = useRef<HTMLDivElement>(null), [, redraw] = useState(0)
  const [toolbarSize, setToolbarSize] = useState({ width: 680, height: 44 })
  const table = ancestor(selection[0], 'table') as Group | undefined
  const [rangeState, setRangeState] = useState<{ id: string; range: CellRange }>(), rangeRef = useRef<CellRange>(), tableRef = useRef(table)
  const [resize, setResize] = useState<Resize>(), resizeRef = useRef<Resize>(), dragging = useRef<{ owner: Group; anchor: CellPoint; pointerId: number }>(), moved = useRef(false)
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState<{ tableId: string; x: number; y: number }>(), [batchCount, setBatchCount] = useState(1), [insertHover, setInsertHover] = useState<{ axis: 'row' | 'column'; at: number }>()
  const pagePoint = useCallback((event: { clientX: number; clientY: number }) => app.tree.getInnerPoint(app.tree.getWorldPointByClient(event)), [app])
  const stagePoint = (point: { x: number; y: number }) => { const p = app.tree.getClientPointByWorld(app.tree.getWorldPoint(point)), b = (app.view as HTMLElement).closest('.canvas-stage')!.getBoundingClientRect(); return { x: p.x - b.left, y: p.y - b.top } }
  const range = useMemo(() => selectedRange(table, selection, rangeState?.id === table?.id ? rangeState?.range : undefined), [rangeState, selection, table])
  useEffect(() => { tableRef.current = table; rangeRef.current = range }, [table, range])
  const select = useCallback((owner: Group, next: CellRange) => {
    setRangeState({ id: owner.id!, range: next }); rangeRef.current = next; tableRef.current = owner
    const cells = cellsInRange(owner, next).filter(cell => !cell.data?.coveredBy)
    app.editor.select(cells); (app.view as HTMLElement).closest<HTMLElement>('.canvas-app')?.focus({ preventScroll: true })
  }, [app])
  const editCell = useCallback((owner: Group, point: CellPoint, client?: { clientX: number; clientY: number }) => {
    const cell = visibleCell(owner, point), text = cell && labelOf(cell)
    if (!text) return
    const next = { anchor: point, focus: point }; rangeRef.current = next; tableRef.current = owner; setRangeState({ id: owner.id!, range: next })
    app.editor.select(text); app.editor.openInnerEditor(text, true); setEditing(true)
    if (client) (app.editor.innerEditor as unknown as { placeCaretAtClient?: (point: typeof client) => void }).placeCaretAtClient?.(client)
  }, [app])
  useEffect(() => {
    if (!menu) return
    const dismiss = (event: PointerEvent) => { if (!(event.target as HTMLElement).closest('.table-axis-menu,.table-axis-rail')) setMenu(undefined) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(undefined) }
    document.addEventListener('pointerdown', dismiss, true); window.addEventListener('keydown', escape, true)
    return () => { document.removeEventListener('pointerdown', dismiss, true); window.removeEventListener('keydown', escape, true) }
  }, [menu])
  useEffect(() => {
    if (activeKey !== 'init') return
    const host = (app.view as HTMLElement).closest('.canvas-host')!
    const locate = (owner: Group, event: { clientX: number; clientY: number }, clamp = false) => {
      const p = pagePoint(event)
      if (clamp) { const bounds = owner.getBounds('box', 'page'); p.x = Math.max(bounds.x + .1, Math.min(bounds.x + bounds.width - .1, p.x)); p.y = Math.max(bounds.y + .1, Math.min(bounds.y + bounds.height - .1, p.y)) }
      return tableCells(owner).find(cell => { if (cell.visible === false) return false; const b = cell.getBounds('box', 'page'); return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height })
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof HTMLElement) || !host.contains(event.target) || event.target.closest('.canvas-slate-mount') && !event.target.closest('.canvas-slate-editable')) return
      if (event.target.closest('button,input,select,textarea,[role=menu]')) return
      if (event.target.closest('.canvas-slate-mount [contenteditable=false],.canvas-slate-mount button,.canvas-slate-mount input,.canvas-slate-mount select,.canvas-slate-mount textarea')) return
      const owner = allItems(app).filter(item => kind(item) === 'table').reverse().find(item => locate(item as Group, event)) as Group | undefined
      if (!owner) return
      const cell = locate(owner, event)!, point = pointOf(cell)
      if (event.target.closest('.canvas-slate-editable') && !event.shiftKey) { tableRef.current = owner; dragging.current = { owner, anchor: point, pointerId: event.pointerId }; moved.current = false; host.setPointerCapture(event.pointerId); (app.editor.innerEditor as unknown as { placeCaretAtClient?: (point: typeof event) => void }).placeCaretAtClient?.(event); return }
      app.editor.closeInnerEditor()
      event.preventDefault(); event.stopImmediatePropagation(); dragging.current = { owner, anchor: point, pointerId: event.pointerId }; moved.current = false; host.setPointerCapture(event.pointerId)
      const previous = tableRef.current === owner ? rangeRef.current : undefined
      if (!event.shiftKey) { tableRef.current = owner; editCell(owner, point, event); return }
      tableRef.current = owner
      select(owner, { anchor: event.shiftKey && previous ? previous.anchor : point, focus: point })
    }
    const double = (event: MouseEvent) => {
      if (!host.contains(event.target as globalThis.Node) || (event.target as HTMLElement).closest('.canvas-slate-mount')) return
      const owner = allItems(app).filter(item => kind(item) === 'table').reverse().find(item => locate(item as Group, event)) as Group | undefined
      if (!owner) return
      event.preventDefault(); event.stopImmediatePropagation(); dragging.current = undefined
      editCell(owner, pointOf(locate(owner, event)!))
    }
    const move = (event: PointerEvent) => {
      const owner = dragging.current?.owner || tableRef.current, current = resizeRef.current
      if (current && owner) {
        const p = pagePoint(event); current.dx = p.x - current.start.x; current.dy = p.y - current.start.y; current.delta = current.axis === 'column' ? current.dx : current.dy
        setResize({ ...current }); event.preventDefault(); return
      }
      if (!dragging.current || !owner) return
      const cell = locate(owner, event, true)
      if (!cell) return
      const focus = pointOf(cell)
      if (focus.row !== dragging.current.anchor.row || focus.column !== dragging.current.anchor.column) moved.current = true
      if (moved.current) { event.preventDefault(); event.stopImmediatePropagation(); window.getSelection()?.removeAllRanges(); app.editor.closeInnerEditor(); select(owner, { anchor: dragging.current.anchor, focus }) }
      else if (app.editor.innerEditing) { event.preventDefault(); (app.editor.innerEditor as unknown as { placeCaretAtClient?: (point: typeof event, extend: boolean) => void }).placeCaretAtClient?.(event, true) }
    }
    const cancel = () => { dragging.current = undefined; resizeRef.current = undefined; setResize(undefined) }
    const up = (event: PointerEvent) => {
      if (moved.current && dragging.current) { event.preventDefault(); event.stopImmediatePropagation(); moved.current = false }
      dragging.current = undefined
      const current = resizeRef.current, owner = tableRef.current
      resizeRef.current = undefined; setResize(undefined)
      if (!current || !owner || (!current.dx && !current.dy)) return
      if (current.axis === 'move') owner.set({ x: Number(owner.x || 0) + current.dx, y: Number(owner.y || 0) + current.dy })
      else {
        const sizes = tableSizes(owner)
        if (current.axis === 'column') sizes.widths[current.index] = Math.max(48, sizes.widths[current.index] + current.delta)
        else sizes.heights[current.index] = Math.max(28, sizes.heights[current.index] + current.delta)
        owner.data = { ...owner.data, columnWidths: sizes.widths, rowHeights: sizes.heights }; fitTableContent(owner)
      }
      onComplete([...app.editor.list])
    }
    const key = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229 || !ownsCanvasCommands(event, host)) return
      const owner = ancestor(app.editor.list[0], 'table') as Group | undefined, current = selectedRange(owner, app.editor.list, rangeRef.current)
      if (event.key === 'Escape' && resizeRef.current) { event.preventDefault(); event.stopImmediatePropagation(); resizeRef.current = undefined; setResize(undefined); return }
      if (!owner || !current || app.editor.innerEditing) return
      const stop = () => { event.preventDefault(); event.stopImmediatePropagation() }
      if (['Backspace', 'Delete'].includes(event.key)) { stop(); clearTableCells(cellsInRange(owner, current)); onComplete([...app.editor.list]); return }
      if (event.key === 'Enter' || event.key === 'F2') { stop(); editCell(owner, current.focus); return }
      if ((event.metaKey || event.ctrlKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) { stop(); formatTableCells(owner, current, ({ b: 'bold', i: 'italic', u: 'underline' } as const)[event.key.toLowerCase() as 'b']); onComplete([...app.editor.list]); return }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key.length === 1 && event.key !== ' ') {
        // Keep the browser's text/IME input path; it must reach the newly focused Slate editor.
        editCell(owner, current.focus); return
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(event.key)) return
      stop()
      const point = { ...current.focus }, rows = Number(owner.data?.rows), columns = Number(owner.data?.columns)
      if (event.key === 'Tab') { const at = point.row * columns + point.column + (event.shiftKey ? -1 : 1); point.row = Math.floor(Math.max(0, at) / columns); point.column = Math.max(0, at) % columns; if (point.row >= rows) insertTableAxis(owner, 'row', rows) }
      else { point.row = Math.max(0, Math.min(rows - 1, point.row + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0))); point.column = Math.max(0, Math.min(columns - 1, point.column + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0))) }
      const cell = visibleCell(owner, point)
      if (cell) select(owner, { anchor: event.shiftKey && event.key !== 'Tab' ? current.anchor : pointOf(cell), focus: pointOf(cell) })
    }
    const clipboard = (event: ClipboardEvent) => {
      const owner = ancestor(app.editor.list[0], 'table') as Group | undefined, current = selectedRange(owner, app.editor.list, rangeRef.current)
      if (!owner || !current || app.editor.innerEditing || !ownsCanvasCommands(event, host)) return
      if (event.type === 'paste') {
        // File clipboard content belongs to the resource uploader, not empty TSV.
        if (event.clipboardData?.files.length) return
        const encoded = event.clipboardData?.getData(TABLE_CLIPBOARD), html = event.clipboardData?.getData('text/html')
        let fragment: unknown
        try { fragment = encoded ? JSON.parse(encoded) : html ? tableFragmentFromHtml(html) : undefined } catch { /* Invalid clipboard fragments fall back to text. */ }
        if (fragment && pasteTableFragment(owner, current.anchor, fragment)) { event.preventDefault(); event.stopImmediatePropagation(); onComplete([...app.editor.list]); return }
        const text = event.clipboardData?.getData('text/plain')
        if (text === undefined || !pasteTableText(owner, current.anchor, text)) return
        event.preventDefault(); event.stopImmediatePropagation(); onComplete([...app.editor.list]); return
      }
      const b = rangeBounds(owner, current), rows: string[] = []
      for (let r = b.minRow; r <= b.maxRow; r++) { const cells: string[] = []; for (let c = b.minColumn; c <= b.maxColumn; c++) cells.push(String(labelOf(cellAt(owner, r, c)!)?.text || '')); rows.push(cells.join('\t')) }
      event.clipboardData?.setData(TABLE_CLIPBOARD, JSON.stringify(copyTableFragment(owner, current)))
      event.clipboardData?.setData('text/plain', rows.join('\n')); event.preventDefault(); event.stopImmediatePropagation()
      if (event.type === 'cut') { clearTableCells(cellsInRange(owner, current)); onComplete([...app.editor.list]) }
    }
    const context = (event: MouseEvent) => {
      if (!host.contains(event.target as globalThis.Node) || (event.target as HTMLElement).closest('.rich-resource-block,.rich-custom-block')) return
      const owner = allItems(app).filter(item => kind(item) === 'table').reverse().find(item => locate(item as Group, event)) as Group | undefined
      if (!owner) return
      event.preventDefault(); event.stopImmediatePropagation(); app.editor.closeInnerEditor()
      const point = pointOf(locate(owner, event)!), old = tableRef.current === owner && rangeRef.current, b = old && rangeBounds(owner, old)
      select(owner, b && point.row >= b.minRow && point.row <= b.maxRow && point.column >= b.minColumn && point.column <= b.maxColumn ? old as CellRange : { anchor: point, focus: point })
      const stage = (app.view as HTMLElement).closest('.canvas-stage')!.getBoundingClientRect()
      setBatchCount(1); setMenu({ tableId: owner.id!, x: event.clientX - stage.left, y: event.clientY - stage.top })
    }
    const paint = () => { setEditing(Boolean(app.editor.innerEditing)); redraw(n => n + 1) }
    const ids = [app.on_(MoveEvent.MOVE, paint), app.on_(ZoomEvent.ZOOM, paint), app.tree.on_(PropertyEvent.CHANGE, paint), app.editor.on_(EditorEvent.SELECT, paint), app.editor.on_(InnerEditorEvent.OPEN, paint), app.editor.on_(InnerEditorEvent.CLOSE, paint)]
    document.addEventListener('dblclick', double, true); document.addEventListener('contextmenu', context, true); document.addEventListener('pointercancel', cancel, true); window.addEventListener('blur', cancel)
    document.addEventListener('pointerdown', down, true); document.addEventListener('pointermove', move, true); document.addEventListener('pointerup', up, true); window.addEventListener('keydown', key, true)
    for (const name of ['copy', 'cut', 'paste']) document.addEventListener(name, clipboard as EventListener, true)
    return () => { document.removeEventListener('dblclick', double, true); document.removeEventListener('contextmenu', context, true); document.removeEventListener('pointercancel', cancel, true); window.removeEventListener('blur', cancel); app.off_(ids); document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointermove', move, true); document.removeEventListener('pointerup', up, true); window.removeEventListener('keydown', key, true); for (const name of ['copy', 'cut', 'paste']) document.removeEventListener(name, clipboard as EventListener, true) }
  }, [activeKey, app, editCell, onComplete, pagePoint, select])
  useEffect(() => {
    const element = toolbar.current
    if (!element) return
    const observer = new ResizeObserver(() => { const width = element.offsetWidth, height = element.offsetHeight; setToolbarSize(old => old.width === width && old.height === height ? old : { width, height }) })
    observer.observe(element); return () => observer.disconnect()
  }, [table, editing, range])
  if (!table || activeKey !== 'init' || !table.leafer) return <div ref={root} className="table-interaction-overlay" />
  const sizes = tableSizes(table), origin = stagePoint(table.getPagePoint(table.getWorldPoint({ x: 0, y: 0 }))), scale = stagePoint(table.getPagePoint(table.getWorldPoint({ x: 1, y: 1 }))), sx = scale.x - origin.x, sy = scale.y - origin.y
  const width = sizes.widths.reduce((a, b) => a + b, 0) * sx, height = sizes.heights.reduce((a, b) => a + b, 0) * sy
  const b = range && rangeBounds(table, range), sum = (values: number[], count: number) => values.slice(0, count).reduce((a, b) => a + b, 0)
  const run = (action: () => void) => { setMenu(undefined); setInsertHover(undefined); app.editor.closeInnerEditor(); action(); if (table.leafer) fitTableContent(table); if (table.leafer) { const clamp = (point?: CellPoint) => ({ row: Math.min(Number(table.data?.rows) - 1, point?.row || 0), column: Math.min(Number(table.data?.columns) - 1, point?.column || 0) }); select(table, { anchor: clamp(range?.anchor), focus: clamp(range?.focus) }) } else app.editor.cancel(); onComplete([...app.editor.list]) }
  const format = (key: keyof Omit<RichLeaf, 'text'>, value: string | number | boolean = true) => run(() => formatTableCells(table, range!, key, value))
  const beginResize = (event: ReactPointerEvent, axis: Resize['axis'], index = 0) => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); app.editor.closeInnerEditor(); const next: Resize = { axis, index, start: pagePoint(event), delta: 0, dx: 0, dy: 0 }; resizeRef.current = next; setResize(next) }
  const axisMenu = (event: ReactPointerEvent, axis: 'row' | 'column', index: number) => {
    event.preventDefault(); event.stopPropagation()
    app.editor.closeInnerEditor()
    select(table, axis === 'row' ? { anchor: { row: index, column: 0 }, focus: { row: index, column: sizes.widths.length - 1 } } : { anchor: { row: 0, column: index }, focus: { row: sizes.heights.length - 1, column: index } })
    const stage = (app.view as HTMLElement).closest('.canvas-stage')!.getBoundingClientRect()
    setBatchCount(1); setMenu({ tableId: table.id!, x: event.clientX - stage.left + 8, y: event.clientY - stage.top + 10 })
  }
  return <div ref={root} className={`table-interaction-overlay${range && !editing ? ' has-cell-selection' : ''}`}>
    <div className={`table-axis-layer${editing ? ' is-editing' : ''}`} style={{ left: origin.x, top: origin.y, width, height }}>
      {sizes.widths.map((w, index) => <button type="button" className={`table-axis-rail is-column${b && !editing && index >= b.minColumn && index <= b.maxColumn ? ' is-active' : ''}`} key={`c${index}`} aria-label={t('table.selectColumn', { index: index + 1 })} style={{ left: sum(sizes.widths, index) * sx, width: w * sx }} onPointerDown={event => { axisMenu(event, 'column', index) }}><span /></button>)}
      {sizes.heights.map((h, index) => <button type="button" className={`table-axis-rail is-row${b && !editing && index >= b.minRow && index <= b.maxRow ? ' is-active' : ''}`} key={`r${index}`} aria-label={t('table.selectRow', { index: index + 1 })} style={{ top: sum(sizes.heights, index) * sy, height: h * sy }} onPointerDown={event => { axisMenu(event, 'row', index) }}><span /></button>)}
      {([0, ...sizes.widths.map((_, index) => sum(sizes.widths, index + 1))]).map((left, index) => <button type="button" key={`insert-column-${index}`} className="table-insert-dot is-column" aria-label={t('table.insertColumnAt', { index: index + 1 })} title={t('table.insertColumnAt', { index: index + 1 })} style={{ left: left * sx }} onPointerEnter={() => setInsertHover({ axis: 'column', at: index })} onPointerLeave={() => setInsertHover(undefined)} onFocus={() => setInsertHover({ axis: 'column', at: index })} onBlur={() => setInsertHover(undefined)} onPointerDown={event => { event.preventDefault(); event.stopPropagation() }} onClick={() => run(() => insertTableAxis(table, 'column', index))}><BoardIcon name="plus" size={12} /></button>)}
      {([0, ...sizes.heights.map((_, index) => sum(sizes.heights, index + 1))]).map((top, index) => <button type="button" key={`insert-row-${index}`} className="table-insert-dot is-row" aria-label={t('table.insertRowAt', { index: index + 1 })} title={t('table.insertRowAt', { index: index + 1 })} style={{ top: top * sy }} onPointerEnter={() => setInsertHover({ axis: 'row', at: index })} onPointerLeave={() => setInsertHover(undefined)} onFocus={() => setInsertHover({ axis: 'row', at: index })} onBlur={() => setInsertHover(undefined)} onPointerDown={event => { event.preventDefault(); event.stopPropagation() }} onClick={() => run(() => insertTableAxis(table, 'row', index))}><BoardIcon name="plus" size={12} /></button>)}
      {insertHover && <div className={`table-insert-guide is-${insertHover.axis}`} style={insertHover.axis === 'column' ? { left: sum(sizes.widths, insertHover.at) * sx } : { top: sum(sizes.heights, insertHover.at) * sy }} />}
      {sizes.widths.map((_, index) => <div className="table-boundary is-column" role="separator" aria-label={t('table.resizeColumn', { index: index + 1 })} key={`cw${index}`} style={{ left: sum(sizes.widths, index + 1) * sx }} onPointerDown={event => beginResize(event, 'column', index)} />)}
      {sizes.heights.map((_, index) => <div className="table-boundary is-row" role="separator" aria-label={t('table.resizeRow', { index: index + 1 })} key={`rh${index}`} style={{ top: sum(sizes.heights, index + 1) * sy }} onPointerDown={event => beginResize(event, 'row', index)} />)}
      {b && !editing && <div className="table-cell-selection" style={{ left: sum(sizes.widths, b.minColumn) * sx, top: sum(sizes.heights, b.minRow) * sy, width: sum(sizes.widths.slice(b.minColumn), b.maxColumn - b.minColumn + 1) * sx, height: sum(sizes.heights.slice(b.minRow), b.maxRow - b.minRow + 1) * sy }} />}
      {resize && <div className={`table-resize-guide is-${resize.axis}`} style={resize.axis === 'column' ? { left: (sum(sizes.widths, resize.index + 1) + resize.delta) * sx } : resize.axis === 'row' ? { top: (sum(sizes.heights, resize.index + 1) + resize.delta) * sy } : { left: resize.dx * sx, top: resize.dy * sy, width, height }} />}
    </div>
    {menu && menu.tableId === table.id && b && <div className="table-axis-menu" role="menu" aria-label={t('table.cellActions')} style={{ left: Math.max(84, Math.min(((app.view as HTMLElement).closest('.canvas-stage')?.clientWidth || 1000) - 224, menu.x)), top: Math.max(80, Math.min(((app.view as HTMLElement).closest('.canvas-stage')?.clientHeight || 700) - 390, menu.y)) }}>
      <header><strong>{t('table.cellActions')}</strong><label>{t('table.count')}<input aria-label={t('table.count')} type="number" min={1} max={20} value={batchCount} onChange={event => setBatchCount(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} /></label></header>
      {(['row', 'column'] as const).map(axis => ([false, true] as const).map(after => <button type="button" role="menuitem" className="menu-item" key={`${axis}-${after}`} onClick={() => run(() => { const at = axis === 'row' ? after ? b.maxRow + 1 : b.minRow : after ? b.maxColumn + 1 : b.minColumn; for (let index = 0; index < batchCount; index++) insertTableAxis(table, axis, at + index) })}>{t(axis === 'row' ? after ? 'table.insertBelow' : 'table.insertAbove' : after ? 'table.insertAfter' : 'table.insertBefore')}<span>{batchCount}</span></button>)) }
      <div className="menu-separator" />
      <button type="button" role="menuitem" className="menu-item" disabled={b.minRow === b.maxRow && b.minColumn === b.maxColumn} onClick={() => run(() => mergeTableCells(table, range!))}>{t('table.merge')}</button>
      <button type="button" role="menuitem" className="menu-item" onClick={() => run(() => splitTableCells(table, range!))}>{t('table.split')}</button>
      <button type="button" role="menuitem" className="menu-item is-danger" onClick={() => run(() => { for (let row = b.maxRow; row >= b.minRow; row--) deleteTableAxis(table, 'row', row) })}>{t('table.deleteRow')}</button>
      <button type="button" role="menuitem" className="menu-item is-danger" onClick={() => run(() => { for (let column = b.maxColumn; column >= b.minColumn; column--) deleteTableAxis(table, 'column', column) })}>{t('table.deleteColumn')}</button>
    </div>}
    {b && !editing && <div ref={toolbar} className="table-cell-toolbar" role="toolbar" aria-label={t('table.cellActions')} style={{ left: Math.max(88, Math.min(((app.view as HTMLElement).closest('.canvas-stage')?.clientWidth || 1000) - toolbarSize.width - 8, origin.x + sum(sizes.widths, b.minColumn) * sx)), top: origin.y > toolbarSize.height + 38 ? origin.y - toolbarSize.height - 38 : origin.y + height + 34 }} onPointerDown={event => { if (!(event.target as HTMLElement).closest('input,select')) event.preventDefault() }}>
      <TextAlignmentControl
        horizontal={(() => { const values = new Set(cellsInRange(table, range!).filter(cell => !cell.data?.coveredBy).flatMap(cell => { const text = labelOf(cell); return text ? readRich(text).map(p => horizontalAlign(p.align || text.textAlign)) : [] })); return values.size === 1 ? [...values][0] : undefined })()}
        vertical={(() => { const values = new Set(cellsInRange(table, range!).filter(cell => !cell.data?.coveredBy).map(cell => labelOf(cell)?.verticalAlign || 'top')); return values.size === 1 ? [...values][0] : undefined })()}
        onHorizontal={align => run(() => cellsInRange(table, range!).forEach(cell => { const text = labelOf(cell); if (text) { text.textAlign = align === 'justify' ? 'both' : align; text.data = { ...text.data, richText: { version: 1, value: readRich(text).map(p => ({ ...p, align })) } } } }))}
        onVertical={align => run(() => cellsInRange(table, range!).forEach(cell => { const text = labelOf(cell); if (text) text.verticalAlign = align }))}
      />
      <span className="toolbar-divider" />
      <span className="table-range-indicator">{b.maxRow - b.minRow + 1} × {b.maxColumn - b.minColumn + 1}</span>
      {(['bold', 'italic', 'underline', 'strikethrough', 'code'] as const).map(key => <button type="button" key={key} aria-pressed={cellsInRange(table, range!).filter(cell => !cell.data?.coveredBy).every(cell => { const text = labelOf(cell); return text && readRich(text).every(p => p.children.every(leaf => Boolean(leaf[key] ?? (key === 'bold' && Number(text.fontWeight || 400) >= 600)))) })} aria-label={t(`rich.${key}`)} title={t(`rich.${key}`)} onClick={() => format(key)}><span className={`rich-icon-${key}`}>{({ bold: 'B', italic: 'I', underline: 'U', strikethrough: 'S', code: '</>' })[key]}</span></button>)}
      <Dropdown label={t('rich.fontSize')} value={(() => { const sizes = new Set(cellsInRange(table, range!).filter(cell => !cell.data?.coveredBy).flatMap(cell => { const text = labelOf(cell); return text ? readRich(text).flatMap(p => p.children.map(leaf => leaf.fontSize || Number(text.fontSize || 14))) : [] })); return sizes.size === 1 ? [...sizes][0] : '' })()} onChange={value => format('fontSize', Number(value))} options={[12, 14, 16, 18, 20, 24, 28, 32].map(value => ({ value, label: String(value) }))} />
      <Popover label={t('style.fill')} icon={<BoardIcon name="fill" size={18} />} className="context-style-popover"><div className="context-color-grid">{['#ffffff', '#eaf1ff', '#dcefe4', '#fff1c4', '#f2e5fa', '#ffe5e3'].map(color => <button type="button" key={color} style={{ background: color }} aria-label={`${t('style.fill')} ${color}`} onClick={() => run(() => cellsInRange(table, range!).forEach(cell => { cell.fill = color }))} />)}</div></Popover>
      <Popover label={t('rich.color')} icon={<BoardIcon name="color" size={18} />} className="context-style-popover"><div className="context-color-grid">{['#1f2329', '#3370ff', '#25845b', '#d27d2c', '#9254de', '#e76560'].map(color => <button type="button" key={color} style={{ background: color }} aria-label={`${t('rich.color')} ${color}`} onClick={() => format('color', color)} />)}</div></Popover>
      <span className="toolbar-divider" />
      <button type="button" aria-label={t('table.editCell')} title={t('table.editCell')} onClick={() => editCell(table, range!.focus)}><BoardIcon name="text" size={18} /></button>
      <button type="button" disabled={b.minRow === b.maxRow && b.minColumn === b.maxColumn} aria-label={t('table.merge')} title={t('table.merge')} onClick={() => run(() => mergeTableCells(table, range!))}>⊞</button>
      <button type="button" aria-label={t('table.split')} title={t('table.split')} onClick={() => run(() => splitTableCells(table, range!))}>⊟</button>
      <Popover label={t('table.cellActions')} icon={<BoardIcon name="dots" size={18} />} className="table-actions-popover">
        <button type="button" className="menu-item" onClick={() => run(() => insertTableAxis(table, 'row', b.minRow))}>{t('table.insertAbove')}</button>
        <button type="button" className="menu-item" onClick={() => run(() => insertTableAxis(table, 'row', b.maxRow + 1))}>{t('table.insertBelow')}</button>
        <button type="button" className="menu-item" onClick={() => run(() => insertTableAxis(table, 'column', b.minColumn))}>{t('table.insertBefore')}</button>
        <button type="button" className="menu-item" onClick={() => run(() => insertTableAxis(table, 'column', b.maxColumn + 1))}>{t('table.insertAfter')}</button>
        <div className="menu-separator" />
        <button type="button" className="menu-item" onClick={() => run(() => clearTableCells(cellsInRange(table, range!)))}>{t('table.clearCells')}</button>
        <button type="button" className="menu-item is-danger" onClick={() => run(() => { for (let r = b.maxRow; r >= b.minRow; r--) deleteTableAxis(table, 'row', r) })}>{t('table.deleteRow')}</button>
        <button type="button" className="menu-item is-danger" onClick={() => run(() => { for (let c = b.maxColumn; c >= b.minColumn; c--) deleteTableAxis(table, 'column', c) })}>{t('table.deleteColumn')}</button>
      </Popover>
    </div>}
  </div>
}
