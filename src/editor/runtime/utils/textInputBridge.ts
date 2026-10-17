import type { App, IUI } from 'leafer-ui'
import { InnerEditorEvent } from '@leafer-in/editor'
import type { CanvasModel, CanvasTextSession, Json, TextSelection } from '../../../model'

type NativeTextEditor = { editDom?: HTMLDivElement; editTarget?: IUI & { text: string }; getPlainText?: () => string; getRichText?: () => Json | undefined; projectText?: (text: string, selection?: TextSelection) => void; getSelection?: () => TextSelection | undefined; requestFlush?: () => void; requestUndo?: () => void; requestRedo?: () => void }

/** Keep the native editor's displayed CRDT branch independent during IME composition. */
export function createTextInputBridge(app: App, getModel: () => CanvasModel | undefined, local: (fn: () => void) => void, standaloneFlush?: () => void) {
  let binding: CanvasTextSession | undefined, native: NativeTextEditor | undefined, composing = false, flushing = false
  const selection = (): TextSelection | undefined => {
    if (native?.getSelection) return native.getSelection()
    const dom = native?.editDom, s = window.getSelection()
    if (!dom || !s?.anchorNode || !s.focusNode || !dom.contains(s.anchorNode) || !dom.contains(s.focusNode)) return
    const offset = (node: Node, at: number) => { const r = document.createRange(); r.selectNodeContents(dom); r.setEnd(node, at); return r.toString().length }
    return { anchor: offset(s.anchorNode, s.anchorOffset), focus: offset(s.focusNode, s.focusOffset) }
  }
  const restoreSelection = (s: TextSelection) => {
    const dom = native?.editDom
    if (!dom || document.activeElement !== dom) return
    const point = (index: number): [Node, number] => {
      const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node) { if (index <= (node.textContent?.length || 0)) return [node, index]; index -= node.textContent?.length || 0; node = walker.nextNode() }
      return [dom, dom.childNodes.length]
    }
    window.getSelection()?.setBaseAndExtent(...point(s.anchor), ...point(s.focus))
  }
  const flush = () => {
    if (composing || !binding || !native?.editDom) return
    const model = getModel()
    if (model && !flushing) {
      flushing = true
      try {
        local(() => model.flush())
        // React can remove the model's view hook before the native editor unloads.
        // A second commit is a no-op during normal flushes and retains the last
        // draft when that hook is already gone during unmount.
        if (binding && native?.editDom) local(() => binding!.commit(native!.getPlainText?.() ?? native!.editDom!.innerText, native!.getRichText ? { richText: native!.getRichText() } : undefined))
      } finally { flushing = false }
      return
    }
    if (binding && native?.editDom) local(() => { binding!.commit(native!.getPlainText?.() ?? native!.editDom!.innerText, native!.getRichText ? { richText: native!.getRichText() } : undefined) })
  }
  const sync = () => {
    if (!binding || !native?.editDom || composing) return
    const result = binding.sync(selection())
    if (result.deleted) return
    if (native.projectText) native.projectText(result.text, result.selection)
    else if (native.editDom.innerText !== result.text) {
      native.editDom.innerText = result.text
      if (result.selection) restoreSelection(result.selection)
    }
    if (native.editTarget) native.editTarget.text = result.text
  }
  const startComposition = () => { composing = true }
  // Slate commits composition text in its delegated React handler, after the
  // native DOM event. Wait until that handler has run before reading its value.
  const endComposition = () => { const editor = native; window.setTimeout(() => { if (native === editor) { composing = false; flush(); sync() } }, 0) }
  const beforeClose = () => { composing = false; flush(); sync() }
  const close = () => {
    native?.editDom?.removeEventListener('compositionstart', startComposition)
    native?.editDom?.removeEventListener('compositionend', endComposition)
    native?.editDom?.removeEventListener('keydown', keydown, true)
    if (native && document.activeElement === document.body) {
      (app.view as HTMLElement).closest<HTMLElement>('.canvas-app')?.focus({ preventScroll: true })
    }
    binding?.dispose(); binding = undefined; native = undefined; composing = false
  }
  // Leafer's global Enter handler must not insert a newline when confirming an IME candidate.
  const keydown = (event: KeyboardEvent) => { if (composing || event.isComposing || event.keyCode === 229) event.stopPropagation() }
  const open = () => {
    close()
    const model = getModel()
    native = app.editor.innerEditor as unknown as NativeTextEditor
    // Enter editing with actual DOM focus, including standalone canvases.
    native?.editDom?.focus({ preventScroll: true })
    if (!native?.editDom || native.editTarget?.tag !== 'Text') return
    native.editDom.addEventListener('compositionstart', startComposition)
    native.editDom.addEventListener('compositionend', endComposition)
    native.editDom.addEventListener('keydown', keydown, true)
    native.requestFlush = model ? flush : standaloneFlush
    if (model) {
      model.flush() // New native text nodes acquire their stable ID before binding.
      binding = model.startTextSession(native.editTarget.id!)
      native.requestUndo = () => { model.undo() }
      native.requestRedo = () => { model.redo() }
    }
  }
  const ids = app.editor.on_([[InnerEditorEvent.OPEN, open], [InnerEditorEvent.BEFORE_CLOSE, beforeClose], [InnerEditorEvent.CLOSE, close]])
  return {
    flush, sync,
    get elementId() { return binding ? native?.editTarget?.id : undefined },
    get isComposing() { return composing },
    dispose() { beforeClose(); close(); app.editor.off_(ids) },
  }
}
