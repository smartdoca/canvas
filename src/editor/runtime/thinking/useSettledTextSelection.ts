import { useEffect, useState } from 'react'
import { Transforms, type BaseEditor } from 'slate'
import { ReactEditor } from 'slate-react'

/** A selection toolbar must never cover text while a range is still being made. */
export function useSettledTextSelection(editor: BaseEditor & ReactEditor) {
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    let pointer = false, frame = 0, syncRequested = false
    const keys = new Set<string>()
    const inside = (target: EventTarget | null) => { try { return target instanceof Node && ReactEditor.toDOMNode(editor, editor).contains(target) } catch { return false } }
    const finish = (sync = false) => {
      syncRequested ||= sync
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (pointer || keys.size || ReactEditor.isComposing(editor)) return
        // Only settle explicit range gestures. Re-selecting on every caret or
        // IME selectionchange can overwrite Slate's newly committed input range.
        if (syncRequested) {
          syncRequested = false
          const selection = window.getSelection()
          if (selection && !selection.isCollapsed && selection.anchorNode && ReactEditor.hasDOMNode(editor, selection.anchorNode, { editable: true })) {
            const range = ReactEditor.toSlateRange(editor, selection, { exactMatch: false, suppressThrow: true })
            if (range) Transforms.select(editor, range)
          }
        }
        setSettled(true)
      })
    }
    const down = (event: PointerEvent) => { if (event.button === 0 && inside(event.target)) { pointer = true; cancelAnimationFrame(frame); setSettled(false) } }
    const move = (event: PointerEvent) => { if (event.target instanceof Element && event.target.closest('.slate-format-toolbar,.slate-row-controls')) return; if (event.buttons & 1 && ReactEditor.isFocused(editor)) { pointer = true; cancelAnimationFrame(frame); setSettled(false) } }
    const up = () => { if (pointer) { pointer = false; finish(true) } }
    const keydown = (event: KeyboardEvent) => {
      if (!inside(event.target) || event.isComposing) return
      const selecting = (event.shiftKey && /^(Arrow|Home|End|Page)/.test(event.key)) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a')
      if (selecting) { keys.add(event.key); cancelAnimationFrame(frame); setSettled(false) }
    }
    const keyup = (event: KeyboardEvent) => { if (['Shift', 'Control', 'Meta'].includes(event.key) && keys.size) { keys.clear(); finish(true) } else if (keys.delete(event.key)) finish(true) }
    const changed = () => { if (!pointer && !keys.size && !ReactEditor.isComposing(editor)) finish() }
    const composing = () => { syncRequested = false; cancelAnimationFrame(frame); setSettled(false) }
    const composed = () => finish()
    const cancel = () => { pointer = false; syncRequested = false; keys.clear(); cancelAnimationFrame(frame); setSettled(false) }
    document.addEventListener('selectionchange', changed); document.addEventListener('pointermove', move, true); document.addEventListener('dragend', up, true); document.addEventListener('pointerdown', down, true); document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', cancel, true)
    document.addEventListener('keydown', keydown, true); document.addEventListener('keyup', keyup, true); window.addEventListener('blur', cancel)
    document.addEventListener('compositionstart', composing, true); document.addEventListener('compositionend', composed)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('selectionchange', changed); document.removeEventListener('pointermove', move, true); document.removeEventListener('dragend', up, true); document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', cancel, true)
      document.removeEventListener('keydown', keydown, true); document.removeEventListener('keyup', keyup, true); window.removeEventListener('blur', cancel)
      document.removeEventListener('compositionstart', composing, true); document.removeEventListener('compositionend', composed)
    }
  }, [editor])
  return settled
}
