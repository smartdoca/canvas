import { useRef } from 'react'
import { CanvasEditor, type CanvasAnchorDecoration, type CanvasEditorRef, type CanvasEditorResources, type CanvasSaveStatus } from 'aidcanvas'
import type { SessionSelection } from 'aidcanvas/model'
import type { createDocaCanvasSession, DocaRuntime } from './session'
import 'aidcanvas/style.css'

export function DocaCanvas(props: {
  session: ReturnType<typeof createDocaCanvasSession>
  runtime: DocaRuntime
  resources: CanvasEditorResources
  sessionId: string
  peers: SessionSelection[]
  canEdit: boolean
  canComment: boolean
  createComment(anchor: import('aidcanvas/model').ElementAnchor): void
  openComments(): void
  saveStatus: CanvasSaveStatus
  anchors: CanvasAnchorDecoration[]
  activeAnchorId: string | null
  activateComment(anchorId: string): void
}) {
  const ref = useRef<CanvasEditorRef>(null)
  return <CanvasEditor ref={ref} model={props.session.model} hostManaged
    mode={props.canEdit ? 'edit' : 'readonly'} saveStatus={props.saveStatus}
    sessionId={props.sessionId} remoteSelections={props.peers}
    onPresenceChange={props.runtime.publishSelection}
    resources={props.resources} onError={props.runtime.reportError}
    anchors={props.anchors} activeAnchorId={props.activeAnchorId}
    onAnchorClick={event => props.activateComment(event.anchorId)}
    showHeader={false}
    selectionActions={[{
      id: 'comment', label: '添加元素评论', icon: <span>♧</span>, allowInReadOnly: true,
      disabled: selection => !props.canComment || selection.length === 0,
      tooltip: props.canComment ? '评论选中元素' : '没有评论权限',
      onClick: ({ selection }) => props.createComment(props.session.model.captureAnchor(selection.map(item => String(item.id)))),
    }]}
    hostActions={[{ id: 'comments', label: '评论', icon: <span>♧</span>, allowInReadOnly: true, tooltip: '打开评论抽屉', onClick: props.openComments }]}
    toolbarEnd={<button onClick={() => {
      const match = ref.current?.find('hello')[0]
      if (match) ref.current?.reveal(match)
    }}>定位 hello</button>}
  />
}
