import type { App, IUI } from 'leafer-ui'
import { InnerEditorEvent } from '@leafer-in/editor'
import type { CanvasModel, CanvasTextSession, TextSelection } from '../../../model'

type NativeTextEditor = { editDom?: HTMLDivElement; editTarget?: IUI & { text: string } }

/** Keep the native editor's displayed CRDT branch independent during IME composition. */
export function createTextInputBridge(app: App, getModel: () => CanvasModel | undefined, local: (fn: () => void) => void) {
  let binding: CanvasTextSession | undefined, native: NativeTextEditor | undefined, composing = false
  const selection = (): TextSelection | undefined => {
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
    if (composing) return
    if (binding && native?.editDom) local(() => { binding!.commit(native!.editDom!.innerText) })
  }
  const sync = () => {
    if (!binding || !native?.editDom || composing) return
    const result = binding.sync(selection())
    if (result.deleted) return
    if (native.editDom.innerText !== result.text) {
      native.editDom.innerText = result.text
      if (result.selection) restoreSelection(result.selection)
    }
    if (native.editTarget) native.editTarget.text = result.text
  }
  const startComposition = () => { composing = true }
  const endComposition = () => { composing = false; flush(); sync() }
  const beforeClose = () => { composing = false; flush(); sync() }
  const close = () => {
    native?.editDom?.removeEventListener('compositionstart', startComposition)
    native?.editDom?.removeEventListener('compositionend', endComposition)
    native?.editDom?.removeEventListener('keydown', keydown, true)
    binding?.dispose(); binding = undefined; native = undefined; composing = false
  }
  // Leafer's global Enter handler must not insert a newline when confirming an IME candidate.
  const keydown = (event: KeyboardEvent) => { if (composing || event.isComposing || event.keyCode === 229) event.stopPropagation() }
  const open = () => {
    close()
    const model = getModel()
    native = app.editor.innerEditor as unknown as NativeTextEditor
    if (!model || !native?.editDom || native.editTarget?.tag !== 'Text') return
    model.flush() // New native text nodes acquire their stable ID before binding.
    binding = model.startTextSession(native.editTarget.id!)
    native.editDom.addEventListener('compositionstart', startComposition)
    native.editDom.addEventListener('compositionend', endComposition)
    native.editDom.addEventListener('keydown', keydown, true)
  }
  const ids = app.editor.on_([[InnerEditorEvent.OPEN, open], [InnerEditorEvent.BEFORE_CLOSE, beforeClose], [InnerEditorEvent.CLOSE, close]])
  return {
    flush, sync,
    get elementId() { return binding ? native?.editTarget?.id : undefined },
    get isComposing() { return composing },
    dispose() { beforeClose(); close(); app.editor.off_(ids) },
  }
}
