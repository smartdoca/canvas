import { TextEditor } from '@leafer-in/text-editor'
import { registerInnerEditor } from '@leafer-in/editor'
import { ancestor } from './scene'
import type { TextSelection } from '../../../model'

const domText = (node: Node): string => node.nodeType === Node.TEXT_NODE ? (node.textContent || '').replaceAll('\u200B', '') : node.nodeName === 'BR' ? '\n' : [...node.childNodes].map(domText).join('')

/** Native label editing keeps node selection and dragging outside the text editor. */
class CanvasPlainTextEditor extends TextEditor {
  override get tag() { return 'CanvasPlainTextEditor' }
  requestFlush?: () => void
  requestUndo?: () => void
  requestRedo?: () => void

  getPlainText = () => this.editDom.innerText.replaceAll('\u200B', '')
  getSelection = (): TextSelection | undefined => {
    const selection = window.getSelection(), dom = this.editDom
    if (!selection?.anchorNode || !selection.focusNode || !dom.contains(selection.anchorNode) || !dom.contains(selection.focusNode)) return
    const offset = (node: Node, at: number) => { const range = document.createRange(); range.selectNodeContents(dom); range.setEnd(node, at); return domText(range.cloneContents()).length }
    return { anchor: offset(selection.anchorNode, selection.anchorOffset), focus: offset(selection.focusNode, selection.focusOffset) }
  }
  projectText = (text: string, selection?: TextSelection) => {
    if (this.getPlainText() === text) return
    const dom = this.editDom, caret = selection || this.getSelection()
    dom.innerText = text
    if (!caret || document.activeElement !== dom) return
    const point = (index: number): [Node, number] => {
      const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
      let node = walker.nextNode()
      while (node) {
        if (node.nodeType === Node.TEXT_NODE) { const length = node.textContent?.length || 0; if (index <= length) return [node, index]; index -= length }
        else if (node.nodeName === 'BR') { if (!index) return [node.parentNode!, [...node.parentNode!.childNodes].indexOf(node as ChildNode)]; index-- }
        node = walker.nextNode()
      }
      return [dom, dom.childNodes.length]
    }
    window.getSelection()?.setBaseAndExtent(...point(caret.anchor), ...point(caret.focus))
  }

  override onLoad() {
    super.onLoad()
    this.editDom.classList.add('canvas-plain-text-editor')
    this.editDom.contentEditable = 'plaintext-only'
  }

  override onUpdate() {
    super.onUpdate()
    const text = this.editTarget, dom = this.editDom
    // An empty flex editor has no line box, so its caret ignores vertical
    // alignment. Use the same block flow for empty and populated labels.
    dom.style.display = 'block'
    dom.style.whiteSpace = text.textWrap === 'none' || text.__.__autoWidth ? 'pre' : 'pre-wrap'
    const lineHeight = Number(text.__.__lineHeight || text.fontSize) * this.textScale
    const rows = Math.max(1, text.__.__textDrawData?.rows.length || 0)
    const padding = parseFloat(dom.style.paddingTop) || 0
    const spare = Math.max(0, parseFloat(dom.style.height) - padding - (parseFloat(dom.style.paddingBottom) || 0) - rows * lineHeight)
    dom.style.paddingTop = `${padding + (text.verticalAlign === 'middle' ? spare / 2 : text.verticalAlign === 'bottom' ? spare : 0)}px`
  }

  protected override onInput() { this.editTarget.text = this.getPlainText() }

  protected override onKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || !this.editDom?.contains(event.target as Node)) return
    if (event.isComposing || event.keyCode === 229) return
    const modifier = event.metaKey || event.ctrlKey, key = event.key.toLowerCase()
    if (modifier && key === 'a') {
      event.preventDefault(); event.stopImmediatePropagation()
      if (event.metaKey !== event.ctrlKey && !event.altKey && !event.shiftKey) window.getSelection()?.selectAllChildren(this.editDom)
      return
    }
    if (modifier && (key === 'z' || key === 'y') && this.requestUndo) {
      event.preventDefault(); event.stopPropagation()
      if (event.shiftKey || key === 'y') this.requestRedo?.(); else this.requestUndo()
      return
    }
    // Label text has one object-level style; browser marks never become document formatting.
    if (modifier && ['b', 'i', 'u', 'k'].includes(key)) { event.preventDefault(); return }
    super.onKeydown(event)
  }

  override onUnload() {
    const text = this.editTarget, editor = this.editor
    const owner = ancestor(text, 'diagram-node') || ancestor(text, 'mind-node') || ancestor(text, 'connector-label')
    const canvas = this.editDom?.closest<HTMLElement>('.canvas-app'), wasFocused = this.editDom?.contains(document.activeElement)
    super.onUnload()
    this.requestFlush = undefined; this.requestUndo = undefined; this.requestRedo = undefined
    queueMicrotask(() => {
      if (owner?.leafer && !editor.innerEditing && editor.list.length === 1 && editor.list[0] === text) editor.select(owner)
      if (wasFocused && document.activeElement === document.body) canvas?.focus({ preventScroll: true })
    })
  }
}
registerInnerEditor()(CanvasPlainTextEditor)
