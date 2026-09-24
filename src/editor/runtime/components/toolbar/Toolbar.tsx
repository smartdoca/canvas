import type { App } from 'leafer-ui'
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { Plugins } from '../../plugins/plugins'
import { HandDrag, More, Mouse, Picture, Redo, Undo } from '@icon-park/react'
import { IconButton } from '../../../ui/Controls'
import type { ReactNode } from 'react'
import type { CanvasElementExtension, CustomShapeDefinition } from '../../../../sdk/types'
import { ExtensionTool } from './ExtensionTool'

interface ToolbarProps {
  app: App
  plugins: Plugins[]
  activeKey: string
  setActiveKey: (key: string) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onImage: (file: File) => boolean
  onImageRequest?: () => void
  customShapes?: CustomShapeDefinition[]
  elementExtensions?: CanvasElementExtension[]
  extensionValues?: Record<string, Record<string, unknown>>
  start?: ReactNode
  end?: ReactNode
}

interface ToolEntry {
  key: string
  name?: string
  element: ReactNode
}

const trailingShapeNames = ['square', 'circle', 'polygon', 'star', 'frame']
const reservedNames = new Set(['eraser', 'image', 'special-shape', ...trailingShapeNames])

const Toolbar: React.FC<ToolbarProps> = ({
  app, plugins, activeKey, setActiveKey, canUndo, canRedo, onUndo, onRedo, onImage, onImageRequest, customShapes, elementExtensions = [], extensionValues = {}, start, end,
}) => {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const fixedRef = useRef<HTMLDivElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const widthCache = useRef(new Map<string, number>())
  const [moreOpen, setMoreOpen] = useState(false)
  const setInit = useCallback(() => {
    setActiveKey('init')
    app.mode = 'normal'
  }, [app, setActiveKey])

  const renderPlugin = useCallback((plugin: Plugins) => {
    const AddMenu = plugin.AddMenu
    return <AddMenu app={app} onCreateComplete={setInit} activeKey={activeKey} onClick={setActiveKey} customShapes={customShapes} />
  }, [activeKey, app, customShapes, setActiveKey, setInit])

  const pluginByName = (name: string) => plugins.find(plugin => plugin.name === name)
  const tools: ToolEntry[] = [
    ...plugins.filter(plugin => !reservedNames.has(plugin.name)).map(plugin => ({ key: plugin.name, name: plugin.name, element: renderPlugin(plugin) })),
    ...elementExtensions.map(extension => ({
      key: `extension:${extension.type}`,
      name: extension.type,
      element: <ExtensionTool app={app} extension={extension} properties={extensionValues[extension.type] || {}} activeKey={activeKey} onClick={setActiveKey} onCreateComplete={setInit} />,
    })),
    {
      key: 'image',
      element: <IconButton label="图片 (I)" icon={<Picture />} onClick={() => onImageRequest ? onImageRequest() : imageInputRef.current?.click()} />,
    },
    ...['special-shape', 'eraser'].flatMap(name => {
      const plugin = pluginByName(name)
      return plugin ? [{ key: plugin.name, name: plugin.name, element: renderPlugin(plugin) }] : []
    }),
    ...trailingShapeNames.flatMap(name => {
      const plugin = pluginByName(name)
      return plugin ? [{ key: plugin.name, name: plugin.name, element: renderPlugin(plugin) }] : []
    }),
  ]
  const signature = tools.map(tool => tool.key).join('\0')
  const toolsRefState = useRef(tools)
  toolsRefState.current = tools
  const [layout, setLayout] = useState({ signature: '', visibleCount: tools.length })
  if (layout.signature !== signature) setLayout({ signature, visibleCount: tools.length })
  const visibleCount = layout.signature === signature ? Math.min(layout.visibleCount, tools.length) : tools.length
  const visibleTools = tools.slice(0, visibleCount)
  const overflowTools = tools.slice(visibleCount)

  useLayoutEffect(() => {
    const measure = () => {
      const toolbar = toolbarRef.current
      const fixed = fixedRef.current
      const toolRow = toolsRef.current
      const wrap = toolbar?.parentElement
      const entries = toolsRefState.current
      if (!toolbar || !fixed || !toolRow || !wrap) return entries.length
      const style = getComputedStyle(toolbar)
      const barGap = Number.parseFloat(style.columnGap || style.gap || '0') || 0
      const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0)
      const border = (Number.parseFloat(style.borderLeftWidth) || 0) + (Number.parseFloat(style.borderRightWidth) || 0)
      const endWidth = endRef.current?.offsetWidth ?? 0
      const gapCount = endWidth > 0 ? 2 : 1
      const available = wrap.clientWidth - border - padding - fixed.offsetWidth - endWidth - barGap * gapCount
      Array.from(toolRow.children).forEach(node => {
        if (!(node instanceof HTMLElement)) return
        const key = node.dataset.toolKey
        if (key && node.offsetWidth > 0) widthCache.current.set(key, node.offsetWidth)
      })
      const toolGap = Number.parseFloat(getComputedStyle(toolRow).columnGap || '0') || 0
      const more = toolRow.querySelector('.toolbar-more')
      const moreWidth = more instanceof HTMLElement && more.offsetWidth > 0 ? more.offsetWidth : 28
      let used = 0
      for (let index = 0; index < entries.length; index += 1) {
        const width = widthCache.current.get(entries[index].key) ?? 28
        const itemGap = index > 0 ? toolGap : 0
        const reserve = index < entries.length - 1 ? toolGap + moreWidth : 0
        if (used + itemGap + width + reserve > available - 1) return index
        used += itemGap + width
      }
      return entries.length
    }
    const apply = () => {
      const next = measure()
      setLayout(previous => previous.signature === signature && previous.visibleCount === next ? previous : { signature, visibleCount: next })
      setMoreOpen(open => next === toolsRefState.current.length ? false : open)
    }
    apply()
    const wrap = toolbarRef.current?.parentElement
    if (!wrap) return
    const observer = new ResizeObserver(apply)
    observer.observe(wrap)
    if (fixedRef.current) observer.observe(fixedRef.current)
    if (endRef.current) observer.observe(endRef.current)
    return () => observer.disconnect()
  }, [signature])

  return <div ref={toolbarRef} className="canvas-toolbar">
    <div ref={fixedRef} className="toolbar-fixed">
      {start}
      <IconButton label="选择 (V / 1)" icon={<Mouse />} active={activeKey === 'init'} onClick={setInit} />
      <IconButton label="手型工具 (H / Space)" icon={<HandDrag />} active={activeKey === 'hand'} onClick={() => { setActiveKey('hand'); app.mode = 'normal'; app.editor.select([]) }} />
      <span className="toolbar-divider" />
      <IconButton label="撤销 (⌘Z)" icon={<Undo />} disabled={!canUndo} onClick={onUndo} />
      <IconButton label="重做 (⇧⌘Z)" icon={<Redo />} disabled={!canRedo} onClick={onRedo} />
      <span className="toolbar-divider" />
    </div>
    <div ref={toolsRef} className="toolbar-tools">
      {visibleTools.map(tool => <div key={tool.key} className="toolbar-tool" data-tool-key={tool.key}>{tool.element}</div>)}
      {overflowTools.length > 0 && <div className="toolbar-more" onMouseEnter={() => setMoreOpen(true)} onMouseLeave={() => setMoreOpen(false)}>
        <IconButton label="更多工具" icon={<More />} active={overflowTools.some(tool => tool.name === activeKey)} onClick={() => setMoreOpen(true)} />
        <div className={`toolbar-more-menu ${moreOpen ? 'is-open' : ''}`} onClick={() => setMoreOpen(false)}>
          {overflowTools.map(tool => <div key={tool.key} className="toolbar-tool">{tool.element}</div>)}
        </div>
      </div>}
    </div>
    {end && <div ref={endRef} className="toolbar-end">{end}</div>}
    <input ref={imageInputRef} aria-label="选择图片文件" hidden type="file" accept="image/*" onChange={(event) => {
      const file = event.target.files?.[0]
      if (file) onImage(file)
      event.target.value = ''
    }} />
  </div>
}

export default Toolbar
