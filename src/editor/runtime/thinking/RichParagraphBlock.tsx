import type { CSSProperties } from 'react'
import { Transforms } from 'slate'
import { ReactEditor, useSlateSelector, useSlateStatic, type RenderElementProps } from 'slate-react'
import { headingScale, type RichValue } from './richText'
import { isRichList, listMarker, LIST_GAP, LIST_INDENT, LIST_MARKER, TASK_CHECK_POINTS } from './richLists'

export function RichParagraphBlock({ attributes, children, element, baseSize, taskLabel, canEdit }: RenderElementProps & { baseSize: number; taskLabel: string; canEdit: () => boolean }) {
  const editor = useSlateStatic() as ReturnType<typeof useSlateStatic> & ReactEditor, p = element as RichValue[number]
  // Slate memoizes unchanged elements; sibling edits must still renumber this row.
  const marker = useSlateSelector(current => {
    const index = current.children.indexOf(element)
    return index < 0 ? '' : listMarker(current.children as RichValue, index)
  })
  const size = baseSize * headingScale(p), markerSize = p.children.find(leaf => leaf.text)?.fontSize || size
  const list = isRichList(p)
  return <div {...attributes} data-rich-block={p.block} style={{ position: 'relative', margin: 0, textAlign: p.align, minHeight: '1em', fontSize: p.block === 'heading' ? `${headingScale(p)}em` : undefined, fontWeight: p.block === 'heading' ? 700 : undefined, paddingLeft: p.block === 'quote' ? '1em' : undefined, marginLeft: `${(p.indent || 0) * LIST_INDENT}em`, fontFamily: p.block === 'code' ? 'ui-monospace, monospace' : undefined, background: p.block === 'code' ? '#f2f3f5' : undefined }}>
    {list ? <div className={`rich-list-row${p.block === 'task' ? ' is-task' : ''}`} style={{ '--rich-list-gap': `${LIST_GAP}em` } as CSSProperties}>
      {p.block === 'task' ? <button type="button" contentEditable={false} className={`rich-block-prefix rich-task-checkbox${p.checked ? ' is-checked' : ''}`} style={{ fontSize: `${markerSize / size}em`, width: `${LIST_MARKER}em`, height: `${LIST_MARKER}em`, marginTop: `calc((1lh - ${LIST_MARKER}em) / 2)` }} role="checkbox" aria-checked={Boolean(p.checked)} aria-label={taskLabel} disabled={!canEdit()} onPointerDown={event => event.preventDefault()} onKeyDown={event => event.stopPropagation()} onClick={() => { if (canEdit()) Transforms.setNodes(editor, { checked: !p.checked } as never, { at: ReactEditor.findPath(editor, element) }) }}>
        {p.checked && <svg viewBox="0 0 18 18" aria-hidden="true"><polyline points={TASK_CHECK_POINTS.map(point => point.join(',')).join(' ')} /></svg>}
      </button> : <span contentEditable={false} className="rich-block-prefix rich-list-marker" style={{ fontSize: `${markerSize / size}em`, minWidth: `${LIST_MARKER}em` }}>{marker}</span>}
      <div className={`rich-list-content${p.block === 'task' && p.checked ? ' is-done' : ''}`}>{children}</div>
    </div> : children}
  </div>
}
