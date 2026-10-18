import { useRichInline, insertInline } from './useRichInline'
import { InlineElement } from './InlineElement'
import { RichRowControls } from './RichRowControls'
import { RichParagraphBlock } from './RichParagraphBlock'
import { RichTextIcon } from './RichTextIcon'
import { useSettledTextSelection } from './useSettledTextSelection'
import { Dropdown } from '../../ui/Dropdown'
import { useResourceUploads } from './useResourceUploads'
import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type CSSProperties } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { createEditor, Editor, Node, Range, Text as SlateText, Transforms, type Descendant, type BaseEditor, type RangeRef } from 'slate'
import { withHistory, HistoryEditor } from 'slate-history'
import { Editable, Slate, ReactEditor, withReact, type RenderLeafProps } from 'slate-react'
import { TextEditor } from '@leafer-in/text-editor'
import { registerInnerEditor } from '@leafer-in/editor'
import { PointerEvent, type Group, type Text } from 'leafer-ui'
import { translate } from '../../../i18n/translate'
import type { MessageKey } from '../../../i18n/en'
import type { Json } from '../../../model'
import { ancestor, kind, labelOf } from './scene'
import { TABLE_CLIPBOARD, pasteTableFragment, tableFragmentFromHtml, fitTableContent, insertTableAxis, pasteTableText, tableCells, visibleCell } from './table'
import { getRichExtensions, resourceRuntime, slateLabel } from './slateRuntime'
import { cleanRichValue, hasRichFormatting, headingScale, horizontalAlign, plainText, readRich, rebaseRich, richFromHtml, richLayout, safeLink, childText, type RichLeaf, type RichValue } from './richText'
import { indentRichBlock, removeRichLink, richLinkRange, setRichLink, withCanvasMarkdown } from './richCommands'
import { TextAlignmentControl } from './TextAlignmentControl'
import { ResourceBlock, UploadTasks } from './resources'
import type { ResourceRuntime } from './slateRuntime'
import type { CanvasResource } from '../../../sdk/types'
import { richContainer, richScroll, setRichScroll } from './richBounds'
import { fitNoteContent, prepareNoteLayout } from './noteLayout'

type SlateEditor = BaseEditor & ReactEditor & HistoryEditor
const pointAt = (editor: SlateEditor, offset: number) => {
  for (let index = 0; index < editor.children.length; index++) {
    const block = editor.children[index] as unknown as RichValue[number]
    if (block.resource || block.custom) { if (offset <= 1) return Editor.start(editor, [index]); offset -= 2; continue }
    for (let child = 0; child < block.children.length; child++) {
      const node = block.children[child], length = childText(node).length
      if ('inline' in node) {
        if (offset === 0 && child > 0) return Editor.end(editor, [index, child - 1])
        if (offset <= 1 && child + 1 < block.children.length) return Editor.start(editor, [index, child + 1])
      } else if (offset <= length) return { path: [index, child], offset: Math.max(0, offset) }
      offset -= length
    }
    offset--
  }
  return Editor.end(editor, [])
}

/** Native inner-editor lifecycle with the Slate selection/mark pattern used in slatetsx. */
class CanvasSlateEditor extends TextEditor {
  override get tag() { return 'CanvasSlateEditor' }
  private root?: Root
  private mount?: HTMLDivElement
  private slate?: SlateEditor
  private projecting = false
  private composing = false
  private compositionGeneration = 0
  private loadedText = ''
  private hasLocalEdit = false
  private locale: 'en' | 'zh' = 'zh'
  private t = (key: MessageKey) => slateLabel(this.editor.app, key) ?? translate(this.locale, key)
  private outside?: (event: globalThis.PointerEvent) => void
  private scroll?: () => void
  private tools?: HTMLElement
  requestFlush?: () => void
  requestUndo?: () => void
  requestRedo?: () => void

  getPlainText = () => {
    if (this.composing && this.editDom) {
      const clone = this.editDom.cloneNode(true) as HTMLElement
      clone.querySelectorAll('[data-rich-inline]').forEach(node => node.replaceWith('\uFFFC'))
      clone.querySelectorAll('[contenteditable=false],[data-slate-placeholder]').forEach(node => node.remove())
      return [...clone.children].map(block => ((block as HTMLElement).dataset.resourceKind || (block as HTMLElement).dataset.richCustom) ? '\uFFFC' : block.textContent || '').join('\n').replaceAll('\uFEFF', '')
    }
    return this.slate ? plainText(this.slate.children) : String(this.editTarget.text || '')
  }
  getRichText = () => this.editTarget.data?.richText as Json | undefined
  getSelection = () => {
    const editor = this.slate
    if (!editor) return
    const dom = window.getSelection()
    const selection = dom?.anchorNode && ReactEditor.hasDOMNode(editor, dom.anchorNode, { editable: true }) ? ReactEditor.toSlateRange(editor, dom, { exactMatch: false, suppressThrow: true }) || editor.selection : editor.selection
    if (!selection || !Node.has(editor, selection.anchor.path) || !Node.has(editor, selection.focus.path)) return
    const offset = (point: { path: number[]; offset: number }) => {
      let result = 0
      for (let i = 0; i < point.path[0]; i++) result += plainText([editor.children[i]]).length + 1
      const block = editor.children[point.path[0]]
      for (const [index, child] of (block as unknown as RichValue[number]).children.entries()) { if (index === point.path[1]) break; result += childText(child).length }
      return result + point.offset
    }
    return { anchor: offset(selection.anchor), focus: offset(selection.focus) }
  }
  projectText = (text: string, selection?: { anchor: number; focus: number }) => {
    const editor = this.slate
    if (!editor) return
    const value = rebaseRich(readRich(this.editTarget as Text), text)
    if (JSON.stringify(cleanRichValue(editor.children)) === JSON.stringify(value)) return
    this.projecting = true
    const caret = selection || this.getSelection()
    HistoryEditor.withoutSaving(editor, () => Editor.withoutNormalizing(editor, () => {
      // Apply a projection through Slate operations so its DOM map remains valid.
      for (let index = editor.children.length - 1; index >= 0; index--) Transforms.removeNodes(editor, { at: [index] })
      Transforms.insertNodes(editor, value as Descendant[], { at: [0] })
      if (caret) Transforms.select(editor, { anchor: pointAt(editor, caret.anchor), focus: pointAt(editor, caret.focus) })
    }))
    queueMicrotask(() => { this.projecting = false })
  }

  /** Keep the first text click/drag in a canvas cell on Slate's own caret model. */
  placeCaretAtClient = (client: { clientX: number; clientY: number }, extend = false) => {
    const editor = this.slate
    if (!editor || !this.editDom) return
    const range = document.caretRangeFromPoint?.(client.clientX, client.clientY)
    const fallback = (document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: globalThis.Node; offset: number } | null }).caretPositionFromPoint?.(client.clientX, client.clientY)
    const node = range?.startContainer || fallback?.offsetNode, offset = range?.startOffset ?? fallback?.offset
    if (!node || offset === undefined || !this.editDom.contains(node)) { Transforms.select(editor, Editor.end(editor, [])); ReactEditor.focus(editor); return }
    const point = ReactEditor.toSlatePoint(editor, [node, offset], { exactMatch: false, suppressThrow: true })
    if (point) { Transforms.select(editor, extend && editor.selection ? { anchor: editor.selection.anchor, focus: point } : point); ReactEditor.focus(editor) }
  }
  selectResource = (id: string) => {
    if (!this.slate) return
    const index = this.slate.children.findIndex(node => (node as RichValue[number]).resource?.id === id)
    if (index >= 0) Transforms.select(this.slate, [index])
  }
  insertCustom = (type: string, data?: Json) => {
    const extension = getRichExtensions(this.editor.app).find(item => item.type === type)
    if (!this.slate || !extension || !resourceRuntime(this.editor.app)?.canEdit()) return false
    if (extension.inline) { insertInline(this.slate, extension, data); ReactEditor.focus(this.slate); return true }
    const custom = { ...extension.create(data), type, id: crypto.randomUUID() }
    Transforms.insertNodes(this.slate, [{ type: 'paragraph', custom, children: [{ text: '' }] }, { type: 'paragraph', children: [{ text: '' }] }] as unknown as Descendant[], { select: true })
    ReactEditor.focus(this.slate); return true
  }
  override onLoad() {
    const text = this.editTarget as Text, app = this.editor.app
    prepareNoteLayout(text)
    const table = ancestor(text, 'table') as Group | undefined
    if (table) fitTableContent(table)
    this.loadedText = String(text.text || ''); this.hasLocalEdit = false
    this._keyEvent = app.config.keyEvent !== false; app.config.keyEvent = false
    this.inBody = false; this.isHTMLText = false; text.textEditing = true
    this.locale = (app.view as HTMLElement).closest('[data-aidcanvas]')?.getAttribute('lang') === 'en' ? 'en' : 'zh'
    const mount = this.mount = document.createElement('div'); mount.className = 'canvas-slate-mount'
    mount.dataset.textScope = ancestor(text, 'table-cell') ? 'cell' : 'element'
    ;(app.view as HTMLElement).append(mount)
    const editor = this.slate = withCanvasMarkdown(withHistory(withReact(createEditor())))
    const isInline = editor.isInline; editor.isInline = node => 'inline' in node || isInline(node)
    const isVoid = editor.isVoid; editor.isVoid = node => Boolean('inline' in node || (node as unknown as RichValue[number]).resource || (node as unknown as RichValue[number]).custom) || isVoid(node)
    const insertFragment = editor.insertFragment
    editor.insertFragment = fragment => insertFragment(cleanRichValue(fragment).map(p => p.resource ? { ...p, resource: { ...p.resource, id: crypto.randomUUID() } } : p.custom ? { ...p, custom: { ...p.custom, id: crypto.randomUUID() } } : { ...p, children: p.children.map(child => 'inline' in child ? { ...child, inline: { ...child.inline, id: crypto.randomUUID() } } : child) }) as Descendant[])
    const setFragmentData = editor.setFragmentData
    editor.setFragmentData = (data, origin) => {
      setFragmentData(data, origin)
      const fragment = cleanRichValue(editor.getFragment())
      data.setData('text/plain', fragment.map(p => p.resource ? p.resource.name || p.resource.path : p.custom ? p.custom.label : p.children.map(child => 'inline' in child ? child.inline.label : child.text).join('')).join('\n'))
    }
    const initial = readRich(text)
    this.root = createRoot(mount)
    flushSync(() => this.root!.render(<SlateSurface editor={editor} value={initial} baseSize={Number(text.fontSize || 16)} baseBold={Number(text.fontWeight || 400) >= 600} baseAlign={text.textAlign} t={this.t} runtime={resourceRuntime(app)} extensions={getRichExtensions(app)} elementId={text.id!} valid={() => Boolean(text.leafer && !text.destroyed && this.slate === editor)} onChange={() => {
      (app.view as HTMLElement).dispatchEvent(new Event('aidcanvas:text-selection', { bubbles: true }))
      if (this.projecting || !editor.operations.some(op => op.type !== 'set_selection')) return
      this.hasLocalEdit = true
      const value = cleanRichValue(editor.children), next = plainText(value)
      const data = { ...text.data }
      if (hasRichFormatting(value)) data.richText = { version: 1, value }
      else delete data.richText
      // data affects rendering but does not invalidate Leafer's text layout by itself.
      if (JSON.stringify(data) !== JSON.stringify(text.data || {})) text.data = data
      text.text = next
      fitNoteContent(text)
      const table = ancestor(text, 'table') as Group | undefined
      if (table) fitTableContent(table)
      if (editor.operations.some(op => (op.type === 'insert_node' || op.type === 'remove_node') && Boolean((op.node as unknown as { resource?: CanvasResource; inline?: unknown; custom?: unknown }).resource || (op.node as unknown as { inline?: unknown }).inline || (op.node as unknown as { custom?: unknown }).custom))) this.requestFlush?.()
    }} onPosition={() => this.onUpdate()} onDone={() => this.editor.closeInnerEditor()} onUndo={() => this.requestUndo ? this.requestUndo() : editor.undo()} onRedo={() => this.requestRedo ? this.requestRedo() : editor.redo()} onNavigate={direction => this.navigateCell(direction)} onPaste={event => this.pasteCells(event)} />))
    this.editDom = mount.querySelector<HTMLDivElement>('[data-slate-editor]')!
    this.composing = false
    this.editDom.addEventListener('compositionstart', () => {
      this.composing = true; this.compositionGeneration++
      // Slate owns the IME range. Re-selecting the transient candidate DOM here
      // can replace its composing range or move the next commit to the start.
    }, true)
    this.editDom.addEventListener('compositionend', () => { const generation = this.compositionGeneration; window.setTimeout(() => { if (this.slate === editor && generation === this.compositionGeneration) this.composing = false }, 0) })
    this.tools = mount.querySelector<HTMLElement>('.slate-format-toolbar')!
    this.editDom.style.position = 'fixed'; this.editDom.style.transformOrigin = 'left top'
    this.onUpdate()
    Transforms.select(editor, Editor.range(editor, [])); ReactEditor.focus(editor)
    this.editDom.scrollTop = richScroll(text) * this.textScale
    this.editDom.addEventListener('scroll', () => setRichScroll(text, this.editDom.scrollTop / this.textScale))
    this.outside = event => {
      if (mount.contains(event.target as globalThis.Node)) return
      // Toolbar commands intentionally keep the native editor alive.
      if ((event.target as HTMLElement).closest('.selection-actions,.table-cell-toolbar')) return
      this.editor.closeInnerEditor()
    }
    document.addEventListener('pointerdown', this.outside, true)
    this.scroll = () => this.onUpdate(); window.addEventListener('scroll', this.scroll, true)
    this.eventIds = [app.on_(PointerEvent.DOWN, () => { /* DOM outside handler owns completion. */ })]
  }

  override onUpdate() {
    if (!this.editDom) return
    super.onUpdate()
    // The native text editor assigns white-space:normal and flex layout. Slate
    // needs preserved spaces and normal block flow for its DOM offsets/caret.
    this.editDom.style.caretColor = caretColor(textBackground(this.editTarget))
    this.editDom.style.whiteSpace = 'pre-wrap'
    this.editDom.style.display = 'block'
    this.editDom.style.overflowWrap = 'anywhere'
    const text = this.editTarget as Text, layout = richLayout(text, true)
    const line = text.lineHeight, size = Number(text.fontSize || 16)
    this.editDom.style.lineHeight = String(typeof line === 'object' && line?.type === 'percent' ? line.value : typeof line === 'number' ? line / size : 1.5)
    if (richContainer(text)) {
      this.editDom.style.height = `${Number(text.height) * this.textScale}px`
      this.editDom.style.maxHeight = this.editDom.style.height
      const cell = Boolean(ancestor(text, 'table-cell'))
      this.editDom.style.overflowY = cell ? 'clip' : 'auto'; this.editDom.style.overflowX = cell ? 'clip' : 'hidden'
      this.editDom.style.overscrollBehavior = 'contain'
    }
    const spare = Math.max(0, Number(text.height) - (layout?.height || Number(text.fontSize || 16)))
    this.editDom.style.paddingTop = `${(text.verticalAlign === 'middle' ? spare / 2 : text.verticalAlign === 'bottom' ? spare : 0) * this.textScale}px`
    const box = this.editDom.getBoundingClientRect()
    if (this.tools) {
      let anchor = box
      try { if (this.slate?.selection && Range.isExpanded(this.slate.selection)) anchor = ReactEditor.toDOMRange(this.slate, this.slate.selection).getBoundingClientRect() } catch { /* Selection can move during projection. */ }
      this.tools.style.left = `${Math.max(8, Math.min(window.innerWidth - this.tools.offsetWidth - 8, anchor.left + anchor.width / 2 - this.tools.offsetWidth / 2))}px`
      const height = this.tools.offsetHeight
      const above = anchor.top > height + 12
      this.tools.dataset.placement = above ? 'above' : 'below'
      this.tools.style.top = `${above ? anchor.top - height - 10 : anchor.bottom + 10}px`
    }
    ;(this.editor.app.view as HTMLElement).dispatchEvent(new Event('aidcanvas:text-layout', { bubbles: true }))
  }

  private navigateCell(direction: number) {
    const cell = ancestor(this.editTarget, 'table-cell'), table = cell?.parent as Group | undefined
    if (!cell || kind(table) !== 'table') return false
    const columns = Number(table!.data!.columns), visible = tableCells(table!).filter(item => !item.data?.coveredBy).sort((a, b) => Number(a.data?.row) * columns + Number(a.data?.column) - Number(b.data?.row) * columns - Number(b.data?.column))
    const at = visible.indexOf(cell as never) + direction
    if (at < 0) return true
    if (at >= visible.length) { if (!insertTableAxis(table!, 'row', Number(table!.data!.rows))) return true; const next = visibleCell(table!, { row: Number(table!.data!.rows) - 1, column: 0 }); if (next) visible.push(next) }
    const next = visible[at], label = next && labelOf(next)
    if (!label) return true
    const editor = this.editor
    editor.closeInnerEditor(); editor.select(label)
    queueMicrotask(() => { if (label.leafer) editor.openInnerEditor(label, true) })
    return true
  }
  private pasteCells(event: ClipboardEvent<HTMLDivElement>) {
    const cell = ancestor(this.editTarget, 'table-cell'), table = cell?.parent as Group | undefined, content = event.clipboardData.getData('text/plain')
    if (!cell || kind(table) !== 'table') return
    const encoded = event.clipboardData.getData(TABLE_CLIPBOARD), html = event.clipboardData.getData('text/html')
    let fragment: unknown
    try { fragment = encoded ? JSON.parse(encoded) : html ? tableFragmentFromHtml(html) : undefined } catch { /* Fall back to plain TSV. */ }
    if (fragment && pasteTableFragment(table!, { row: Number(cell.data!.row), column: Number(cell.data!.column) }, fragment)) { event.preventDefault(); this.projectText(String(labelOf(cell)?.text || '')); return }
    if (!content.includes('\t')) return
    event.preventDefault()
    if (!pasteTableText(table!, { row: Number(cell.data!.row), column: Number(cell.data!.column) }, content)) return
    this.projectText(String(labelOf(cell)?.text || ''))
  }
  override onUnload() {
    const text = this.editTarget as Text
    text.text = this.getPlainText(); text.set({ textEditing: undefined } as never)
    if (this.hasLocalEdit || String(text.text || '') !== this.loadedText) {
      const table = ancestor(text, 'table') as Group | undefined
      if (table) fitTableContent(table)
    }
    if (this.editor.app) this.editor.app.config.keyEvent = this._keyEvent
    if (this.outside) document.removeEventListener('pointerdown', this.outside, true)
    if (this.scroll) window.removeEventListener('scroll', this.scroll, true)
    this.editor.app.off_(this.eventIds)
    const root = this.root, mount = this.mount
    const editor = this.editor, container = ancestor(text, 'mind-node') || ancestor(text, 'diagram-node') || ancestor(text, 'note') || ancestor(text, 'card') || ancestor(text, 'connector-label')
    const canvas = mount?.closest<HTMLElement>('.canvas-app'), wasFocused = mount?.contains(document.activeElement)
    queueMicrotask(() => {
      root?.unmount(); mount?.remove()
      // Leave text mode on the semantic element. Otherwise Leafer keeps the
      // label's parent group open and the next drag can move only its text.
      if (container?.leafer && !editor.innerEditing && editor.list.length === 1 && editor.list[0] === text) editor.select(container)
      if (wasFocused && document.activeElement === document.body) canvas?.focus({ preventScroll: true })
    })
    this.root = undefined; this.slate = undefined; this.mount = undefined; this.tools = undefined
    this.requestFlush = undefined; this.requestUndo = undefined; this.requestRedo = undefined
  }
}
registerInnerEditor()(CanvasSlateEditor)

export function SlateSurface({ editor, value, baseSize, baseBold = false, baseAlign = 'left', t, onChange, onPosition, onDone, onUndo, onRedo, onNavigate, onPaste, runtime, extensions, elementId, valid }: { runtime?: ResourceRuntime; extensions: import('../../../sdk/types').CanvasRichTextExtension[]; elementId: string; valid: () => boolean; editor: SlateEditor; value: RichValue; baseSize: number; baseBold?: boolean; baseAlign?: string; t: (key: MessageKey) => string; onChange: () => void; onPosition: () => void; onDone: () => void; onUndo: () => void; onRedo: () => void; onNavigate: (direction: number) => boolean; onPaste: (event: ClipboardEvent<HTMLDivElement>) => void }) {
  const settledSelection = useSettledTextSelection(editor)
  const input = useRef<HTMLInputElement>(null)
  const picker = useRef<{ kind: 'image' | 'attachment'; selection: RangeRef }>()
  useEffect(() => {
    const fileInput = input.current
    const cancel = () => { picker.current?.selection.unref(); picker.current = undefined; ReactEditor.focus(editor) }
    fileInput?.addEventListener('cancel', cancel)
    return () => { fileInput?.removeEventListener('cancel', cancel); picker.current?.selection.unref() }
  }, [editor])
  const uploads = useResourceUploads(runtime, () => {
    const selection: RangeRef | undefined = editor.selection ? Editor.rangeRef(editor, editor.selection, { affinity: 'forward' }) : undefined
    return { valid: () => valid() && Boolean(selection?.current), dispose: () => { selection?.unref() }, insert: resource => {
      if (!selection?.current) return
      const current = editor.selection && Editor.rangeRef(editor, editor.selection)
      const same = editor.selection && Range.equals(editor.selection, selection.current)
      Transforms.select(editor, selection.current)
      Editor.withoutNormalizing(editor, () => {
        const at = [selection.current!.anchor.path[0]], row = editor.children[at[0]] as RichValue[number]
        if (!row.resource && !row.custom && !Node.string(row).trim() && selection.current!.anchor.path[0] === selection.current!.focus.path[0]) {
          // Keep this empty row as the following typing slot. Its live ranges
          // also preserve the order and position of a multi-file upload batch.
          if (Node.string(row)) Transforms.delete(editor, { at: Editor.range(editor, at) })
          Transforms.unsetNodes(editor, ['block', 'level', 'indent', 'checked', 'listOrder'], { at })
          Transforms.insertNodes(editor, { type: 'paragraph', ...(row.align ? { align: row.align } : {}), resource, children: [{ text: '' }] } as unknown as Descendant, { at })
          Transforms.select(editor, Editor.start(editor, [at[0] + 1]))
        } else Transforms.insertNodes(editor, [{ type: 'paragraph', resource, children: [{ text: '' }] }, { type: 'paragraph', children: [{ text: '' }] }] as unknown as Descendant[], { select: true })
      })
      if (!same && current?.current) Transforms.select(editor, current.current)
      current?.unref(); ReactEditor.focus(editor)
    } }
  })
  const [revision, refresh] = useState(0), [link, setLink] = useState<{ url: string; label: string }>(), [invalidLink, setInvalidLink] = useState(false), linkSelection = useRef<Range>()
  const inline = useRichInline(editor, extensions, runtime, valid, revision)
  const [palette, setPalette] = useState<'color' | 'backgroundColor'>()
  const paletteRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const popup = paletteRef.current
    if (!popup) return
    const place = () => { popup.style.marginLeft = '0px'; const box = popup.getBoundingClientRect(); popup.style.marginLeft = `${Math.max(8 - box.left, Math.min(0, window.innerWidth - 8 - box.right))}px` }
    place(); window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [palette])
  useEffect(() => {
    const close = (event: globalThis.PointerEvent) => { if (!(event.target instanceof Element) || !event.target.closest('.slate-format-toolbar')) { setPalette(undefined); setLink(undefined) } }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && palette) { event.preventDefault(); event.stopPropagation(); setPalette(undefined) } }
    document.addEventListener('pointerdown', close, true); document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('pointerdown', close, true); document.removeEventListener('keydown', key, true) }
  }, [palette])
  useLayoutEffect(() => {
    onPosition()
    if (!editor.selection || !Range.isCollapsed(editor.selection) || !ReactEditor.isFocused(editor)) return
    const row = editor.children[editor.selection.anchor.path[0]] as RichValue[number] | undefined
    if (row?.resource || row?.custom) return
    try {
      const viewport = ReactEditor.toDOMNode(editor, editor)
      if (viewport.style.overflowY === 'clip') return
      if (viewport.scrollHeight <= viewport.clientHeight) return
      const box = viewport.getBoundingClientRect(), caret = ReactEditor.toDOMRange(editor, editor.selection).getBoundingClientRect()
      if (!caret.height) return
      if (caret.bottom > box.bottom) viewport.scrollTop += caret.bottom - box.bottom
      else if (caret.top < box.top) viewport.scrollTop -= box.top - caret.top
    } catch { /* A remote update can remove the selected row before its DOM settles. */ }
  }, [editor, onPosition, revision, link, settledSelection])
  const syncSelection = () => {
    const native = window.getSelection()
    if (native?.anchorNode && ReactEditor.hasDOMNode(editor, native.anchorNode, { editable: true })) {
      const next = ReactEditor.toSlateRange(editor, native, { exactMatch: false, suppressThrow: true })
      if (next) Transforms.select(editor, next)
    }
  }
  const openLink = () => { syncSelection(); if (!editor.selection) return; setPalette(undefined); linkSelection.current = richLinkRange(editor); setInvalidLink(false); setLink({ url: (Editor.marks(editor) as RichLeaf | null)?.url || '', label: Editor.string(editor, linkSelection.current!) }) }
  const applyLink = (remove = false) => {
    if (linkSelection.current) Transforms.select(editor, linkSelection.current)
    if (remove) removeRichLink(editor)
    else if (!link || !setRichLink(editor, link.url, link.label)) { setInvalidLink(true); return }
    setLink(undefined); ReactEditor.blur(editor); ReactEditor.focus(editor)
  }
  const mark = (key: keyof Omit<RichLeaf, 'text'>, value: string | number | boolean = true) => {
    // Native arrow/mouse selection can lead Slate's deferred selectionchange.
    const selection = window.getSelection()
    if (selection?.anchorNode && ReactEditor.hasDOMNode(editor, selection.anchorNode, { editable: true })) {
      const range = ReactEditor.toSlateRange(editor, selection, { exactMatch: false, suppressThrow: true })
      if (range) Transforms.select(editor, range)
    }
    if (typeof value === 'boolean' && (Editor.marks(editor)?.[key as keyof ReturnType<typeof Editor.marks>] ?? (key === 'bold' && baseBold)) === value) { if (key === 'bold' && baseBold) Editor.addMark(editor, key, false); else Editor.removeMark(editor, key) }
    else Editor.addMark(editor, key, value)
    setPalette(undefined); ReactEditor.focus(editor); refresh(x => x + 1)
  }
  const marks = Editor.marks(editor) as RichLeaf | null
  return <Slate editor={editor} initialValue={value as Descendant[]} onChange={() => { onChange(); refresh(x => x + 1) }}>
    <div className="slate-format-toolbar" hidden={!link && (!settledSelection || !editor.selection || Range.isCollapsed(editor.selection))} role="toolbar" aria-label={t('rich.formatting')} onPointerDown={event => { if (!(event.target as HTMLElement).closest('input')) event.preventDefault() }}>
      {(['bold', 'italic', 'underline', 'strikethrough', 'code'] as const).map(key => <button type="button" key={key} title={t(`rich.${key}`)} aria-label={t(`rich.${key}`)} aria-pressed={Boolean(marks?.[key] ?? (key === 'bold' && baseBold))} onClick={() => mark(key)}><RichTextIcon name={key === 'code' ? 'code-xml' : key} /></button>)}
      <span className="rich-toolbar-separator" />
      <button type="button" aria-label={t('rich.link')} title={t('rich.link')} aria-pressed={Boolean(marks?.url) || Boolean(link)} onClick={openLink}><RichTextIcon name="link" /></button>
      <div className="rich-font-picker"><Dropdown label={t('rich.fontSize')} value={marks?.fontSize || baseSize} onChange={value => mark('fontSize', Number(value))} options={[12, 14, 16, 18, 20, 24, 28, 32].map(value => ({ value, label: String(value) }))} /></div>
      {(['color', 'backgroundColor'] as const).map(key => <div className="rich-mark-dropdown" key={key}>
        <button type="button" className="rich-mark-color-button" aria-label={t(key === 'color' ? 'rich.color' : 'rich.highlight')} title={t(key === 'color' ? 'rich.color' : 'rich.highlight')} aria-expanded={palette === key} style={{ '--mark-color': marks?.[key] || (key === 'color' ? '#1f2329' : '#fff1b8') } as CSSProperties} onClick={() => { setLink(undefined); setPalette(palette === key ? undefined : key) }}><RichTextIcon name={key === 'color' ? 'palette' : 'highlighter'} /></button>
        {palette === key && <div ref={paletteRef} className="rich-mark-popover rich-mark-color-popover" role="group" aria-label={t(key === 'color' ? 'rich.color' : 'rich.highlight')}>
          <button type="button" className="rich-mark-clear" onClick={() => { syncSelection(); Editor.removeMark(editor, key); setPalette(undefined); ReactEditor.focus(editor); refresh(x => x + 1) }}>{t(key === 'color' ? 'rich.defaultColor' : 'rich.clearHighlight')}</button>
          <div>{(key === 'color' ? ['#1f2329', '#646a73', '#3370ff', '#245bdb', '#13a870', '#d97706', '#e5484d', '#8b5cf6'] : ['#fff1b8', '#dbeafe', '#dcfce7', '#fce7f3', '#f3e8ff', '#fee2e2', '#ffedd5', '#e5e7eb']).map(color => <button type="button" key={color} aria-label={color} title={color} aria-pressed={marks?.[key] === color} style={{ background: color }} onClick={() => mark(key, color)} />)}</div>
          <label className="rich-custom-color">{t('rich.customColor')}<input type="color" aria-label={t('rich.customColor')} value={marks?.[key] || (key === 'color' ? '#1f2329' : '#fff1b8')} onChange={event => mark(key, event.target.value)} /></label>
        </div>}
      </div>)}
      <span className="rich-toolbar-separator" />
      <TextAlignmentControl translate={t} horizontal={horizontalAlign(editor.selection ? (editor.children[editor.selection.anchor.path[0]] as RichValue[number])?.align || baseAlign : baseAlign)} onHorizontal={align => { syncSelection(); Transforms.setNodes(editor, { align } as never, { match: node => !SlateText.isText(node) && !Editor.isEditor(node) }); ReactEditor.focus(editor) }} />
      <button type="button" aria-label={t('rich.clearFormat')} title={t('rich.clearFormat')} onClick={() => { syncSelection(); Transforms.unsetNodes(editor, ['bold', 'italic', 'underline', 'strikethrough', 'code', 'color', 'backgroundColor', 'fontSize'], { match: SlateText.isText, split: true }); setPalette(undefined); ReactEditor.focus(editor) }}><RichTextIcon name="eraser" /></button>
      {link && <form className="rich-link-form" aria-label={t('rich.link')} onSubmit={event => { event.preventDefault(); applyLink() }} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }} onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); event.stopPropagation(); uploads.add([...event.dataTransfer.files]) } }} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); setLink(undefined); ReactEditor.focus(editor) } }}>
        <label>{t('rich.linkLabel')}<input aria-label={t('rich.linkLabel')} value={link.label} onChange={event => setLink({ ...link, label: event.target.value })} /></label>
        <label>{t('rich.linkUrl')}<input autoFocus aria-label={t('rich.linkUrl')} placeholder="https://" value={link.url} aria-invalid={invalidLink} onChange={event => { setInvalidLink(false); setLink({ ...link, url: event.target.value }) }} /></label>
        <div><button type="submit" aria-label={t('rich.applyLink')}><RichTextIcon name="check" /></button><button type="button" aria-label={t('rich.removeLink')} onClick={() => applyLink(true)}><RichTextIcon name="x" /></button></div>
      </form>}
    </div>
    <RichRowControls baseAlign={baseAlign} extensions={extensions} runtime={runtime} t={t} onUpload={(kind, row) => {
      if (!runtime?.canEdit() || !runtime.canUpload(kind) || !input.current) return
      picker.current?.selection.unref()
      const range = Editor.range(editor, ReactEditor.findPath(editor, row))
      picker.current = { kind, selection: Editor.rangeRef(editor, range, { affinity: 'forward' }) }
      input.current.accept = kind === 'image' ? 'image/png,image/jpeg,image/webp,image/svg+xml' : '*/*'
      input.current.click()
    }} />
    <input ref={input} className="rich-upload-input" type="file" hidden multiple aria-label={t('resource.file')} onChange={event => {
      const pending = picker.current; picker.current = undefined
      if (pending?.selection.current) { Transforms.select(editor, pending.selection.current); uploads.add([...event.target.files || []], pending.kind) }
      pending?.selection.unref(); event.target.value = ''; ReactEditor.focus(editor)
    }} />
    <UploadTasks uploads={uploads} t={t} />
    {inline.menu}
    <Editable className="leafer-text-editor canvas-slate-editable" aria-label={t('rich.edit')} spellCheck={false} scrollSelectionIntoView={() => {
      // Canvas navigation belongs to Leafer. Slate's document scrolling can
      // scroll overflow-hidden stage ancestors and displace every DOM overlay.
      // The layout effect above handles the active editor's own scroll viewport.
    }} renderLeaf={({ attributes, children, leaf, text }: RenderLeafProps) => {
      const mark = leaf as RichLeaf, paragraph = editor.children[ReactEditor.findPath(editor, text)[0]] as RichValue[number]
      const content = mark.url ? <a href={safeLink(mark.url)} title={mark.url} onClick={event => { event.preventDefault(); if (event.metaKey || event.ctrlKey) window.open(safeLink(mark.url), '_blank', 'noopener,noreferrer') }}>{children}</a> : children
      return <span {...attributes} style={{ fontWeight: mark.bold === false ? 400 : mark.bold ? 700 : undefined, fontStyle: mark.italic ? 'italic' : undefined, textDecoration: [mark.underline || mark.url ? 'underline' : '', mark.strikethrough ? 'line-through' : ''].join(' '), color: mark.color || (mark.url ? '#3370ff' : undefined), backgroundColor: mark.backgroundColor, fontSize: mark.fontSize ? `${mark.fontSize / (baseSize * headingScale(paragraph))}em` : undefined, fontFamily: mark.code ? 'ui-monospace, monospace' : undefined }}>{content}</span>
    }} renderElement={({ attributes, children, element }) => {
      if ('inline' in element) return <InlineElement attributes={attributes} element={element} editor={editor} extensions={extensions} canEdit={() => valid() && Boolean(runtime?.canEdit())}>{children}</InlineElement>
      const p = element as RichValue[number]
      if (p.resource) return <ResourceBlock attributes={attributes} element={element} editor={editor} baseSize={baseSize} elementId={elementId} align={p.align || baseAlign} runtime={runtime} t={t}>{children}</ResourceBlock>
      if (p.custom) return <CustomBlock attributes={attributes} element={element} editor={editor} extensions={extensions} canEdit={() => valid() && Boolean(runtime?.canEdit())}>{children}</CustomBlock>
      return <RichParagraphBlock attributes={attributes} element={element} baseSize={baseSize} taskLabel={t('rich.block.task')} canEdit={() => valid() && runtime?.canEdit() !== false}>{children}</RichParagraphBlock>
    }} onPointerDown={event => event.stopPropagation()} onPaste={event => {
      syncSelection()
      const files = [...event.clipboardData.files]
      if (files.length) { event.preventDefault(); event.stopPropagation(); uploads.add(files); return }
      if (inline.onPaste(event)) return
      onPaste(event)
      if (event.defaultPrevented) return
      if (event.clipboardData.getData('application/x-slate-fragment')) { event.preventDefault(); try { ReactEditor.insertData(editor, event.clipboardData) } catch { Transforms.insertText(editor, event.clipboardData.getData('text/plain')) } return }
      const html = event.clipboardData.getData('text/html')
      if (html) { const value = richFromHtml(html); if (value.length) { event.preventDefault(); Transforms.insertFragment(editor, value as Descendant[]) } }
      else { const url = safeLink(event.clipboardData.getData('text/plain')); if (url) { event.preventDefault(); setRichLink(editor, url) } }
    }} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }} onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); event.stopPropagation(); uploads.add([...event.dataTransfer.files]) } }} onKeyDown={event => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) { event.stopPropagation(); return }
      event.stopPropagation()
      if (inline.onKeyDown(event)) return
      if (event.key === 'Escape') { event.preventDefault(); onDone(); return }
      if (event.key === 'Tab' && onNavigate(event.shiftKey ? -1 : 1)) { event.preventDefault(); return }
      if (event.key === 'Tab' && indentRichBlock(editor, event.shiftKey)) { event.preventDefault(); return }
      if ((event.key === 'Home' || event.key === 'End') && editor.selection) {
        event.preventDefault()
        const at = event.metaKey || event.ctrlKey ? [] : [editor.selection.focus.path[0]], point = event.key === 'Home' ? Editor.start(editor, at) : Editor.end(editor, at)
        Transforms.select(editor, event.shiftKey ? { anchor: editor.selection.anchor, focus: point } : point); return true
      }
      if (!(event.metaKey || event.ctrlKey)) return false
      const key = event.key.toLowerCase()
      if (key === 'a') { event.preventDefault(); Transforms.select(editor, Editor.range(editor, [])) }
      if (key === 'z') { event.preventDefault(); if (event.shiftKey) onRedo(); else onUndo() }
      if (key === 'k') { event.preventDefault(); openLink() }
      const style = ({ b: 'bold', i: 'italic', u: 'underline' } as const)[key as 'b']
      if (style) { event.preventDefault(); mark(style) }
      return event.defaultPrevented
    }} />
  </Slate>
}

function textBackground(text: import('leafer-ui').IUI): string {
  for (let item = text.parent; item; item = item.parent) if (typeof item.fill === 'string' && item.fill !== 'transparent') return item.fill
  return '#ffffff'
}
function caretColor(background: string) {
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return '#111827'
  context.fillStyle = background; context.fillRect(0, 0, 1, 1)
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data
  return (.2126 * r + .7152 * g + .0722 * b) < 155 ? '#ffffff' : '#111827'
}
function CustomBlock({ attributes, children, element, editor, extensions, canEdit }: import('slate-react').RenderElementProps & { editor: SlateEditor; extensions: import('../../../sdk/types').CanvasRichTextExtension[]; canEdit: () => boolean }) {
  const custom = (element as RichValue[number]).custom!, extension = extensions.find(item => item.type === custom.type)
  const path = ReactEditor.findPath(editor, element), selected = !!editor.selection && Range.includes(editor.selection, path)
  return <div {...attributes} data-rich-custom={custom.type} className={`rich-custom-block${selected ? ' is-selected' : ''}`}>
    <div contentEditable={false} onPointerDown={event => { if ((event.target as HTMLElement).closest('input,button,select,textarea')) return; event.preventDefault(); Transforms.select(editor, path); ReactEditor.focus(editor) }}>
      {extension ? extension.render({ element: custom, selected, onChange: (data, label) => { if (!canEdit()) return; Transforms.setNodes(editor, { custom: { ...custom, data, ...(label === undefined ? {} : { label }) } } as never, { at: ReactEditor.findPath(editor, element) }) } }) : custom.label}
    </div>{children}
  </div>
}
