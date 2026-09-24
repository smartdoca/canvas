import { createRoot } from 'react-dom/client'
import { CanvasEditor } from 'aidcanvas'
import { CanvasModel } from 'aidcanvas/model'
import * as io from 'aidcanvas/io'
import 'aidcanvas/style.css'
const count = Number(new URLSearchParams(location.search).get('count') || 100)
if (![100, 1000, 5000, 10000].includes(count)) throw new Error('Unsupported fixture size')
const children = Array.from({ length: count }, (_, i) => ({ id: `n-${i}`, tag: i % 5 ? 'Rect' : 'Text', name: i % 5 ? 'rect' : 'text', x: i % 100 * 30, y: Math.floor(i / 100) * 30, width: 24, height: 24, fill: '#7799bb', ...(i % 5 ? {} : { text: `中${i}`, fontSize: 10 }) }))
const start = performance.now(), model = CanvasModel.initialize('benchmark', { version: 1, scene: { children } })
const initMs = performance.now() - start, updates = [], frames = []
model.onLocalUpdate(u => updates.push(u))
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
const mountedAt = performance.now()
createRoot(document.getElementById('root')).render(<CanvasEditor model={model} hostManaged onReady={async handle => {
  await frame()
  window.perf = { model, handle, io, frame, initMs, mountMs: performance.now() - mountedAt, updates, frames }
}} />)
