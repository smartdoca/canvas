import { Transforms, type BaseEditor } from 'slate'
import { ReactEditor, useSelected, type RenderElementProps } from 'slate-react'
import type { CanvasRichTextExtension } from '../../../sdk/types'
import type { RichInline } from './richText'
type NativeEditor = BaseEditor & ReactEditor

export function InlineElement({ attributes, children, element, editor, extensions, canEdit }: RenderElementProps & { editor: NativeEditor; extensions: CanvasRichTextExtension[]; canEdit: () => boolean }) {
  const inline = (element as unknown as RichInline).inline, selected = useSelected(), extension = extensions.find(e => e.inline && e.type === inline.type)
  return <span {...attributes} data-rich-inline={inline.type} title={inline.label} className={`rich-custom-inline${selected ? ' is-selected' : ''}`}>
    <span contentEditable={false}>{extension ? extension.render({ element: inline, selected, onChange: (data, label) => {
      if (canEdit()) Transforms.setNodes(editor, { inline: { ...inline, data, ...(label === undefined ? {} : { label }) } } as never, { at: ReactEditor.findPath(editor, element) })
    } }) : inline.label}</span>{children}
  </span>
}
