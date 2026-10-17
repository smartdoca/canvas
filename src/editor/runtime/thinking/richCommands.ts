import { Editor, Element, Node, Range, Text, Transforms, type BaseEditor, type Descendant } from 'slate'
import { ReactEditor } from 'slate-react'
import { safeLink, type RichLeaf, type RichParagraph } from './richText'
import { isRichList, orderedListNumber } from './richLists'

const blockKeys = ['block', 'level', 'checked', 'listOrder']
const currentBlock = (editor: BaseEditor) => editor.selection && Editor.above(editor, { match: node => Element.isElement(node) && Editor.isBlock(editor, node) })
/** Adjacent differently formatted runs are still one visible hyperlink. */
export function richLinkRange(editor: BaseEditor) {
  if (!editor.selection) return
  if (Range.isExpanded(editor.selection)) return editor.selection
  const [leaf, path] = Editor.leaf(editor, editor.selection.anchor), url = (leaf as RichLeaf).url
  if (!url) return editor.selection
  const [parent, parentPath] = Editor.parent(editor, path), children = parent.children as RichLeaf[]
  let first = path.at(-1)!, last = first
  while (first > 0 && children[first - 1].url === url) first--
  while (last < children.length - 1 && children[last + 1].url === url) last++
  return { anchor: { path: [...parentPath, first], offset: 0 }, focus: { path: [...parentPath, last], offset: children[last].text.length } }
}
export function setRichLink(editor: BaseEditor, input: string, label?: string) {
  const url = safeLink(input)
  if (!url || !editor.selection) return false
  if (Range.isExpanded(editor.selection)) {
    if (label !== undefined && label !== Editor.string(editor, editor.selection)) {
      const marks = Editor.marks(editor) || {}
      Transforms.insertNodes(editor, { ...marks, text: label || url, url } as Descendant); Transforms.collapse(editor, { edge: 'end' }); Editor.removeMark(editor, 'url')
    } else Editor.addMark(editor, 'url', url)
  }
  else {
    const [leaf] = Editor.leaf(editor, editor.selection.anchor)
    if ((leaf as RichLeaf).url) { Transforms.select(editor, richLinkRange(editor)!); Editor.addMark(editor, 'url', url); Transforms.collapse(editor, { edge: 'end' }) }
    else {
      Transforms.insertNodes(editor, { text: label || url, url } as Descendant)
      Transforms.collapse(editor, { edge: 'end' })
      Editor.removeMark(editor, 'url')
    }
  }
  return true
}
export function removeRichLink(editor: BaseEditor) {
  if (!editor.selection) return
  Transforms.select(editor, richLinkRange(editor)!)
  Transforms.unsetNodes(editor, 'url', { match: Text.isText, split: true })
  Editor.removeMark(editor, 'url')
}

/** Small Slate command layer shared by every canvas text surface. */
export function withCanvasMarkdown<T extends BaseEditor & ReactEditor>(editor: T): T {
  const { insertText, insertBreak, deleteBackward } = editor
  editor.insertText = text => {
    if (!editor.selection || !Range.isCollapsed(editor.selection) || ReactEditor.isComposing(editor)) { insertText(text); return }
    const entry = currentBlock(editor)
    if (!entry) { insertText(text); return }
    const [node, path] = entry, paragraph = node as unknown as RichParagraph
    const start = Editor.start(editor, path), before = Editor.string(editor, { anchor: start, focus: editor.selection.anchor })
    if (text === ' ' && !paragraph.block) {
      const shortcut = /^(#{1,6}|>|[-+*]|\d+\.|\[ ?\]|\[[xX]\]|```)$/.exec(before)
      if (shortcut) {
        const token = shortcut[1], props: Partial<RichParagraph> = token[0] === '#' ? { block: 'heading', level: token.length } : token === '>' ? { block: 'quote' } : /^\d/.test(token) ? { block: 'number' } : token[0] === '[' ? { block: 'task', checked: /x/i.test(token) } : token === '```' ? { block: 'code' } : { block: 'bullet' }
        if (props.block === 'number') {
          const order = Math.max(1, Number.parseInt(token, 10))
          if (Number.isSafeInteger(order) && order !== orderedListNumber(editor.children as unknown as RichParagraph[], path[0])) props.listOrder = order
        }
        Editor.withoutNormalizing(editor, () => { Transforms.delete(editor, { at: { anchor: start, focus: editor.selection!.anchor } }); Transforms.setNodes(editor, props as never, { at: path }) })
        return
      }
    }
    // A space ends an automatically linked URL and is never part of its range.
    if (text === ' ') {
      const urlMatch = /(?:^|\s)((?:https?:\/\/|www\.)[^\s]+)$/.exec(before)
      if (urlMatch && safeLink(urlMatch[1])) {
        const anchor = Editor.before(editor, editor.selection.anchor, { distance: urlMatch[1].length, unit: 'character' })!
        const caret = editor.selection.anchor
        Transforms.select(editor, { anchor, focus: caret }); Editor.addMark(editor, 'url', safeLink(urlMatch[1])!); Transforms.collapse(editor, { edge: 'end' })
      }
      Editor.removeMark(editor, 'url')
    }
    insertText(text)
    if (!editor.selection || !Range.isCollapsed(editor.selection) || paragraph.block === 'code') return
    const value = Editor.string(editor, { anchor: Editor.start(editor, path), focus: editor.selection.anchor })
    const link = /\[([^\]\n]+)\]\(([^\s)]+)\)$/.exec(value)
    const mark = /(?:^|[\s([{])((\*\*|__|~~|`|\*|_)([^\n]+?)\2)$/.exec(value)
    const match = link && safeLink(link[2]) ? { raw: link[0], text: link[1], marks: { url: safeLink(link[2]) } } : mark && !/^[*_`]/.test(mark[3]) ? { raw: mark[1], text: mark[3], marks: { [({ '**': 'bold', __: 'bold', '~~': 'strikethrough', '`': 'code', '*': 'italic', _: 'italic' } as Record<string, string>)[mark[2]]]: true } } : undefined
    if (!match) return
    const focus = editor.selection.anchor, anchor = Editor.before(editor, focus, { distance: match.raw.length, unit: 'character' })
    if (!anchor) return
    const marks = Editor.marks(editor) || {}
    Editor.withoutNormalizing(editor, () => {
      Transforms.select(editor, { anchor, focus }); Transforms.delete(editor)
      Transforms.insertNodes(editor, { ...marks, ...match.marks, text: match.text } as Descendant)
      Transforms.collapse(editor, { edge: 'end' })
      Object.keys(match.marks).forEach(key => Editor.removeMark(editor, key))
    })
  }
  editor.insertBreak = () => {
    const entry = currentBlock(editor)
    if (!entry) { insertBreak(); return }
    const [node, path] = entry, p = node as unknown as RichParagraph
    if (!p.block && Node.string(node) === '```') {
      Editor.withoutNormalizing(editor, () => { Transforms.delete(editor, { at: Editor.range(editor, path) }); Transforms.setNodes(editor, { block: 'code' } as never, { at: path }) }); return
    }
    if (p.block && !Node.string(node)) {
      if (isRichList(p) && p.indent) indentRichBlock(editor, true)
      else Transforms.unsetNodes(editor, blockKeys, { at: path })
      return
    }
    insertBreak()
    const next = currentBlock(editor)
    if (next && p.block === 'heading') Transforms.unsetNodes(editor, blockKeys, { at: next[1] })
    if (next && p.block === 'task') Transforms.setNodes(editor, { checked: false } as never, { at: next[1] })
    if (next && p.block === 'number') Transforms.unsetNodes(editor, 'listOrder', { at: next[1] })
    Editor.removeMark(editor, 'url')
  }
  editor.deleteBackward = unit => {
    const entry = currentBlock(editor)
    if (entry && editor.selection && Range.isCollapsed(editor.selection) && Editor.isStart(editor, editor.selection.anchor, entry[1]) && (entry[0] as unknown as RichParagraph).block) {
      Transforms.unsetNodes(editor, blockKeys, { at: entry[1] }); return
    }
    if (entry && editor.selection && Range.isCollapsed(editor.selection) && Editor.isStart(editor, editor.selection.anchor, entry[1]) && (entry[0] as unknown as RichParagraph).indent) {
      const indent = (entry[0] as unknown as RichParagraph).indent! - 1
      if (indent) Transforms.setNodes(editor, { indent } as never, { at: entry[1] })
      else Transforms.unsetNodes(editor, 'indent', { at: entry[1] })
      return
    }
    deleteBackward(unit)
  }
  return editor
}

export function indentRichBlock(editor: BaseEditor, reverse: boolean) {
  const entry = currentBlock(editor), p = entry?.[0] as unknown as RichParagraph | undefined
  if (!entry || !p || p.resource || p.custom || !editor.selection || Range.isExpanded(editor.selection)) return false
  const indent = Math.max(0, Math.min(8, (p.indent || 0) + (reverse ? -1 : 1)))
  if (indent) Transforms.setNodes(editor, { indent } as never, { at: entry[1] })
  else Transforms.unsetNodes(editor, 'indent', { at: entry[1] })
  return true
}
