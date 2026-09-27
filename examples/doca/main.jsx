// Runnable host harness: yarn dev -> /examples/doca/. No Doca backend required.
// BroadcastChannel below belongs to this example host, never to the editor package.
import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { CanvasEditor } from 'aidcanvas'
import { CanvasModel } from 'aidcanvas/model'
import * as io from 'aidcanvas/io'
import 'aidcanvas/style.css'

const search = new URLSearchParams(location.search)
const seeded = search.get('checkpoint')
const initial = { version: 1, name: '协同测试画板', scene: { tag: 'Leafer', children: [
  { id: 'rect-a', tag: 'Rect', name: 'rect', x: 360, y: 160, width: 120, height: 80, fill: '#8e88ee', editable: true },
  { id: 'rect-b', tag: 'Rect', name: 'rect', x: 550, y: 160, width: 80, height: 80, fill: '#50aa88', editable: true },
  { id: 'text-a', tag: 'Text', name: 'text', x: 360, y: 300, text: 'hello canvas', fontSize: 24, editable: true },
] } }
let model = seeded ? CanvasModel.restore({ codec: 'aidcanvas-yjs', schemaVersion: 1, epochId: search.get('epoch'), update: Uint8Array.from(atob(seeded), c => c.charCodeAt(0)) }) : CanvasModel.initialize(crypto.randomUUID(), initial)
const checkpoint = model.checkpoint()
const link = new URL(location.href)
link.searchParams.set('epoch', model.epochId)
link.searchParams.set('checkpoint', btoa(String.fromCharCode(...checkpoint.update)))
const sessionId = crypto.randomUUID()
const identity = { sessionId, userId: 'same-account', name: `同一账号 ${sessionId.slice(0, 4)}`, color: seeded ? '#3377bb' : '#aa3377' }
const channel = new BroadcastChannel(`aidcanvas-example-${model.epochId}`)
let connected = true
const outbox = [], allUpdates = [], peers = new Map()
let renderStatus = () => {}, renderPresence = () => {}
const resourceLog = [], errors = []
const resourceControls = { hold: false, complete: null, denyDownload: false, failUpload: false, failRead: false }
// Explicit simulated server rejection: never treated as receipt/ACK, never removes outbox.
const transportControls = { reject: false }
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='
const assetUrls = new Map()
const assetBlob = path => { const url = assetUrls.get(path) || pixel; return new Blob([Uint8Array.from(atob(url.split(',')[1]), c => c.charCodeAt(0))], { type: url.slice(5, url.indexOf(';')) }) }
const resources = {
  async uploadImage(blob, context) {
    resourceLog.push({ type: 'upload', source: context.source, signal: context.signal })
    if (resourceControls.hold) await new Promise(resolve => { resourceControls.complete = resolve })
    if (context.signal?.aborted) throw new Error('aborted')
    if (resourceControls.failUpload) throw new Error('UPLOAD_FAILED')
    const url = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob) })
    const path = `asset-${crypto.randomUUID()}`
    assetUrls.set(path, url)
    channel.postMessage({ type: 'asset', path, url, sessionId }) // Test host asset store, not CRDT.
    return { path, size: blob.size }
  },
  resolveUrl(path) { resourceLog.push({ type: 'display', path }); return assetUrls.get(path) || pixel },
  readImage(path) { resourceLog.push({ type: 'read', path }); if (resourceControls.failRead) return Promise.reject(new Error('READ_DENIED')); return Promise.resolve(assetBlob(path)) },
  resolveDownloadUrl(path) {
    resourceLog.push({ type: 'download', path })
    if (resourceControls.denyDownload) throw new Error('DOWNLOAD_DENIED')
    return assetUrls.get(path) || pixel
  },
}
const send = data => { if (connected) channel.postMessage({ ...data, sessionId }) }
const listenLocal = () => model.onLocalUpdate(update => {
  allUpdates.push(update); outbox.push(update); renderStatus('saving')
  if (transportControls.reject) renderStatus('error')
  else send({ type: 'update', update })
})
listenLocal()
channel.onmessage = ({ data }) => {
  if (!connected || data.sessionId === sessionId) return
  if (data.type === 'asset') assetUrls.set(data.path, data.url)
  if (data.type === 'update') {
    model.applyUpdate(data.update)
    // Harness peer-receipt only, NOT a durable database ACK. Doca must commit before ACK.
    send({ type: 'receipt', id: data.update.id })
  }
  if (data.type === 'receipt' && outbox[0]?.id === data.id) {
    outbox.shift(); renderStatus(outbox.length ? 'saving' : 'clean')
  }
  if (data.type === 'sync-request') { assetUrls.forEach((url, path) => send({ type: 'asset', url, path })); send({ type: 'sync', update: model.diff(data.vector), recipient: data.sessionId }) }
  if (data.type === 'sync' && data.recipient === sessionId) {
    model.applyUpdate(data.update)
    outbox.forEach(update => send({ type: 'update', update }))
  }
  if (data.type === 'presence') {
    if (data.selection) peers.set(data.sessionId, { ...data.identity, elementIds: data.selection.elementIds })
    else peers.delete(data.sessionId)
    renderPresence([...peers.values()])
  }
}
function Host() {
  const editor = useRef(null)
  const fileInput = useRef(null)
  const insertFile = (file, options) => editor.current.insertImageFile(file, options).catch(error => errors.push(String(error)))
  const exportFile = async options => {
    try {
      const result = await editor.current.exportFile(options)
      window.demo.lastExport = result
      const url = URL.createObjectURL(result.blob), link = document.createElement('a'); link.href = url; link.download = result.filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { errors.push(String(error)) }
  }
  const [mode, setMode] = useState('edit'), [status, setStatus] = useState('clean'), [remote, setRemote] = useState([])
  const [online, setOnline] = useState(true)
  const [mounted, setMounted] = useState(true), [anchors, setAnchors] = useState([]), [activeAnchorId, setActiveAnchorId] = useState(null)
  const [canComment, setCanComment] = useState(true)
  const [showToolbar, setShowToolbar] = useState(true)
  useEffect(() => { renderStatus = setStatus; renderPresence = setRemote; return () => { renderStatus = () => {}; renderPresence = () => {} } }, [])
  const changeConnection = next => {
    connected = next; setOnline(next)
    if (next) send({ type: 'sync-request', vector: model.stateVector() })
    else { setRemote([]); channel.postMessage({ type: 'presence', sessionId, selection: null }) }
  }
  const closeDocument = () => {
    // Native cleanup flushes first; checkpoint then contains the final debounce/DOM input.
    flushSync(() => setMounted(false))
    const checkpoint = model.checkpoint()
    model.dispose()
    return checkpoint // Real Doca must durably retain checkpoint/outbox before process exit.
  }
  const openDocument = checkpoint => {
    model = CanvasModel.restore(checkpoint); listenLocal()
    flushSync(() => setMounted(true))
  }
  return <><nav>
    <a href={link.href} target="_blank">同账号打开第二页面</a>
    <button onClick={() => setMode(mode === 'edit' ? 'readonly' : 'edit')}>切换只读</button>
    <button onClick={() => changeConnection(!online)}>{online ? '模拟断线' : '重新连接'}</button>
    <button onClick={() => { const anchor = editor.current.captureAnchor(); if (anchor?.elementIds.length) setAnchors(previous => [...previous, { anchorId: `comment-${previous.length + 1}`, anchor }]) }}>标记选区评论</button>
    <span>{identity.name} · {status}（示例仅确认对端接收）</span>
  </nav><input ref={fileInput} aria-label="宿主选择图片" hidden type="file" accept=".png,.jpg,.jpeg,.webp,.svg" onChange={e => { if (e.target.files[0]) void insertFile(e.target.files[0]); e.target.value = '' }} /><aside aria-label="宿主评论卡片">{anchors.filter(a => !a.resolved).map(a => <button key={a.anchorId} aria-pressed={activeAnchorId === a.anchorId} onClick={() => { setActiveAnchorId(a.anchorId); editor.current?.revealAnchor(a.anchor) }}>{a.anchorId}</button>)}</aside><section onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }} onDrop={e => { if (e.dataTransfer.files[0]) { e.preventDefault(); void insertFile(e.dataTransfer.files[0], editor.current.clientToScene({ x: e.clientX, y: e.clientY })) } }} onPaste={e => { if (e.clipboardData.files[0]) { e.preventDefault(); void insertFile(e.clipboardData.files[0]) } }}>{mounted && <CanvasEditor ref={editor} model={model} hostManaged mode={mode} sessionId={sessionId} remoteSelections={remote} resources={resources} onError={error => errors.push(String(error))}
    onImportRequest={() => fileInput.current.click()} onExportRequest={options => void exportFile(options)}
    showToolbar={showToolbar}
    selectionActions={[{ id: 'comment', label: '评论选中元素', icon: <span>♧</span>, allowInReadOnly: true, disabled: !canComment, tooltip: canComment ? '为选中元素添加评论' : '没有评论权限', onClick: ({ selection }) => { window.demo.actionSelection = selection; setAnchors(previous => [...previous, { anchorId: `comment-${previous.length + 1}`, anchor: model.captureAnchor(selection.map(x => x.id)) }]) } }]}
    hostActions={[{ id: 'comments', label: '打开评论', icon: <span>♧</span>, allowInReadOnly: true, disabled: !canComment, tooltip: '打开宿主评论抽屉', onClick: () => { window.demo.topActionClicks = (window.demo.topActionClicks || 0) + 1 } }]}
    anchors={anchors} activeAnchorId={activeAnchorId} onAnchorClick={event => { setActiveAnchorId(event.anchorId); window.demo.lastAnchorClick = event }}
    autoSave saveStatus={status} onSaveRequest={() => { throw new Error('Unexpected autosave') }}
    onPresenceChange={selection => { if (connected) send({ type: 'presence', identity, selection }) }}
    onReady={handle => {
      window.demo = { io, resources, assetUrls, model, handle, allUpdates, outbox, resourceLog, resourceControls, transportControls, errors, link: link.href, setMode, setStatus, setAnchors, setActiveAnchorId, setCanComment, setLayersPosition, setShowToolbar, closeDocument, openDocument, changeConnection, identity, readyCount: (window.demo?.readyCount || 0) + 1 }
      send({ type: 'sync-request', vector: model.stateVector() })
    }} />}</section></>
}
createRoot(document.getElementById('root')).render(<Host />)
window.addEventListener('pagehide', () => { model.dispose(); channel.postMessage({ type: 'presence', sessionId, selection: null }); connected = false; channel.close() })
