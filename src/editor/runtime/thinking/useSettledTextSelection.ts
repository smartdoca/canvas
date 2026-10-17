import { useEffect, useState } from 'react'
import { Transforms, type BaseEditor } from 'slate'
import { ReactEditor } from 'slate-react'

/** A selection toolbar must never cover text while a range is still being made. */
export function useSettledTextSelection(editor: BaseEditor & ReactEditor) {
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    let pointer = false, frame = 0
    const keys = new Set<string>()
    const inside = (target: EventTarget | null) => { try { return target instanceof Node && ReactEditor.toDOMNode(editor, editor).contains(target) } catch { return false } }
    const finish = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (pointer || keys.size) return
        const selection = window.getSelection()
        if (selection?.anchorNode && ReactEditor.hasDOMNode(editor, selection.anchorNode, { editable: true })) {
          const range = ReactEditor.toSlateRange(editor, selection, { exactMatch: false, suppressThrow: true })
          if (range) Transforms.select(editor, range)
        }
        setSettled(true)
      })
    }
    const down = (event: PointerEvent) => { if (event.button === 0 && inside(event.target)) { pointer = true; cancelAnimationFrame(frame); setSettled(false) } }
    const move = (event: PointerEvent) => { if (event.target instanceof Element && event.target.closest('.slate-format-toolbar,.slate-row-controls')) return; if (event.buttons & 1 && ReactEditor.isFocused(editor)) { pointer = true; cancelAnimationFrame(frame); setSettled(false) } }
    const up = () => { if (pointer) { pointer = false; finish() } }
    const keydown = (event: KeyboardEvent) => {
      if (!inside(event.target) || event.isComposing) return
      const selecting = (event.shiftKey && /^(Arrow|Home|End|Page)/.test(event.key)) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a')
      if (selecting) { keys.add(event.key); cancelAnimationFrame(frame); setSettled(false) }
    }
    const keyup = (event: KeyboardEvent) => { if (['Shift', 'Control', 'Meta'].includes(event.key) && keys.size) { keys.clear(); finish() } else if (keys.delete(event.key)) finish() }
    const changed = () => { if (!pointer && !keys.size) finish() }
    const cancel = () => { pointer = false; keys.clear(); cancelAnimationFrame(frame); setSettled(false) }
    document.addEventListener('selectionchange', changed); document.addEventListener('pointermove', move, true); document.addEventListener('dragend', up, true); document.addEventListener('pointerdown', down, true); document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', cancel, true)
    document.addEventListener('keydown', keydown, true); document.addEventListener('keyup', keyup, true); window.addEventListener('blur', cancel)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('selectionchange', changed); document.removeEventListener('pointermove', move, true); document.removeEventListener('dragend', up, true); document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', cancel, true)
      document.removeEventListener('keydown', keydown, true); document.removeEventListener('keyup', keyup, true); window.removeEventListener('blur', cancel)
    }
  }, [editor])
  return settled
}
