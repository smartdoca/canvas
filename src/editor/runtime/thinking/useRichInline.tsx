import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Editor, Range, Transforms, type BaseEditor, type Descendant, type RangeRef } from 'slate'
import { ReactEditor } from 'slate-react'
import type { CanvasRichTextExtension } from '../../../sdk/types'
import { cleanCustom } from './richText'
import type { ResourceRuntime } from './slateRuntime'
import type { MessageKey } from '../../../i18n/en'

type Choice = { id: string; label: string; data: import('../../../model').Json }
type Target = { extension: CanvasRichTextExtension; range: RangeRef; query: string; key: string }
type NativeEditor = BaseEditor & ReactEditor

export function insertInline(editor: NativeEditor, extension: CanvasRichTextExtension, data?: import('../../../model').Json) {
  const inline = cleanCustom({ ...extension.create(data), type: extension.type, id: crypto.randomUUID() })
  if (!inline) throw new Error('Invalid rich inline element')
  Transforms.insertNodes(editor, { type: 'inline', inline, children: [{ text: '' }] } as unknown as Descendant)
  Transforms.move(editor)
}

/** The native editor owns all live ranges; the host owns lookup and business data. */
export function useRichInline(editor: NativeEditor, extensions: CanvasRichTextExtension[], runtime: ResourceRuntime | undefined, valid: () => boolean, revision: number, t: (key: MessageKey) => string) {
  const [target, setTarget] = useState<Target>(), [choices, setChoices] = useState<Choice[]>([]), [index, setIndex] = useState(0)
  const [status, setStatus] = useState<'loading' | 'empty' | 'error'>('loading')
  const cache = useRef(new Map<CanvasRichTextExtension, Map<string, Choice[]>>())
  const [position, setPosition] = useState({ left: 0, top: 0 }), menu = useRef<HTMLDivElement>(null)
  const suppressed = useRef(''), pending = useRef(new Set<AbortController>())
  const active = useRef(true), canEdit = useRef<() => boolean>(() => false)
  canEdit.current = () => active.current && valid() && Boolean(runtime?.canEdit())
  useEffect(() => { active.current = true; const controllers = pending.current; return () => { active.current = false; controllers.forEach(c => c.abort()); controllers.clear() } }, [])
  useEffect(() => {
    const selection = editor.selection
    if (!canEdit.current() || !selection || !Range.isCollapsed(selection) || ReactEditor.isComposing(editor)) { setTarget(undefined); return }
    // A trigger cannot cross an atomic element or a differently formatted text run.
    const [leaf] = Editor.leaf(editor, selection.anchor)
    const before = leaf.text.slice(0, selection.anchor.offset).slice(-100)
    const key = JSON.stringify(selection) + before
    for (const extension of extensions) {
      const trigger = extension.inline && extension.suggestions?.trigger
      if (!trigger || trigger.length !== 1) continue
      const at = before.lastIndexOf(trigger), query = before.slice(at + 1)
      if (at < 0 || (at > 0 && /[\w@]/.test(before[at - 1])) || /[\s@]/.test(query) || query.length > 60) continue
      if (key === suppressed.current) { setTarget(undefined); return }
      const anchor = { ...selection.anchor, offset: selection.anchor.offset - query.length - 1 }
      setTarget(current => current?.key === key ? current : { extension, query, key, range: Editor.rangeRef(editor, { anchor, focus: selection.anchor }, { affinity: 'inward' }) })
      return
    }
    suppressed.current = ''; setTarget(undefined)
  }, [editor, extensions, revision])
  useEffect(() => () => { target?.range.unref() }, [target])
  useEffect(() => {
    setChoices([]); setIndex(0)
    if (!target) return
    const cached = cache.current.get(target.extension)?.get(target.query)
    if (cached) { setChoices(cached); setStatus('empty'); return }
    setStatus('loading')
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void Promise.resolve().then(() => target.extension.suggestions!.search(target.query, { signal: controller.signal })).then(items => {
        if (controller.signal.aborted || !canEdit.current() || !target.range.current) return
        const next = items.slice(0, 20), entries = cache.current.get(target.extension) || new Map<string, Choice[]>()
        if (entries.size >= 20) entries.delete(entries.keys().next().value!)
        entries.set(target.query, next); cache.current.set(target.extension, entries)
        setChoices(next); setStatus('empty')
      }).catch(error => { if (!controller.signal.aborted) { setStatus('error'); runtime?.error(error) } })
    }, target.query ? 80 : 0)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [target, runtime])
  const close = useCallback(() => { suppressed.current = target?.key || ''; setTarget(undefined) }, [target])
  useLayoutEffect(() => {
    if (!target) return
    const place = () => {
      try {
        if (!target.range.current) { close(); return }
        const rect = ReactEditor.toDOMRange(editor, target.range.current).getBoundingClientRect(), height = menu.current?.offsetHeight || 0
        setPosition({ left: Math.max(8, Math.min(rect.left, innerWidth - 288)), top: Math.max(8, rect.bottom + height + 8 < innerHeight ? rect.bottom + 6 : rect.top - height - 6) })
      } catch { close() }
    }
    place(); window.addEventListener('scroll', place, true); window.addEventListener('resize', place)
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place) }
  }, [target, choices, editor, close])
  const choose = (choice: Choice) => {
    const range = target?.range.current
    if (!target || !range || !canEdit.current()) return
    // A remote deletion/replacement invalidates the original trigger, even when its range survives.
    if (Editor.string(editor, range) !== target.extension.suggestions!.trigger + target.query) { close(); return }
    try {
      Transforms.select(editor, range); Transforms.delete(editor); insertInline(editor, target.extension, choice.data); editor.insertText(' ')
      ReactEditor.focus(editor); close()
    } catch (error) { runtime?.error(error) }
  }
  return {
    menu: target && <div ref={menu} className="rich-inline-suggestions" style={position} role="listbox" aria-label={target.extension.label} onPointerDown={event => event.preventDefault()}>
      {!choices.length && <div role="status">{t(status === 'loading' ? 'rich.suggestionsLoading' : status === 'error' ? 'rich.suggestionsError' : 'rich.suggestionsEmpty')}</div>}
      {choices.map((choice, i) => <button type="button" key={choice.id} role="option" aria-selected={i === index} onPointerMove={() => setIndex(i)} onClick={() => choose(choice)}>{choice.label}</button>)}
    </div>,
    onKeyDown: (event: KeyboardEvent) => {
      if (!target) return false
      if (event.key === 'Escape') { event.preventDefault(); close(); return true }
      if (event.ctrlKey || event.metaKey || event.altKey) return false
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setIndex(i => (i + (event.key === 'ArrowDown' ? 1 : -1) + Math.max(choices.length, 1)) % Math.max(choices.length, 1)); return true }
      if (event.key === 'Enter' || event.key === 'Tab') { if (!choices[index]) { close(); return false }; event.preventDefault(); choose(choices[index]); return true }
      return false
    },
    onPaste: (event: ClipboardEvent) => {
      if (!canEdit.current() || !editor.selection || event.clipboardData.getData('application/x-slate-fragment')) return false
      const text = event.clipboardData.getData('text/plain').trim()
      const extension = extensions.find(e => e.inline && e.paste && e.matchPaste?.(text))
      if (!extension) return false
      event.preventDefault()
      const range = Editor.rangeRef(editor, editor.selection, { affinity: 'inward' }), controller = new AbortController()
      pending.current.add(controller)
      void extension.paste!(text, { signal: controller.signal }).then(data => {
        if (controller.signal.aborted || !canEdit.current() || !range.current) return
        const current = editor.selection && Editor.rangeRef(editor, editor.selection), same = editor.selection && Range.equals(editor.selection, range.current)
        try {
          Transforms.select(editor, range.current)
          if (data === undefined) Transforms.insertText(editor, text)
          else insertInline(editor, extension, data)
          if (!same && current?.current) Transforms.select(editor, current.current)
        } finally { current?.unref() }
      }).catch(error => { if (!controller.signal.aborted) runtime?.error(error) }).finally(() => { range.unref(); pending.current.delete(controller) })
      return true
    },
  }
}
