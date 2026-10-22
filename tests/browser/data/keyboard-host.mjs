import React from 'react'
import { createRoot } from 'react-dom/client'
import { CanvasEditor } from '@smartdoca/canvas'
import { CanvasModel } from '@smartdoca/canvas/model'
import '@smartdoca/canvas/style.css'
import nodes from './keyboard-current-nodes.json'

const kind = new URLSearchParams(location.search).get('kind') || 'note'
const rect = id => ({ id, tag: 'Rect', name: 'rect', x: 280, y: 180, width: 160, height: 100, fill: '#c8dfff', editable: true })
const initial = name => ({ version: 1, scene: { tag: 'Leafer', children: name === 'first' ? [structuredClone(nodes[kind])] : [rect('second-rect')] } })
window.keyboardHosts = {}; window.keyboardErrors = []
const hosts = ['first', 'second'].map(name => {
  const model = CanvasModel.initialize(crypto.randomUUID(), initial(name)), updates = []
  model.onLocalUpdate(update => updates.push(update))
  return React.createElement('section', { className: 'keyboard-editor', id: name, key: name }, React.createElement(CanvasEditor, {
    model, hostManaged: true, showHeader: false,
    onError: error => window.keyboardErrors.push(String(error)),
    onReady: handle => { window.keyboardHosts[name] = { model, handle, updates } },
  }))
})
createRoot(document.getElementById('root')).render(React.createElement(React.Fragment, null,
  React.createElement('aside', { className: 'host-fields' }, React.createElement('textarea', { id: 'host-comment', 'aria-label': 'Host comment', defaultValue: 'Host comment draft', onKeyDown: event => event.stopPropagation(), onKeyUp: event => event.stopPropagation() })),
  React.createElement('div', { className: 'keyboard-pair' }, hosts)))
