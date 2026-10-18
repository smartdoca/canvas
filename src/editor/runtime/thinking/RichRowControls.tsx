import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Editor, Node as SlateNode, Transforms, type Descendant } from 'slate'
import { ReactEditor, useSlate } from 'slate-react'
import type { CanvasRichTextExtension } from '../../../sdk/types'
import type { MessageKey } from '../../../i18n/en'
import { RichTextIcon } from './RichTextIcon'
import { BoardIcon } from './BoardIcon'
import { horizontalAlign, type RichValue } from './richText'
import type { ResourceRuntime } from './slateRuntime'

/** A view-only gutter follows the hovered/active paragraph without entering Slate's DOM. */
export function RichRowControls({ baseAlign, extensions, runtime, t, onUpload }: { baseAlign: string; extensions: CanvasRichTextExtension[]; runtime?: ResourceRuntime; t: (key: MessageKey) => string; onUpload: (kind: 'image' | 'attachment', row: RichValue[number]) => void }) {
  const editor = useSlate() as ReturnType<typeof useSlate> & ReactEditor, root = useRef<HTMLDivElement>(null), menu = useRef<HTMLDivElement>(null), [open, setOpen] = useState(false)
  const [hover, setHover] = useState<RichValue[number]>(), [position, setPosition] = useState<{ x: number; y: number; menuX: number; menuY: number }>()
  const positionRef = useRef(position)
  const updatePosition = (next: typeof position) => {
    const previous = positionRef.current
    if (previous === next || previous && next && previous.x === next.x && previous.y === next.y && previous.menuX === next.menuX && previous.menuY === next.menuY) return
    positionRef.current = next
    setPosition(next)
  }
  const selected = editor.children[editor.selection?.focus.path[0] || 0] as RichValue[number]
  const row = hover && editor.children.includes(hover as Descendant) ? hover : open && hover ? undefined : selected
  const rowRef = useRef(row), openRef = useRef(open); rowRef.current = row; openRef.current = open
  const place = () => {
    const current = rowRef.current
    if (!current) { updatePosition(undefined); return }
    try {
      const dom = ReactEditor.toDOMNode(editor, current), viewport = ReactEditor.toDOMNode(editor, editor).getBoundingClientRect(), rect = dom.getBoundingClientRect()
      if (rect.bottom <= viewport.top || rect.top >= viewport.bottom) { updatePosition(undefined); return }
      const x = Math.max(8, rect.left - 35), y = Math.max(8, Math.min(window.innerHeight - 35, Math.max(viewport.top, rect.top) + Math.min(rect.height, 36) / 2 - 13.5))
      const menuX = Math.max(8, Math.min(window.innerWidth - 228, x > 236 ? x - 228 : x + 35)), menuY = Math.max(8, Math.min(y - 6, window.innerHeight - (menu.current?.offsetHeight || 240) - 8))
      // React 18 may keep processing layout-effect state updates even when
      // their updater returns the current value. Skip unchanged writes first.
      updatePosition({ x, y, menuX, menuY })
    } catch { updatePosition(undefined) }
  }
  useLayoutEffect(() => { if (!open) setHover(undefined) }, [editor.selection, open])
  useLayoutEffect(() => { if (open && !row) setOpen(false) }, [open, row])
  useLayoutEffect(place)
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (event.buttons || openRef.current || !(event.target instanceof HTMLElement)) return
      const dom = ReactEditor.toDOMNode(editor, editor), block = event.target.closest<HTMLElement>('[data-slate-node=element]')
      if (!block || block.parentElement !== dom) return
      try { setHover(ReactEditor.toSlateNode(editor, block) as RichValue[number]) } catch { /* The row can disappear during a remote edit. */ }
    }
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    const position = () => place()
    document.addEventListener('pointermove', move, true); document.addEventListener('pointerdown', close, true); document.addEventListener('aidcanvas:text-layout', position)
    window.addEventListener('scroll', position, true); window.addEventListener('resize', position); window.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointermove', move, true); document.removeEventListener('pointerdown', close, true); document.removeEventListener('aidcanvas:text-layout', position); window.removeEventListener('scroll', position, true); window.removeEventListener('resize', position); window.removeEventListener('keydown', key) }
    // Position reads current row through refs; subscriptions stay stable while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])
  if (!row || !position) return null
  const empty = !row.resource && !row.custom && !SlateNode.string(row).trim()
  const path = () => ReactEditor.findPath(editor, row)
  const choose = (value: string) => {
    const active = value.startsWith('heading-') ? row.block === 'heading' && (row.level || 1) === Number(value.slice(-1)) : row.block === value
    Editor.withoutNormalizing(editor, () => {
      Transforms.unsetNodes(editor, ['block', 'level', 'checked', 'listOrder'], { at: path() })
      if (value !== 'paragraph' && !active) Transforms.setNodes(editor, (value.startsWith('heading-') ? { block: 'heading', level: Number(value.slice(-1)) } : { block: value, ...(value === 'task' ? { checked: false } : {}) }) as never, { at: path() })
    })
    setOpen(false); ReactEditor.focus(editor)
  }
  return <div ref={root} className="slate-row-controls" style={{ left: position.x, top: position.y }} onPointerDown={event => event.preventDefault()}>
    <button type="button" className="rich-row-grip" aria-label={t(empty ? 'rich.insertContent' : 'rich.rowControls')} title={t(empty ? 'rich.insertContent' : 'rich.rowControls')} aria-expanded={open} onClick={() => { if (!open) setHover(row); setOpen(!open) }}><RichTextIcon name={empty ? 'plus' : 'grip-vertical'} size={17} /></button>
    {open && <div ref={menu} className="slate-row-menu slate-row-toolbar" role="dialog" aria-label={t('rich.rowControls')} style={{ left: position.menuX, top: position.menuY }}>
      {!row.resource && !row.custom && <>
        <div className="rich-menu-label">{t('rich.textProperties')}</div>
        <div className="rich-heading-grid" role="group" aria-label={t('rich.heading')}>
          {[1, 2, 3, 4, 5].map(level => <button type="button" key={level} title={`${t('rich.heading')} ${level}`} aria-label={`${t('rich.heading')} ${level}`} aria-pressed={row.block === 'heading' && (row.level || 1) === level} onClick={() => choose(`heading-${level}`)}>H{level}</button>)}
        </div>
        <div className="rich-quick-grid" role="group" aria-label={t('rich.rowStyle')}>
          {(['paragraph', 'bullet', 'number', 'task', 'quote'] as const).map((value, i) => <button type="button" key={value} title={t(value === 'paragraph' ? 'rich.paragraph' : `rich.block.${value}`)} aria-label={t(value === 'paragraph' ? 'rich.paragraph' : `rich.block.${value}`)} aria-pressed={(row.block || 'paragraph') === value} onClick={() => choose(value)}><RichTextIcon name={['pilcrow', 'list', 'list-ordered', 'square-check', 'quote'][i]} /></button>)}
        </div>
      </>}
      <div className="rich-menu-label rich-property-label">{t('alignment.label')}</div>
      <div className="rich-quick-grid rich-align-grid" role="group" aria-label={t('rich.horizontalAlign')}>
        {(['left', 'center', 'right', 'justify'] as const).map(align => <button type="button" key={align} title={t(`style.align.${align}`)} aria-label={t(`style.align.${align}`)} aria-pressed={horizontalAlign(row.align || baseAlign) === align} onClick={() => { Transforms.setNodes(editor, { align } as never, { at: path() }); setOpen(false); ReactEditor.focus(editor) }}><RichTextIcon name={`align-${align}`} /></button>)}
      </div>
      {empty && <><div className="rich-menu-rule" /><div className="rich-menu-label">{t('rich.insertContent')}</div>{(['image', 'attachment'] as const).map(kind => <button type="button" key={kind} disabled={!runtime?.canEdit() || !runtime.canUpload(kind)} onClick={() => { setOpen(false); onUpload(kind, row) }}><BoardIcon name={kind} size={17} />{t(`resource.${kind}`)}</button>)}</>}
      {extensions.length > 0 && <><div className="rich-menu-rule" /><div className="rich-menu-label">{t('rich.insertCustom')}</div>{extensions.filter(extension => !extension.inline).map(extension => <button type="button" key={extension.type} onClick={() => { if (!runtime?.canEdit()) return; Transforms.select(editor, Editor.end(editor, path())); Transforms.insertNodes(editor, [{ type: 'paragraph', custom: { ...extension.create(), type: extension.type, id: crypto.randomUUID() }, children: [{ text: '' }] }, { type: 'paragraph', children: [{ text: '' }] }] as unknown as Descendant[], { select: true }); setOpen(false); ReactEditor.focus(editor) }}><RichTextIcon name="plus" />{extension.label}</button>)}</>}
    </div>}
  </div>
}
