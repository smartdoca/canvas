import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import {
  App,
  ChildEvent,
  Frame,
  Group,
  Image as LeaferImage,
  KeyEvent,
  MoveEvent,
  Path,
  PointerEvent as LeaferPointerEvent,
  PropertyEvent,
  Text as LeaferText,
  ZoomEvent,
  type IUI,
  type IUIJSONData,
} from 'leafer-ui'
import '@leafer-in/editor'
import '@leafer-in/viewport'
import '@leafer-in/view'
import '@leafer-in/arrow'
import '@leafer-in/text-editor'
import './thinking/SlateTextEditor'
import './thinking/PlainTextEditor'
import { richContainer } from './thinking/richBounds'
import { fitNoteContent, prepareNoteLayout } from './thinking/noteLayout'
import { applyNotePreset } from './thinking/noteStyles'
import { getStyleParamsFromLocalStorage, setStyleParamsToLocalStorage } from './utils/styleLocalStorage'
import { alignTextContent, enhanceRichText, readRich, plainText } from './thinking/richText'
import { resourceRuntime, setResourceRuntime, setSlateTranslator, setRichExtensions } from './thinking/slateRuntime'
import '@leafer-in/export'
import { EditorEvent, InnerEditorEvent, EditorMoveEvent, EditorRotateEvent, EditorScaleEvent, type EditSelect } from '@leafer-in/editor'
import { Check, Copy, Delete, Download, EditTwo, FolderOpen, FullSelection, OffScreenOne, Save } from '@icon-park/react'
import { CanvasIOError, parseCanvasFile, createCanvasImportValue, exportCanvasFile, type CanvasInsertOptions, type CanvasInsertResult, type CanvasExportOptions, type CanvasExportResult } from '../../io'
import { cancellable, checkAbort, progress } from '../../io/common'
import { rectPlugin } from './plugins/rect'
import { pathPlugin } from './plugins/path'
import { textPlugin } from './plugins/text'
import { normalizeTextStyle } from './plugins/text/style'
import { eraserPlugin } from './plugins/eraser'
import { framePlugin } from './plugins/frame'
import './thinking/thinking.css'
import { GraphHandles } from './thinking/GraphHandles'
import { LibraryDragDrop } from './thinking/LibraryDragDrop'
import { TableInteractions } from './thinking/TableInteractions'
import { NativeResourcePreviews } from './thinking/NativeResourcePreviews'
import { NativeTaskCheckboxes } from './thinking/NativeTaskCheckboxes'
import { CanvasResources } from './thinking/CanvasResources'
import { cleanResource } from './thinking/resourceData'
import { RichLinks } from './thinking/RichLinks'
import { RichObjectInteractions } from './thinking/RichObjectInteractions'
import { ThinkingTools } from './thinking/ThinkingTools'
import { ToolPlacementPreview } from './thinking/ToolPlacementPreview'
import { containerContents, isAutoLayout, isCanvasContainer, isContainerPart, layoutContainer, makeContainer, syncContainerGeometry } from './thinking/containers'
import { BoardIcon } from './thinking/BoardIcon'
import { BoardMinimap, MindOutline, ShapesLibrary, TemplateGallery, TemplatePicture, TemplateStarter, ThinkingContextTools } from './thinking/ThinkingPanels'
import { createTemplate, type TemplateId } from './thinking/templates'
import { addMindNode, ancestor, fitConnectorLabel, isConnector, kind, labelOf, layoutMindMap, makeConnector, makeDiagram, mindMap, mindNode, mindNodes, mindDirectionOf, refreshConnectors, refreshMindEdges, removeItems, rememberConnectorLabelPosition, rememberMindPositions, syncMovedMindBranch, isMindPositioning, shapePath, setConnectorPath, setMindTheme, type MindLayout, type MindTheme, type DiagramShape } from './thinking/scene'
import { notePlugin } from './plugins/note'
import { SPECIAL_SHAPES } from './plugins/specialShape/const'
import type { Plugins } from './plugins/plugins'
import Toolbar from './components/toolbar/Toolbar'
import StyleEditor from './components/styleEditor/StyleEditor'
import { SnapshotHistory } from '../core/history'
import { createElementId, toPersistedCanvasScene, visibleRemoteSelections, type SceneNode } from '../../model'
import { CANVAS_STORAGE_KEY, createDocument, downloadText, parseDocument } from '../core/document'
import { IconButton } from '../ui/Controls'
import { Popover } from '../ui/Popover'
import ImageEditorModal, { type ImageEditResult } from './components/ImageEditorModal'
import SpecialShapeEditorModal from './components/SpecialShapeEditorModal'
import { RemoteSelections } from './components/RemoteSelections'
import { AnchorDecorations } from './components/AnchorDecorations'
import { AlignmentGuides } from './components/AlignmentGuides'
import { elementBounds } from './utils/elementBounds'
import { findItem, indexItems } from './utils/findItem'
import { createTextInputBridge } from './utils/textInputBridge'
import { installCanvasWheelBoundary } from './utils/canvasWheelBoundary'
import { installContainedSelection } from './utils/containedSelection'
import { bakeSpecialShapeScale, fitSpecialPath } from './utils/shapeGeometry'
import { type AddImageOptions, type CanvasResource, type CanvasEditorProps, type CanvasEditorRef, type CanvasFindOptions, type CanvasRevealOptions, type CanvasRevealResult, type CanvasSaveStatus, type CanvasTextMatch, type CanvasValue } from '../../sdk/types'
import { CanvasI18nProvider } from '../../i18n/context'
import type { MessageKey } from '../../i18n/en'
import { resolveLocale, translate, type TranslateParams } from '../../i18n/translate'

const plugins: Plugins[] = [pathPlugin, textPlugin, notePlugin, framePlugin, eraserPlugin]

type SaveState = 'saved' | 'saving' | 'dirty' | 'error'

const FRAME_TITLE_NAME = 'frame-title'
const CANVAS_CLIPBOARD_TYPE = 'application/x-smartdoca-canvas'
const CANVAS_CLIPBOARD_FORMAT = 'smartdoca-canvas-selection'

function addFrameTitle(frame: Frame) {
  const existing = ([...frame.children] as IUI[]).find((item) => item.name === FRAME_TITLE_NAME)
  if (existing) return
  frame.add(new LeaferText({
    name: FRAME_TITLE_NAME,
    text: String(frame.data?.title || 'Frame'),
    x: 10,
    y: 8,
    fill: '#6257e8',
    fontSize: 13,
    fontWeight: 600,
    editable: true,
  }))
}

function normalizeSelectableItems(items: IUI[], deep = true) {
  items.forEach((item) => {
    // Native editor helpers share the scene tree but are not canvas content.
    if (item.skipJSON) return
    // Every persisted scene item in this canvas is selectable.
    const derived = ['mind-edge', 'diagram-body', 'template-edge', 'container-decoration'].includes(kind(item)) && !['label', 'axis-label'].includes(item.data?.containerPart)
    const structuredGroup = kind(item) === 'mindmap'
    item.editable = !derived && !structuredGroup && kind(item) !== 'table-cell'
    item.hittable = !derived
    item.hitSelf = !derived && !structuredGroup
    if (['mind-node', 'diagram-node', 'table-cell', 'connector-label'].includes(kind(item))) item.hitChildren = false
    if (isConnector(item)) {
      item.editConfig = { ...item.editConfig, moveable: false, resizeable: false, rotateable: false }
      // A saved path is a projection of its route data, including implicit
      // legacy template ports. Keep native drawing and gesture overlays equal.
      if (item.data?.from && item.data?.to) setConnectorPath(item as Path, item.data.from, item.data.to)
    }
    if (kind(item) === 'connector-label') { item.set({ fill: 'rgba(0,0,0,0)', overflow: 'show' }); item.editConfig = { ...item.editConfig, resizeable: false, rotateable: false } }
    if (kind(item) === 'diagram-node' && item.data?.shape === 'cylinder') {
      const body = item.children?.find(child => kind(child) === 'diagram-body')
      if (body) body.path = shapePath('cylinder', Number(body.width), Number(body.height))
    }
    if (item instanceof LeaferText) {
      enhanceRichText(item)
      if (!item.name) item.name = 'text'
      normalizeTextStyle(item)
      if (item.name === 'text') {
        item.resizeFontSize = true
        item.lockRatio = true
        item.editConfig = { ...(item.editConfig || {}), editSize: 'font-size', lockRatio: true }
      }
      if (ancestor(item, 'connector-label')) item.editConfig = { ...item.editConfig, moveable: false, resizeable: false, rotateable: false }
    }
    if (item.name === 'square' || item.name === 'circle') item.lockRatio = true
    if (item.tag === 'Image' || item.name === 'image') {
      item.lockRatio = item.data?.imageSizeMode !== 'free'
    }
    if (item instanceof Frame && item.name === 'frame') {
      const fill = typeof item.fill === 'string' ? item.fill.replace(/\s/g, '').toLowerCase() : item.fill
      item.hitFill = item.fill == null || fill === 'transparent' || fill === 'rgba(0,0,0,0)' ? 'none' : 'path'
      item.hitStroke = 'path'
      addFrameTitle(item)
      syncContainerGeometry(item)
    }
    if (deep && 'children' in item && Array.isArray(item.children)) normalizeSelectableItems(item.children as IUI[])
    prepareNoteLayout(item)
    if (kind(item) === 'mindmap') rememberMindPositions(item as Group)
  })
}

function persistedScene(scene: unknown) {
  return toPersistedCanvasScene(scene as SceneNode)
}

function renderScene(scene: unknown) {
  const result = JSON.parse(JSON.stringify(scene))
  const visit = (node: Record<string, unknown>) => {
    if ((node.data as Record<string, unknown>)?.resourcePath) node.url = ''
    if (Array.isArray(node.children)) node.children.forEach(visit)
  }
  visit(result)
  return result
}

function cloneForInsertion(value: Record<string, unknown>): Record<string, unknown> {
  const result = JSON.parse(JSON.stringify(value))
  const ids = new Map<string, string>()
  const assign = (node: Record<string, unknown>) => { const next = createElementId(); if (typeof node.id === 'string') ids.set(node.id, next); node.id = next; if (Array.isArray(node.children)) node.children.forEach(assign) }
  const remap = (node: Record<string, unknown>) => {
    const data = node.data as Record<string, unknown> | undefined
    if (data) ['parentId', 'sourceId', 'targetId', 'ownerId', 'labelId'].forEach(key => { if (typeof data[key] === 'string' && ids.has(data[key] as string)) data[key] = ids.get(data[key] as string) })
    if (Array.isArray(node.children)) node.children.forEach(remap)
  }
  assign(result); remap(result)
  return result
}

const CanvasContent = forwardRef<CanvasEditorRef, CanvasEditorProps>(function CanvasContent(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLElement>(null)
  const appRef = useRef<App | null>(null)
  const historyRef = useRef(new SnapshotHistory())
  const saveTimerRef = useRef<number>()
  const changeTimerRef = useRef<number>()
  const positionFrameRef = useRef<number>()
  const panRef = useRef({ active: false, space: false, x: 0, y: 0 })
  const restoringRef = useRef(false)
  const resourceMutationRef = useRef(false)
  const selectionActionsRef = useRef<HTMLDivElement>(null)
  const selectionPlacementRef = useRef<{ items: IUI[]; layout: string; offsetX: number; below: boolean }>()
  const movedFrameItemsRef = useRef(new Set<IUI>())
  const editorHandleRef = useRef<CanvasEditorRef>()
  const uploadControllersRef = useRef(new Set<AbortController>())
  const propsRef = useRef(props)
  propsRef.current = props
  const lastValueRef = useRef('')
  const viewBaseRef = useRef<SceneNode>({ tag: 'Leafer', children: [] })
  const projectedModelRef = useRef<SceneNode>()
  const nativeModelWriteRef = useRef(false)
  const presencePointerRef = useRef<{ x: number; y: number }>()
  const textBridgeRef = useRef<ReturnType<typeof createTextInputBridge>>()
  const contentBaseRef = useRef('')
  const snapshotCacheRef = useRef<{ tree: IUI; value: string }>()
  const clipboardRef = useRef<Record<string, unknown>[]>([])
  const [app, setApp] = useState<App | null>(null)
  const [activeKey, setActiveKey] = useState('init')
  const [extensionValues, setExtensionValues] = useState<Record<string, Record<string, unknown>>>(() => Object.fromEntries((props.elementExtensions || []).map(extension => [extension.type, Object.fromEntries((extension.properties || []).map(property => [property.key, property.defaultValue]))])))
  const extensionValuesRef = useRef(extensionValues)
  extensionValuesRef.current = extensionValues
  const [selected, setSelected] = useState<IUI[]>([])
  const [focused, setFocused] = useState(false)
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [toast, setToast] = useState('')
  const [zoomPercent, setZoomPercent] = useState(100)
  const [selectionPosition, setSelectionPosition] = useState<{ x: number; y: number } | null>(null)
  const [imageEditorTarget, setImageEditorTarget] = useState<IUI | null>(null)
  const [shapeEditorTarget, setShapeEditorTarget] = useState<IUI | null>(null)
  const [grid, setGrid] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [starterOpen, setStarterOpen] = useState(true)
  const [templatePreview, setTemplatePreview] = useState<TemplateId | null>(null)
  const [shapesOpen, setShapesOpen] = useState(false)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [minimapOpen, setMinimapOpen] = useState(false)
  const [styleOpen, setStyleOpen] = useState(false)
  const styleSelectionItems = useRef<IUI[]>([])
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const isReadOnly = props.mode === 'readonly'
  const activateTool = useCallback((key: string) => {
    const current = appRef.current
    if (key.startsWith('connector:')) setStyleParamsToLocalStorage({ ...getStyleParamsFromLocalStorage(), connectorMode: key.split(':')[1] })
    if (key !== 'init') current?.editor.cancel()
    if (current && (key === 'init' || key === 'hand')) current.mode = 'normal'
    setActiveKey(key)
    setStyleOpen(false)
  }, [])

  useEffect(() => {
    if (!contextMenu && !shortcutsOpen) return
    if (contextMenu) stageRef.current?.querySelector<HTMLElement>('.canvas-context-menu')?.focus()
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setContextMenu(null); setShortcutsOpen(false); stageRef.current?.closest<HTMLElement>('.canvas-app')?.focus() }
    }
    const dismiss = (event: PointerEvent) => { if (!(event.target as HTMLElement).closest('.canvas-context-menu')) setContextMenu(null) }
    window.addEventListener('keydown', close)
    window.addEventListener('pointerdown', dismiss)
    return () => { window.removeEventListener('keydown', close); window.removeEventListener('pointerdown', dismiss) }
  }, [contextMenu, shortcutsOpen])

  const fitView = useCallback((selectionOnly = false) => {
    const current = appRef.current
    if (!current) return
    const items = selectionOnly ? current.editor.list : current.tree.children
    editorHandleRef.current?.revealElements(items.map(item => item.id!).filter(Boolean), { padding: 96, maxZoom: 1 })
  }, [])

  useEffect(() => {
    if (isReadOnly || !focused) { presencePointerRef.current = undefined; propsRef.current.onPresenceChange?.(null); return }
    let timer: number | undefined
    const publish = () => {
      if (timer !== undefined) return
      timer = window.setTimeout(() => {
        timer = undefined
        const native = app?.editor.innerEditing ? app.editor.innerEditor as unknown as { editTarget?: IUI; getSelection?: () => { anchor: number; focus: number } } : undefined
        const range = native?.getSelection?.(), elementId = native?.editTarget?.id
        const text = elementId && range ? propsRef.current.model?.captureTextPresence(elementId, range) : undefined
        propsRef.current.onPresenceChange?.({ elementIds: selected.map(x => x.id!).filter(Boolean), ...(text ? { text } : {}), ...(presencePointerRef.current ? { cursor: presencePointerRef.current } : {}) })
      }, 80)
    }
    const stage = stageRef.current
    const pointer = (event: globalThis.PointerEvent) => { if (!app || (event.target as HTMLElement).closest('button,input,select,textarea,[role=toolbar]')) return; const point = app.tree.getInnerPoint(app.tree.getWorldPointByClient(event)); presencePointerRef.current = { x: point.x, y: point.y }; publish() }
    const leave = () => { presencePointerRef.current = undefined; publish() }
    publish(); document.addEventListener('aidcanvas:text-selection', publish); document.addEventListener('selectionchange', publish); document.addEventListener('input', publish); stage?.addEventListener('pointermove', pointer); stage?.addEventListener('pointerleave', leave)
    return () => { window.clearTimeout(timer); document.removeEventListener('aidcanvas:text-selection', publish); document.removeEventListener('selectionchange', publish); document.removeEventListener('input', publish); stage?.removeEventListener('pointermove', pointer); stage?.removeEventListener('pointerleave', leave) }
  }, [app, focused, isReadOnly, selected])

  const updateSaveState = useCallback((state: SaveState) => {
    setSaveState(state)
    const publicState: CanvasSaveStatus = state === 'saved' ? 'clean' : state
    propsRef.current.onSaveStatusChange?.(publicState)
  }, [])

  const notify = useCallback((text: string) => {
    setToast(text)
    window.setTimeout(() => setToast(''), 1800)
  }, [])

  const messages = useMemo(() => ({ ...props.messages }), [props.messages])
  const t = useMemo(() => (key: MessageKey, params?: TranslateParams) => translate(props.locale, key, params, messages), [messages, props.locale])
  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    setExtensionValues(previous => {
      const next = { ...previous }
      props.elementExtensions?.forEach(extension => {
        next[extension.type] = { ...Object.fromEntries((extension.properties || []).map(property => [property.key, property.defaultValue])), ...next[extension.type] }
      })
      return next
    })
  }, [props.elementExtensions])

  const updateSelectionPosition = useCallback(() => {
    const current = appRef.current
    const stage = stageRef.current
    if (!current || !stage) { selectionPlacementRef.current = undefined; setSelectionPosition(null); return }
    current.updateClientBounds()
    current.tree.updateClientBounds()
    if (!current.editor.list.length) { selectionPlacementRef.current = undefined; setSelectionPosition(null); return }
    const clientBounds = (item: IUI) => {
      const world = item.getBounds('render', 'world')
      const start = current.tree.getClientPointByWorld({ x: world.x, y: world.y })
      const end = current.tree.getClientPointByWorld({ x: world.x + world.width, y: world.y + world.height })
      return { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y }
    }
    const bounds = current.editor.list.map(clientBounds)
    const connectedItems = current.editor.list.some(isConnector) ? indexItems(current.tree) : undefined
    const connectedBounds = current.editor.list.flatMap(item => isConnector(item)
      ? [item.data?.sourceId, item.data?.targetId].flatMap(id => {
        const endpoint = typeof id === 'string' ? connectedItems?.get(id) : undefined
        return endpoint ? [clientBounds(endpoint)] : []
      }) : [])
    const stageBounds = stage.getBoundingClientRect()
    const left = Math.min(...bounds.map((item) => item.x))
    const right = Math.max(...bounds.map((item) => item.x + item.width))
    const selectedMap = mindMap(current.editor.list[0])
    const mapTop = selectedMap && mindNode(current.editor.list[0])?.data?.root ? current.tree.getClientPointByWorld(selectedMap.getBounds('render', 'world')).y : Infinity
    const contextBounds = [...bounds, ...connectedBounds]
    const top = Math.min(...contextBounds.map((item) => item.y), mapTop)
    const toolBounds = stage.querySelector<HTMLElement>('.toolbar-wrap')?.getBoundingClientRect()
    const leftInset = toolBounds ? Math.max(12, toolBounds.right - stageBounds.left + 12) : 12
    const availableWidth = Math.max(1, stageBounds.width - leftInset - 12)
    if (selectionActionsRef.current) selectionActionsRef.current.style.maxWidth = `${availableWidth}px`
    const barHalf = (selectionActionsRef.current?.offsetWidth || Math.min(560, availableWidth)) / 2
    const barHeight = Math.max(42, selectionActionsRef.current?.offsetHeight || 42)
    const selectedMind = mindNode(current.editor.list[0]), reserveTopPort = selectedMind && mindDirectionOf(selectedMind) === 'up'
    const reserveTableAxis = Boolean(ancestor(current.editor.list[0], 'table'))
    const above = top - stageBounds.top - barHeight - (reserveTopPort ? 80 : reserveTableAxis ? 38 : 20)
    const below = Math.max(...contextBounds.map(item => item.y + item.height)) - stageBounds.top + 20
    const centerX = (left + right) / 2 - stageBounds.left
    const layout = [barHalf, barHeight, availableWidth, stageBounds.height, leftInset].join(':')
    let placement = selectionPlacementRef.current
    if (!placement || placement.layout !== layout || placement.items.length !== current.editor.list.length || !placement.items.every((item, index) => item === current.editor.list[index])) {
      // Resolve initial tool clearance once. Keeping this offset relative to
      // the selection lets panning/zooming carry the toolbar out of the view.
      const initialX = centerX >= leftInset && centerX <= stageBounds.width - 12
        ? Math.max(barHalf + leftInset, Math.min(stageBounds.width - barHalf - 12, centerX)) : centerX
      placement = { items: [...current.editor.list], layout, offsetX: initialX - centerX,
        below: Boolean(connectedBounds.length || reserveTopPort || reserveTableAxis) && top >= stageBounds.top && above < 72 && below + barHeight < stageBounds.height - 72 }
      selectionPlacementRef.current = placement
    }
    const position = { x: centerX + placement.offsetX, y: placement.below ? below : above }
    if (selectionActionsRef.current) {
      selectionActionsRef.current.style.left = `${position.x}px`
      selectionActionsRef.current.style.top = `${position.y}px`
    }
    setSelectionPosition(position)
  }, [])

  const scheduleSelectionPosition = useCallback(() => {
    if (positionFrameRef.current !== undefined) window.cancelAnimationFrame(positionFrameRef.current)
    positionFrameRef.current = window.requestAnimationFrame(() => {
      updateSelectionPosition()
      const tree = appRef.current?.tree, host = hostRef.current
      if (tree && host) {
        host.style.backgroundPosition = `${Number(tree.x || 0) % 20}px ${Number(tree.y || 0) % 20}px`
        host.style.backgroundSize = '20px 20px'
      }
    })
  }, [updateSelectionPosition])

  const hasSelectionPosition = Boolean(selectionPosition)
  useEffect(() => {
    const bar = selectionActionsRef.current
    if (!bar) return
    const observer = new ResizeObserver(scheduleSelectionPosition)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [hasSelectionPosition, scheduleSelectionPosition])

  const applyZoomAt = useCallback((nextScale: number, origin: { x: number; y: number }) => {
    const tree = appRef.current?.tree
    if (!tree) return
    tree.zoom(Math.min(4, Math.max(0.2, nextScale)), { origin })
    setZoomPercent(Math.round(Number(tree.scale || 1) * 100))
    scheduleSelectionPosition()
  }, [scheduleSelectionPosition])

  const reconcileFrameMembership = useCallback(() => {
    const current = appRef.current
    if (!current || propsRef.current.mode === 'readonly') return
    const frames: Frame[] = []
    const visit = (items: IUI[]) => items.forEach((item) => {
      if (item.skipJSON) return
      if (item instanceof Frame && item.name === 'frame') frames.push(item)
      if ('children' in item && Array.isArray(item.children)) visit(item.children as IUI[])
    })
    visit([...current.tree.children] as IUI[])

    const candidates = new Set<IUI>([...current.tree.children] as IUI[])
    frames.forEach(frame => containerContents(frame).forEach(item => candidates.add(item)))
    movedFrameItemsRef.current.forEach((item) => candidates.add(item))
    movedFrameItemsRef.current.clear()
    let changed = false
    candidates.forEach((item) => {
      if (item.skipJSON || isContainerPart(item) || kind(item) === 'mind-node' || kind(item) === 'table-cell') return
      if (item.parent !== current.tree && !isCanvasContainer(item.parent)) return
      const bounds = item.getBounds('render', 'world')
      const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
      const target = frames
        .filter((frame) => {
          for (let node: IUI | undefined = frame; node; node = node.parent) if (node === item) return false
          const frameBounds = frame.getBounds('box', 'world')
          // Nested containers must fit completely; overlapping boards cannot form cycles.
          if (isCanvasContainer(item)) return bounds.x >= frameBounds.x && bounds.y >= frameBounds.y && bounds.x + bounds.width <= frameBounds.x + frameBounds.width && bounds.y + bounds.height <= frameBounds.y + frameBounds.height
          return center.x >= frameBounds.x && center.x <= frameBounds.x + frameBounds.width && center.y >= frameBounds.y && center.y <= frameBounds.y + frameBounds.height
        })
        .sort((a, b) => {
          const aBounds = a.getBounds('box', 'world')
          const bBounds = b.getBounds('box', 'world')
          return aBounds.width * aBounds.height - bBounds.width * bBounds.height
        })[0]
      if (target && item.parent !== target) { item.dropTo(target); changed = true }
      if (!target && isCanvasContainer(item.parent)) { item.dropTo(current.tree); changed = true }
    })
    frames.filter(isAutoLayout).reverse().forEach(frame => layoutContainer(frame, true))
    refreshConnectors(current)
    if (changed) {
      scheduleSelectionPosition()
    }
  }, [scheduleSelectionPosition])

  const snapshot = useCallback(() => {
    const tree = appRef.current?.tree
    if (tree && snapshotCacheRef.current?.tree === tree) return snapshotCacheRef.current.value
    const assign = (items: IUI[]) => items.forEach(item => {
      if (item.skipJSON) return
      if (!item.id) item.id = createElementId()
      if ('children' in item && Array.isArray(item.children)) assign(item.children as IUI[])
    })
    if (tree) assign([...tree.children])
    // Root pan/zoom/size are view state, never collaborative content.
    const value = JSON.stringify(persistedScene({ tag: 'Leafer', children: tree?.toJSON().children || [] }))
    if (tree) snapshotCacheRef.current = { tree, value }
    return value
  }, [])

  const getValue = useCallback((): CanvasValue => createDocument(JSON.parse(snapshot())), [snapshot])

  const managed = useCallback(() => Boolean(propsRef.current.hostManaged || propsRef.current.model), [])

  const hydrateResources = useCallback(async (items: IUI[]) => {
    const resolver = propsRef.current.resources?.resolveUrl
    if (!resolver) return
    const visit = async (item: IUI): Promise<void> => {
      const path = typeof item.data?.resourcePath === 'string' ? item.data.resourcePath : undefined
      if ((item.tag === 'Image' || item.name === 'image') && path) {
        const controller = new AbortController()
        uploadControllersRef.current.add(controller)
        try {
          const url = await resolver(path, { signal: controller.signal })
          if (!controller.signal.aborted && !item.destroyed && item.data?.resourcePath === path) {
            resourceMutationRef.current = true
            item.set({ url, data: { ...(item.data || {}), resourcePath: path, sourceUrl: path } } as never)
            resourceMutationRef.current = false
          }
        } catch (error) { if (!controller.signal.aborted) propsRef.current.onError?.(error) }
        finally { uploadControllersRef.current.delete(controller) }
      }
      if ('children' in item && Array.isArray(item.children)) await Promise.all((item.children as IUI[]).map(visit))
    }
    await Promise.all(items.map(visit))
  }, [])

  const emitChange = useCallback((source: 'local' | 'api' | 'remote') => {
    const value = getValue()
    lastValueRef.current = JSON.stringify(value.scene)
    propsRef.current.onChange?.(value, { source })
  }, [getValue])

  const save = useCallback(() => {
    const current = appRef.current
    if (!current) return
    if (managed()) return
    if (propsRef.current.onSaveRequest) {
      void Promise.resolve(propsRef.current.onSaveRequest(getValue())).catch(error => propsRef.current.onError?.(error))
      return
    }
    updateSaveState('saving')
    try {
      if (propsRef.current.autoSave !== false && propsRef.current.value === undefined) localStorage.setItem(propsRef.current.storageKey || CANVAS_STORAGE_KEY, JSON.stringify(getValue()))
      updateSaveState('saved')
    } catch (error) { updateSaveState('error'); propsRef.current.onError?.(error) }
  }, [getValue, managed, updateSaveState])

  const flushContent = useCallback(() => {
    window.clearTimeout(changeTimerRef.current)
    if (!appRef.current || restoringRef.current || resourceMutationRef.current) return
    if (propsRef.current.model?.isDisposed) return
    if (propsRef.current.mode === 'readonly') return
    const revisionBefore = propsRef.current.model?.revision
    textBridgeRef.current?.flush()
    const layout = (items: IUI[]) => items.forEach(item => {
      if (item.children) layout(item.children)
      if (isCanvasContainer(item) && isAutoLayout(item)) layoutContainer(item)
    })
    if (!movedFrameItemsRef.current.size) layout(appRef.current.tree.children)
    const current = snapshot()
    if (current === contentBaseRef.current) return
    const model = propsRef.current.model
    if (model) {
      const wasNativeWrite = nativeModelWriteRef.current
      nativeModelWriteRef.current = true
      try {
        const next = JSON.parse(current) as SceneNode
        // Text-session commits already carry character identities; never diff its stale DOM against the live text.
        const activeId = textBridgeRef.current?.elementId
        const find = (node: SceneNode): SceneNode | undefined => node.id === activeId ? node : node.children?.map(find).find(Boolean)
        if (activeId) {
          const target = find(next), base = find(viewBaseRef.current)
          if (target && base) {
            if (base.text === undefined) delete target.text; else target.text = base.text
            // Slate text + marks were already committed together by the text session.
            const data = { ...(target.data as Record<string, unknown> || {}) }, baseData = base.data as Record<string, unknown> | undefined
            if (baseData?.richText === undefined) delete data.richText; else data.richText = baseData.richText
            if (Object.keys(data).length || base.data) target.data = data; else delete target.data
          }
        }
        model.applyScene(next, viewBaseRef.current)
      }
      finally { nativeModelWriteRef.current = wasNativeWrite }
      viewBaseRef.current = JSON.parse(current)
    } else historyRef.current.push(current)
    contentBaseRef.current = current
    if (model && model.revision === revisionBefore) return
    setHistoryState({ canUndo: model?.canUndo ?? historyRef.current.canUndo, canRedo: model?.canRedo ?? historyRef.current.canRedo })
    updateSaveState('dirty')
    if (!model) emitChange('local')
    if (!managed()) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = window.setTimeout(save, 900) }
    scheduleSelectionPosition()
  }, [emitChange, managed, save, scheduleSelectionPosition, snapshot, updateSaveState])

  const commit = useCallback(() => {
    // Invalidate even during restore/resource projection. Several host flushes
    // between native changes should reuse one canonical serialization.
    snapshotCacheRef.current = undefined
    if (restoringRef.current || resourceMutationRef.current || !appRef.current || propsRef.current.mode === 'readonly') return
    window.clearTimeout(changeTimerRef.current)
    changeTimerRef.current = window.setTimeout(flushContent, 120)
  }, [flushContent])

  const completeCreation = useCallback(() => {
    reconcileFrameMembership()
    flushContent()
  }, [flushContent, reconcileFrameMembership])

  const completeThinking = useCallback((selection: IUI[], reveal?: IUI) => {
    const current = appRef.current
    if (!current || propsRef.current.mode === 'readonly') return
    activateTool('init')
    reconcileFrameMembership()
    current.editor.select(selection)
    refreshConnectors(current)
    flushContent()
    if (reveal?.id) window.requestAnimationFrame(() => {
      const host = hostRef.current, bounds = elementBounds(current, reveal.id!)?.bounds
      if (host && host.clientWidth <= 600 && bounds) {
        const scale = Number(current.tree.scaleX || 1), left = 80, right = 16
        const width = Math.max(100, host.clientWidth - left - right)
        const factor = Math.min(width / Math.max(1, bounds.width), (host.clientHeight - 192) / Math.max(1, bounds.height), 1 / scale)
        current.tree.set({ scaleX: scale * factor, scaleY: Number(current.tree.scaleY || 1) * factor,
          x: Number(current.tree.x || 0) * factor + left + width / 2 - (bounds.x + bounds.width / 2) * factor,
          y: Number(current.tree.y || 0) * factor + host.clientHeight / 2 - (bounds.y + bounds.height / 2) * factor })
        setZoomPercent(Math.round(scale * factor * 100)); scheduleSelectionPosition()
      } else editorHandleRef.current?.revealElements([reveal.id!], { padding: 120, maxZoom: 1 })
    })
    scheduleSelectionPosition()
  }, [activateTool, flushContent, reconcileFrameMembership, scheduleSelectionPosition])

  const completeLibraryDrag = useCallback((selection: IUI[]) => {
    setGalleryOpen(false); setStarterOpen(false); setTemplatePreview(null)
    const map = selection[0]
    completeThinking(kind(map) === 'mindmap' ? [mindNodes(map as Group).find(node => node.data?.root)!] : selection)
  }, [completeThinking])

  const insertTemplate = useCallback((type: TemplateId) => {
    const current = appRef.current, host = hostRef.current
    if (!current || !host || propsRef.current.mode === 'readonly') return
    current.editor.closeInnerEditor(); flushContent()
    const center = current.tree.getInnerPoint({ x: host.clientWidth / 2, y: host.clientHeight / 2 })
    const group = createTemplate(type, center.x, center.y, key => tRef.current(key as MessageKey))
    current.tree.add(group)
    setGalleryOpen(false); setStarterOpen(false); setTemplatePreview(null)
    completeThinking(kind(group) === 'mindmap' ? [mindNodes(group).find(node => node.data?.root)!] : [group], group)
  }, [completeThinking, flushContent])

  const changeMind = useCallback((action: 'child' | 'sibling' | 'parent' | 'collapse') => {
    const current = appRef.current
    if (!current || propsRef.current.mode === 'readonly') return
    const node = mindNode(current.editor.list[0]), group = mindMap(node)
    if (!node || !group) return
    current.editor.closeInnerEditor(); flushContent()
    if (action === 'collapse') {
      node.data = { ...node.data, collapsed: !node.data?.collapsed }; layoutMindMap(group); current.editor.select(node); flushContent()
    } else {
      const next = addMindNode(node, action, tRef.current('mind.branch'))
      if (next) { current.editor.select(next); flushContent(); scheduleSelectionPosition(); const label = labelOf(next); if (label) { current.editor.select(label); current.editor.openInnerEditor(label, true) } }
    }
    scheduleSelectionPosition()
  }, [flushContent, scheduleSelectionPosition])

  const changeMindLayout = useCallback((layout: MindLayout) => {
    const current = appRef.current, group = mindMap(current?.editor.list[0])
    if (!current || !group || propsRef.current.mode === 'readonly') return
    current.editor.closeInnerEditor(); flushContent(); mindNodes(group).forEach(node => { const data = { ...node.data }; delete data.mindDirection; delete data.mindOffset; node.data = data }); group.data = { ...group.data, layout }; layoutMindMap(group); refreshConnectors(current); flushContent(); scheduleSelectionPosition()
  }, [flushContent, scheduleSelectionPosition])

  const changeMindTheme = useCallback((theme: MindTheme) => {
    const current = appRef.current, group = mindMap(current?.editor.list[0])
    if (!current || !group || propsRef.current.mode === 'readonly') return
    current.editor.closeInnerEditor(); flushContent(); setMindTheme(group, theme); flushContent(); setSelected([...current.editor.list])
  }, [flushContent])

  const changeThinkingStyle = useCallback((key: string, value: string | number) => {
    const current = appRef.current
    if (!current || propsRef.current.mode === 'readonly') return
    current.editor.closeInnerEditor(); flushContent()
    current.editor.list.forEach(item => {
      const node = mindNode(item) || ancestor(item, 'diagram-node') || ancestor(item, 'table-cell') || ancestor(item, 'note') || ancestor(item, 'card')
      const label = item instanceof LeaferText ? item : node ? labelOf(node) : labelOf(item)
      if (key === 'notePreset') { applyNotePreset(item, String(value)); setStyleParamsToLocalStorage({ ...getStyleParamsFromLocalStorage(), notePreset: value }); return }
      if (kind(item) === 'table') { item.children?.forEach(cell => { if (['fill', 'stroke'].includes(key)) cell.set({ [key]: value }); else { const text = labelOf(cell); if (text) { if (key === 'textAlign') alignTextContent(text, value as 'left' | 'center' | 'right' | 'justify'); else text.set({ [key === 'fontColor' ? 'fill' : key]: value }) } } }); return }
      if (key === 'textAlign' && label) { alignTextContent(label, value as 'left' | 'center' | 'right' | 'justify'); return }
      if (key === 'resetRoute' && isConnector(item)) { const data = { ...item.data }; delete data.vertices; delete data.bend; delete data.offset; delete data.curveOffset; item.data = data; setConnectorPath(item as Path, data.from, data.to); return }
      if (['routeMode', 'startHead', 'endHead'].includes(key) && isConnector(item)) { item.data = { ...item.data, [key === 'routeMode' ? 'mode' : key]: value }; setConnectorPath(item as Path, item.data.from, item.data.to); return }
      if (key === 'lineDash') { item.dashPattern = value === 'dashed' ? [8, 5] : value === 'dotted' ? [2, 4] : undefined; return }
      if (['fontSize', 'fontWeight', 'italic', 'fontColor', 'textAlign', 'verticalAlign'].includes(key) && label) label.set({ [key === 'fontColor' ? 'fill' : key]: value })
      else if (node && kind(node) === 'diagram-node' && ['fill', 'stroke'].includes(key)) node.children?.[0]?.set({ [key]: value })
      else (node || item).set({ [key]: value })
      const group = mindMap(item)
      if (group) { layoutMindMap(group); refreshMindEdges(group) }
    })
    refreshConnectors(current)
    flushContent(); setSelected([...current.editor.list]); scheduleSelectionPosition()
  }, [flushContent, scheduleSelectionPosition])

  const quickConnect = useCallback(() => {
    const current = appRef.current, source = ancestor(current?.editor.list[0], 'diagram-node')
    if (!current || !source || propsRef.current.mode === 'readonly') return
    current.editor.closeInnerEditor(); flushContent()
    const b = source.getBounds('box', 'page')
    const target = makeDiagram('rounded', b.x + b.width + 100, b.y, '', Math.max(120, b.width), b.height)
    current.tree.add(target)
    current.tree.add(makeConnector({ x: b.x + b.width, y: b.y + b.height / 2 }, { x: Number(target.x), y: Number(target.y) + Number(target.height) / 2 }, 'elbow', source.id, target.id))
    completeThinking([target])
  }, [completeThinking, flushContent])

  useEffect(() => {
    const onThinkingKey = (event: KeyboardEvent) => {
      const current = appRef.current
      if (!current || event.isComposing || propsRef.current.mode === 'readonly') return
      const target = event.target as HTMLElement
      if (!hostRef.current?.closest('.canvas-app')?.contains(target) && !(current.editor.innerEditing && target.closest('.leafer-text-editor'))) return
      if (target.closest('[role="menu"], [role="dialog"]')) return
      const editing = Boolean(current.editor.innerEditing)
      if (target.closest('button,input,textarea,[contenteditable]') && !editing) return
      const modifier = event.metaKey || event.ctrlKey
      const node = mindNode(current.editor.list[0]), group = mindMap(node)
      if (!node || !group) return
      const caretNode = window.getSelection()?.anchorNode, listBlock = (caretNode instanceof HTMLElement ? caretNode : caretNode?.parentElement)?.closest('[data-rich-block=bullet],[data-rich-block=number],[data-rich-block=task]')
      if (editing && event.key === 'Tab' && listBlock) return
      const run = (action: () => void) => { event.preventDefault(); event.stopImmediatePropagation(); action() }
      if (!modifier && event.key === 'Tab') return run(() => changeMind(event.shiftKey ? 'parent' : 'child'))
      if (!editing && !modifier && event.key === 'Enter' && !event.shiftKey) return run(() => changeMind('sibling'))
      if (modifier && event.key === '.') return run(() => changeMind('collapse'))
      if (!editing && !modifier && (event.key === ' ' || event.key === 'F2')) return run(() => { const label = labelOf(node); if (label) { current.editor.select(label); current.editor.openInnerEditor(label, true) } })
      if (!editing && !modifier && ['Backspace', 'Delete'].includes(event.key)) return run(() => { removeItems(current, [node]); current.editor.cancel(); flushContent() })
      if (!editing && !modifier && !event.altKey && event.key.startsWith('Arrow')) return run(() => {
        const nodes = mindNodes(group), parent = nodes.find(item => item.id === node.data?.parentId), children = nodes.filter(item => item.data?.parentId === node.id && item.visible !== false), siblings = nodes.filter(item => item.data?.parentId === node.data?.parentId), index = siblings.indexOf(node)
        const next = event.key === 'ArrowLeft' ? parent : event.key === 'ArrowRight' ? children[0] : siblings[index + (event.key === 'ArrowUp' ? -1 : 1)]
        if (next) current.editor.select(next)
      })
    }
    window.addEventListener('keydown', onThinkingKey, true)
    return () => window.removeEventListener('keydown', onThinkingKey, true)
  }, [changeMind, flushContent])

  const projectModel = useCallback(() => {
    const current = appRef.current, model = propsRef.current.model
    if (!current || !model || nativeModelWriteRef.current) return
    const value = model.getValue()
    const selectionIds = current.editor.list.map(x => x.id)
    restoringRef.current = true
    try {
      textBridgeRef.current?.sync()
      // Reconcile by identity: preserve the App, surviving nodes, selection and viewport.
      const existing = new Map<string, IUI>()
      const collect = (items: IUI[]) => items.forEach(item => { if (item.skipJSON) return; if (item.id) existing.set(item.id, item); if ('children' in item && Array.isArray(item.children)) collect(item.children as IUI[]) })
      collect([...current.tree.children])
      // Compare model intent with the last model projection. Native-only
      // defaults (hit testing, text layout, resolved URLs) must not be cleared
      // and reapplied to every untouched element on each remote transaction.
      const previous = new Map<string, SceneNode>()
      const collectPrevious = (nodes: SceneNode[]) => nodes.forEach(({ children, ...attrs }) => { previous.set(attrs.id!, attrs); if (children) collectPrevious(children) })
      collectPrevious((projectedModelRef.current || viewBaseRef.current).children || [])
      const used = new Set<string>()
      const changed = new Set<IUI>(), resources: IUI[] = []
      const reconcile = (parent: typeof current.tree | Group | Frame, nodes: SceneNode[]) => nodes.forEach((node, index) => {
        const { children, ...attrs } = node
        let item = existing.get(node.id!)
        if (item && node.id === textBridgeRef.current?.elementId && textBridgeRef.current?.isComposing) attrs.text = (item as LeaferText).text
        if (!item || item.tag !== node.tag) {
          item?.remove()
          parent.addAt(attrs as never, index)
          item = parent.children[index] as IUI
          changed.add(item)
          if (item.tag === 'Image' || item.name === 'image') resources.push(item)
        } else {
          const old = previous.get(node.id!) || item.toJSON() as Record<string, unknown>
          const patch: Record<string, unknown> = {}
          Object.keys(old).forEach(k => { if (!['children', 'id', 'tag'].includes(k) && !(k in attrs)) patch[k] = undefined })
          Object.entries(attrs).forEach(([k, v]) => { if (!['id', 'tag'].includes(k) && JSON.stringify(old[k]) !== JSON.stringify(v)) patch[k] = v })
          const oldPath = (old.data as Record<string, unknown> | undefined)?.resourcePath
          const path = (attrs.data as Record<string, unknown> | undefined)?.resourcePath
          // Resolved URLs stay in this view until the stable resource changes.
          if (path && path === oldPath && (item as LeaferImage).url) delete patch.url
          if (Object.keys(patch).length) { item.set(patch as never); changed.add(item) }
          if (path && path !== oldPath) resources.push(item)
          if (item.parent !== parent || parent.children[index] !== item) parent.addAt(item, index)
        }
        used.add(node.id!)
        if (children?.length && (item instanceof Group || item instanceof Frame)) reconcile(item, children)
      })
      const projection = renderScene(value.scene)
      reconcile(current.tree, projection.children || [])
      projectedModelRef.current = projection
      existing.forEach((item, id) => { if (!used.has(id)) item.remove() })
      normalizeSelectableItems([...changed], false)
      textBridgeRef.current?.sync()
      const editingCell = ancestor((current.editor.innerEditor as unknown as { editTarget?: IUI } | undefined)?.editTarget, 'table-cell')
      if (current.editor.innerEditing && editingCell?.data?.coveredBy) current.editor.closeInnerEditor()
      const selectionIndex = selectionIds.length > 1 ? indexItems(current.tree) : undefined
      const selectedItem = (id: string) => selectionIndex ? selectionIndex.get(id) : findItem(current.tree, id)
      const selection = [...new Set(selectionIds.map(id => {
        const item = selectedItem(id!), cell = ancestor(item, 'table-cell')
        return cell?.data?.coveredBy ? selectedItem(String(cell.data.coveredBy)) : item
      }).filter((x): x is IUI => Boolean(x)))]
      if (selection.length !== current.editor.list.length || selection.some((item, index) => item !== current.editor.list[index])) {
        if (selection.length) current.editor.select(selection)
        else current.editor.cancel()
      }
      setSelected(selection)
      contentBaseRef.current = snapshot(); viewBaseRef.current = JSON.parse(contentBaseRef.current)
      lastValueRef.current = contentBaseRef.current
      setHistoryState({ canUndo: model.canUndo, canRedo: model.canRedo })
      void hydrateResources(resources)
      scheduleSelectionPosition()
    } finally { restoringRef.current = false }
  }, [hydrateResources, scheduleSelectionPosition, snapshot])

  useEffect(() => {
    const model = props.model
    if (!model || !app) return
    projectModel()
    const removeFlush = model.beforeApply(reason => {
      if (textBridgeRef.current?.isComposing && !['remote', 'sync'].includes(reason)) appRef.current?.editor.closeInnerEditor()
      flushContent()
    })
    const unsubscribe = model.subscribe(change => {
      if (nativeModelWriteRef.current) {
        projectedModelRef.current = renderScene(model.getValue().scene)
        updateSaveState('dirty')
        setHistoryState({ canUndo: model.canUndo, canRedo: model.canRedo })
        propsRef.current.onChange?.(model.getValue(), { source: change.origin })
        return
      }
      projectModel()
      propsRef.current.onChange?.(getValue(), { source: change.origin })
    })
    return () => { removeFlush(); unsubscribe() }
  }, [app, flushContent, getValue, projectModel, props.model, updateSaveState])

  const restoreSnapshot = useCallback((value: string) => {
    const current = appRef.current
    if (!current) return
    restoringRef.current = true
    // cancel() detaches the native multi-selection helper before tree.reset()
    // destroys scene children; select([]) leaves that helper attached.
    current.editor.cancel()
    const viewport = { x: current.tree.x, y: current.tree.y, scaleX: current.tree.scaleX, scaleY: current.tree.scaleY }
    current.tree.reset({ ...renderScene(JSON.parse(value)), ...viewport })
    normalizeSelectableItems([...current.tree.children] as IUI[])
    void hydrateResources([...current.tree.children] as IUI[])
    // Restoring history also restores the diff baseline. Otherwise the next
    // view/selection event records the restored scene again and discards redo.
    contentBaseRef.current = snapshot()
    viewBaseRef.current = JSON.parse(contentBaseRef.current)
    setSelected([])
    setHistoryState({ canUndo: historyRef.current.canUndo, canRedo: historyRef.current.canRedo })
    updateSaveState('dirty')
    window.setTimeout(() => { restoringRef.current = false; save() }, 0)
  }, [hydrateResources, save, snapshot, updateSaveState])

  const undo = useCallback(() => {
    if (propsRef.current.mode === 'readonly') return
    flushContent()
    if (propsRef.current.model) { propsRef.current.model.undo(); return }
    const previous = historyRef.current.undo()
    if (previous) restoreSnapshot(previous)
  }, [flushContent, restoreSnapshot])

  const redo = useCallback(() => {
    if (propsRef.current.mode === 'readonly') return
    if (propsRef.current.model) { propsRef.current.model.redo(); return }
    const next = historyRef.current.redo()
    if (next) restoreSnapshot(next)
  }, [restoreSnapshot])

  const duplicate = useCallback(() => {
    const current = appRef.current
    if (!current?.editor.list.length) return
    const sources = [...new Set(current.editor.list.map(item => mindMap(item) || item))]
    sources.filter(item => isConnector(item) && item.data?.labelId).forEach(item => { const label = findItem(current.tree, String(item.data?.labelId || '')); if (label && !sources.includes(label)) sources.push(label) })
    const cloned = cloneForInsertion({ children: sources.map(item => item.toJSON()) }).children as Record<string, unknown>[]
    const copies = cloned.map((data) => {
      data.x = Number(data.x || 0) + 16
      data.y = Number(data.y || 0) + 16
      current.tree.add(data)
      return current.tree.children[current.tree.children.length - 1]
    })
    normalizeSelectableItems(copies)
    current.editor.select(copies.map(item => kind(item) === 'mindmap' ? mindNodes(item as Group).find(node => node.data?.root)! : item))
    commit()
  }, [commit])

  const copySelection = useCallback(() => {
    const current = appRef.current, items = [...new Set((current?.editor.list || []).map(item => mindMap(item) || item))]
    items.filter(item => isConnector(item) && item.data?.labelId).forEach(item => { const label = findItem(current?.tree, String(item.data?.labelId || '')); if (label && !items.includes(label)) items.push(label) })
    clipboardRef.current = items.map((item) => toPersistedCanvasScene(item.toJSON() as SceneNode))
    return clipboardRef.current
  }, [])

  const pasteSelection = useCallback(() => {
    const current = appRef.current
    if (!current || propsRef.current.mode === 'readonly' || !clipboardRef.current.length) return
    const cloned = cloneForInsertion({ children: clipboardRef.current }).children as Record<string, unknown>[]
    const copies = cloned.map((data) => {
      data.x = Number(data.x || 0) + 16; data.y = Number(data.y || 0) + 16
      current.tree.add(renderScene(data))
      return current.tree.children[current.tree.children.length - 1]
    })
    normalizeSelectableItems(copies)
    void hydrateResources(copies)
    current.editor.select(copies.map(item => kind(item) === 'mindmap' ? mindNodes(item as Group).find(node => node.data?.root)! : item))
    commit()
  }, [commit, hydrateResources])

  const groupSelection = useCallback(() => {
    if (propsRef.current.mode === 'readonly') return
    const current = appRef.current
    const list = [...(current?.editor.list || [])]
    if (!current || list.length < 2) return
    const group = new Group({ name: 'group', editable: true, data: { title: 'Group' } })
    current.tree.add(group)
    list.forEach((item) => item.dropTo(group))
    current.editor.select(group)
    scheduleSelectionPosition()
    commit()
  }, [commit, scheduleSelectionPosition])

  const ungroupSelection = useCallback(() => {
    if (propsRef.current.mode === 'readonly') return
    const current = appRef.current
    const groups = (current?.editor.list || []).filter((item): item is Group => item instanceof Group && item.name === 'group')
    if (!current || !groups.length) return
    const released: IUI[] = []
    groups.forEach((group) => {
      const children = [...group.children]
      children.forEach((item) => { item.dropTo(current.tree); released.push(item as IUI) })
      group.remove()
    })
    current.editor.select(released)
    scheduleSelectionPosition()
    commit()
  }, [commit, scheduleSelectionPosition])

  useEffect(() => {
    if (!viewRef.current) return
    const uploadControllers = uploadControllersRef.current
    const instance = new App({
      view: viewRef.current,
      fill: 'transparent',
      editor: {
        beforeEditInner: ({ target }) => appRef.current?.editor.innerEditing && appRef.current.editor.innerEditor?.editTarget === target ? false : target.tag === 'Text' ? richContainer(target) ? 'CanvasSlateEditor' : 'CanvasPlainTextEditor' : undefined,
        buttonsDirection: 'bottom',
        buttonsFixed: true,
        rotateable: true,
        hideRotatePoints: false,
        circleDirection: 'top',
        circleMargin: 26,
        stroke: '#4b7ee2',
        circle: { pointType: 'rotate', width: 10, height: 10, fill: '#ffffff', stroke: '#4b7ee2', strokeWidth: 1.5, cornerRadius: 5 },
      },
      wheel: { preventDefault: true },
      touch: { preventDefault: true },
      pointer: { preventDefaultMenu: true },
    })
    installContainedSelection(instance)
    appRef.current = instance
    setRichExtensions(instance, () => propsRef.current.richTextExtensions || [])
    setSlateTranslator(instance, key => tRef.current(key))
    const initialModel = propsRef.current.model
    setResourceRuntime(instance, {
      canEdit: () => appRef.current === instance && initialModel === propsRef.current.model && propsRef.current.mode !== 'readonly' && !propsRef.current.model?.readOnly,
      canUpload: kind => Boolean(propsRef.current.resources?.[kind === 'image' ? 'uploadImage' : 'uploadAttachment']),
      resolve: async (path, signal) => {
        if (!propsRef.current.resources) throw new CanvasIOError('ASSET_READER_REQUIRED')
        return cancellable(Promise.resolve(propsRef.current.resources.resolveUrl(path, { signal })), signal)
      },
      download: async (resource, element) => {
        const resolver = propsRef.current.resources?.resolveDownloadUrl
        const controller = new AbortController(); uploadControllersRef.current.add(controller)
        try {
          const fileName = resource.name || resource.path.split('/').at(-1) || 'download'
          const download = async (url?: string) => {
            if (!resolver) throw new Error('DOWNLOAD_AUTHORIZATION_REQUIRED')
            const response = await fetch(url || await resolver(resource.path, { signal: controller.signal }), { signal: controller.signal })
            if (!response.ok) throw new Error('DOWNLOAD_FAILED')
            const blob = await response.blob(); controller.signal.throwIfAborted()
            const objectUrl = URL.createObjectURL(blob), anchor = document.createElement('a')
            anchor.href = objectUrl; anchor.download = fileName; anchor.click()
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
          }
          if (element && resource.kind === 'image' && propsRef.current.onImageDownload) {
            const resolve = resolver || propsRef.current.resources?.resolveUrl
            if (!resolve) throw new Error('DOWNLOAD_AUTHORIZATION_REQUIRED')
            const url = await resolve(resource.path, { signal: controller.signal })
            await propsRef.current.onImageDownload({ element, path: resource.path, fileName, url, download: () => download(url) })
          } else await download()
        } finally { uploadControllersRef.current.delete(controller) }
      },
      preview: resource => { void Promise.resolve(propsRef.current.onResourcePreview?.(resource)).catch(error => propsRef.current.onError?.(error)) },
      error: error => propsRef.current.onError?.(error),
      upload: async (file, signal, onProgress, requestedKind) => {
        const controller = new AbortController(), abort = () => controller.abort()
        signal.throwIfAborted(); signal.addEventListener('abort', abort, { once: true }); uploadControllersRef.current.add(controller)
        try {
          const kind = requestedKind || (file.type.startsWith('image/') ? 'image' : 'attachment')
          const upload = propsRef.current.resources?.[kind === 'image' ? 'uploadImage' : 'uploadAttachment']
          if (!upload) throw new CanvasIOError('ASSET_UPLOADER_REQUIRED')
          const parsed = kind === 'image' ? await parseCanvasFile(file, { signal: controller.signal, filename: file.name }) : undefined
          const result = await cancellable(upload(parsed?.resources[0].blob || file, { fileName: file.name, source: 'upload', signal: controller.signal, onProgress }), controller.signal)
          const resource = cleanResource({ ...result, id: createElementId(), kind, ...(parsed ? { width: parsed.width, height: parsed.height } : {}) })
          if (!resource) throw new CanvasIOError('INVALID_RESOURCE_PATH')
          if (appRef.current !== instance || propsRef.current.model !== initialModel) throw new CanvasIOError('EDITOR_DISPOSED')
          if (propsRef.current.mode === 'readonly' || propsRef.current.model?.readOnly) throw new CanvasIOError('READONLY')
          onProgress(1); return resource
        } finally { signal.removeEventListener('abort', abort); uploadControllersRef.current.delete(controller) }
      },
    })
    textBridgeRef.current = createTextInputBridge(instance, () => propsRef.current.model, fn => {
      const wasNativeWrite = nativeModelWriteRef.current
      nativeModelWriteRef.current = true
      try { fn() } finally { nativeModelWriteRef.current = wasNativeWrite }
    }, flushContent)
    plugins.forEach((plugin) => plugin.RegisterEvent?.({ app: instance, canEdit: () => propsRef.current.mode !== 'readonly' }))

    const initialValue = propsRef.current.model?.getValue() || propsRef.current.value || propsRef.current.defaultValue
    const stored = initialValue ? JSON.stringify(initialValue) : propsRef.current.autoSave === false || managed() ? null : localStorage.getItem(propsRef.current.storageKey || CANVAS_STORAGE_KEY)
    if (stored) {
      try {
        instance.tree.reset(renderScene(parseDocument(stored).scene) as never)
        normalizeSelectableItems([...instance.tree.children] as IUI[])
        void hydrateResources([...instance.tree.children] as IUI[])
        lastValueRef.current = JSON.stringify(instance.tree.toJSON())
      }
      catch { window.setTimeout(() => notify(tRef.current('status.localDataUnreadable')), 0) }
    }
    const lockImageRatios = (items: IUI[]) => items.forEach((item) => {
      if (item.tag === 'Image' || item.name === 'image') item.lockRatio = item.data?.imageSizeMode !== 'free'
      if ('children' in item) lockImageRatios([...(item.children as IUI[])])
    })
    lockImageRatios([...instance.tree.children])
    setZoomPercent(Math.round(Number(instance.tree.scale || 1) * 100))
    contentBaseRef.current = snapshot()
    historyRef.current.reset(contentBaseRef.current)
    viewBaseRef.current = JSON.parse(contentBaseRef.current)

    instance.editor.on(EditorEvent.SELECT, (event: EditorEvent) => {
      const list = [...event.editor.list]
      if (!list.length) selectionPlacementRef.current = undefined
      list.forEach(prepareNoteLayout)
      if (!list.length) queueMicrotask(() => {
        if (!instance.editor.list.length) { setStyleOpen(false); styleSelectionItems.current = [] }
      })
      else {
        const previous = styleSelectionItems.current
        const previousItems = new Set(previous), previousIds = new Set(previous.map(item => item.id).filter(Boolean))
        if (previous.length !== list.length || !list.every(item => previousItems.has(item) || Boolean(item.id && previousIds.has(item.id)))) setStyleOpen(false)
        styleSelectionItems.current = list
      }
      event.editor.list.forEach(item => { if (item instanceof LeaferText) enhanceRichText(item); item.children?.forEach(child => { if (child instanceof LeaferText) enhanceRichText(child) }) })
      setSelected([...event.editor.list])
      propsRef.current.onSelectionChange?.(event.editor.list.map(item => toPersistedCanvasScene(item.toJSON() as SceneNode)))
      scheduleSelectionPosition()
    })
    // Structured gestures draw their own outline; the native resize box would duplicate it.
    const nativeSelector = instance.editor.selector as EditSelect
    const hideStructuredBox = () => {
      const list = instance.editor.list
      const structured = Boolean(list.length && (list.every(item => Boolean(ancestor(item, 'table-cell')) || item.tag === 'Text' && ['note', 'card', 'diagram-node', 'mind-node'].some(type => ancestor(item, type))) || list.length === 1 && isConnector(list[0])))
      if (structured) {
        // Stroker.update() restores visible=true whenever it still owns a
        // target. Clear its render target as well as the native resize box.
        nativeSelector.targetStroker.target = []
        nativeSelector.hoverStroker.target = []
        instance.editor.editBox.visible = false
      }
    }
    instance.editor.on(EditorEvent.AFTER_SELECT, hideStructuredBox)
    instance.editor.on(InnerEditorEvent.OPEN, () => { hideStructuredBox(); setStyleOpen(false) })
    instance.editor.editBox.on(PropertyEvent.CHANGE, (event: PropertyEvent) => { if (event.target === instance.editor.editBox && event.attrName === 'visible' && instance.editor.editBox.visible) hideStructuredBox() })
    nativeSelector.targetStroker.on(PropertyEvent.CHANGE, (event: PropertyEvent) => { if (event.attrName === 'visible' && nativeSelector.targetStroker.visible) hideStructuredBox() })
    let connectorRefreshQueued = false
    const queueConnectorRefresh = () => {
      if (connectorRefreshQueued) return
      connectorRefreshQueued = true
      queueMicrotask(() => {
        connectorRefreshQueued = false
        if (appRef.current === instance) refreshConnectors(instance)
      })
    }
    instance.tree.on(PropertyEvent.CHANGE, (event: PropertyEvent) => {
      if (!restoringRef.current && !resourceMutationRef.current && propsRef.current.mode !== 'readonly') {
        const target = event.target as IUI, group = mindMap(target)
        if (isCanvasContainer(target) && ['width', 'height'].includes(event.attrName)) syncContainerGeometry(target)
        if (['text', 'data', 'width', 'height', 'fontSize', 'fontWeight', 'fontFamily', 'italic', 'lineHeight', 'textWrap'].includes(event.attrName)) fitNoteContent(target)
        if (kind(target) === 'connector-label' && ['x', 'y'].includes(event.attrName)) rememberConnectorLabelPosition(instance, target)
        if (target instanceof LeaferText && ancestor(target, 'connector-label') && ['text', 'fontSize', 'fontWeight', 'lineHeight', 'data'].includes(event.attrName)) { fitConnectorLabel(target); refreshConnectors(instance) }
        if (['text', 'fontSize', 'fontWeight', 'lineHeight'].includes(event.attrName) && group && !isMindPositioning(group)) { layoutMindMap(group); refreshConnectors(instance) }
        if (event.attrName === 'stroke' && kind(target) === 'mind-node' && group && !isMindPositioning(group)) refreshMindEdges(group)
        if (['x', 'y', 'width', 'height', 'scaleX', 'scaleY', 'rotation'].includes(event.attrName) && !['mind-edge', 'connector', 'template-edge', 'diagram-body'].includes(kind(target)) && (!group || !isMindPositioning(group))) {
          if (kind(target) === 'mind-node' && ['x', 'y'].includes(event.attrName)) syncMovedMindBranch(target as Frame)
          if (kind(target) === 'diagram-node' && ['width', 'height'].includes(event.attrName)) {
            const width = Number(target.width), height = Number(target.height)
            target.children?.[0]?.set({ width, height, path: shapePath(target.data?.shape as DiagramShape, width, height) || undefined })
            labelOf(target)?.set({ width: width - 28, height: height - 24 })
          }
          // Leafer marks the transform dirty after emitting this event.
          queueConnectorRefresh()
        }
      }
      commit()
    })
    instance.tree.on(PropertyEvent.LEAFER_CHANGE, commit)
    instance.tree.on(ChildEvent.ADD, commit)
    instance.tree.on(ChildEvent.REMOVE, commit)
    instance.editor.on(EditorMoveEvent.MOVE, () => {
      instance.editor.list.forEach(item => { const node = mindNode(item); if (node) syncMovedMindBranch(node) })
      refreshConnectors(instance)
      instance.editor.list.forEach((item) => movedFrameItemsRef.current.add(item))
      scheduleSelectionPosition()
      commit()
    })
    instance.editor.on(EditorScaleEvent.SCALE, (event: EditorScaleEvent) => {
      scheduleSelectionPosition()
      // Text resizing bakes the editor scale into fontSize. Refresh the
      // selection array so StyleEditor reads the new value during dragging.
      if (event.editor.list.some((item) => item.name === 'text')) setSelected([...event.editor.list])
      commit()
    })
    instance.editor.on(EditorRotateEvent.ROTATE, () => { scheduleSelectionPosition(); commit() })
    instance.on(MoveEvent.MOVE, scheduleSelectionPosition)
    instance.on(ZoomEvent.ZOOM, scheduleSelectionPosition)
    instance.on(LeaferPointerEvent.UP, () => {
      // Custom path sizes are baked after Leafer completes its resize cycle.
      const selectedItems = [...instance.editor.list]
      window.requestAnimationFrame(() => selectedItems.forEach((item) => {
        if (item.destroyed) return
        bakeSpecialShapeScale(item)
      }))
      window.setTimeout(reconcileFrameMembership, 0)
    })
    instance.on(KeyEvent.DOWN, (event: KeyEvent) => {
      if (propsRef.current.mode === 'readonly') return
      const editingText = Boolean(instance.editor.innerEditing)
      if (!editingText && (event.code === 'Delete' || event.code === 'Backspace')) {
        removeItems(instance, [...instance.editor.list])
        instance.editor.cancel()
        commit()
      }
    })
    setApp(instance)
    return () => {
      // Native editor unload writes its final DOM text. Do this before flushing/cancelling timers.
      instance.editor.closeInnerEditor()
      flushContent()
      textBridgeRef.current?.dispose(); textBridgeRef.current = undefined
      window.clearTimeout(saveTimerRef.current)
      window.clearTimeout(changeTimerRef.current)
      if (positionFrameRef.current !== undefined) window.cancelAnimationFrame(positionFrameRef.current)
      appRef.current = null
      uploadControllers.forEach(controller => controller.abort())
      uploadControllers.clear()
      instance.destroy()
    }
  }, [commit, flushContent, hydrateResources, managed, notify, reconcileFrameMembership, scheduleSelectionPosition, snapshot])

  useEffect(() => {
    if (!props.value || !appRef.current || propsRef.current.model) return
    const serialized = JSON.stringify(props.value.scene)
    if (serialized === lastValueRef.current) return
    restoringRef.current = true
    appRef.current.editor.cancel()
    appRef.current.tree.reset({ ...renderScene(props.value.scene), x: appRef.current.tree.x, y: appRef.current.tree.y, scaleX: appRef.current.tree.scaleX, scaleY: appRef.current.tree.scaleY })
    normalizeSelectableItems([...appRef.current.tree.children] as IUI[])
    void hydrateResources([...appRef.current.tree.children] as IUI[])
    historyRef.current.reset(snapshot())
    setSelected([])
    lastValueRef.current = serialized
    window.setTimeout(() => { restoringRef.current = false }, 0)
  }, [hydrateResources, props.value, snapshot])

  useEffect(() => {
    if (!app) return
    propsRef.current.model?.setReadOnly(isReadOnly)
    if (isReadOnly) {
      setActiveKey('init'); app.mode = 'normal'; app.editor.closeInnerEditor()
      setImageEditorTarget(null); setShapeEditorTarget(null)
      setShapesOpen(false); setGalleryOpen(false); setStyleOpen(false)
      uploadControllersRef.current.forEach(c => c.abort())
      propsRef.current.onPresenceChange?.(null)
    }
    app.editor.config = {
      ...app.editor.config,
      moveable: !isReadOnly,
      resizeable: !isReadOnly,
      rotateable: !isReadOnly,
      keyEvent: !isReadOnly,
      editBox: !isReadOnly,
      openInner: isReadOnly ? false as never : 'double',
    }
  }, [app, isReadOnly])

  useEffect(() => {
    const host = hostRef.current, stage = stageRef.current
    if (!host || !stage || !app) return
    const onPointerDown = (event: PointerEvent) => {
      if (activeKey !== 'hand' && !panRef.current.space) return
      panRef.current = { ...panRef.current, active: true, x: event.clientX, y: event.clientY }
      host.setPointerCapture(event.pointerId)
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!panRef.current.active) return
      const moveX = event.clientX - panRef.current.x
      const moveY = event.clientY - panRef.current.y
      panRef.current.x = event.clientX
      panRef.current.y = event.clientY
      app.tree.x = (app.tree.x || 0) + moveX
      app.tree.y = (app.tree.y || 0) + moveY
      scheduleSelectionPosition()
      event.stopImmediatePropagation()
    }
    const onPointerUp = (event: PointerEvent) => {
      if (!panRef.current.active) return
      panRef.current.active = false
      event.stopImmediatePropagation()
    }
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const currentScale = Number(app.tree.scale || 1)
      const nextScale = Math.min(4, Math.max(0.2, currentScale * Math.exp(-event.deltaY * 0.002)))
      const bounds = host.getBoundingClientRect()
      applyZoomAt(nextScale, { x: event.clientX - bounds.left, y: event.clientY - bounds.top })
    }
    const releaseWheelBoundary = installCanvasWheelBoundary(stage.closest<HTMLElement>('.canvas-app')!)
    host.addEventListener('pointerdown', onPointerDown, true)
    host.addEventListener('pointermove', onPointerMove, true)
    host.addEventListener('pointerup', onPointerUp, true)
    host.addEventListener('pointercancel', onPointerUp, true)
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      host.removeEventListener('pointerdown', onPointerDown, true)
      host.removeEventListener('pointermove', onPointerMove, true)
      host.removeEventListener('pointerup', onPointerUp, true)
      host.removeEventListener('pointercancel', onPointerUp, true)
      host.removeEventListener('wheel', onWheel)
      releaseWheelBoundary()
    }
  }, [activeKey, app, applyZoomAt, scheduleSelectionPosition])

  useEffect(() => {
    const encodeSelection = () => {
      const elements = copySelection()
      return elements.length ? JSON.stringify({ format: CANVAS_CLIPBOARD_FORMAT, version: 1, elements }) : undefined
    }
    const isCanvasEvent = (event: Event) => {
      const target = event.target
      return target instanceof Element && target.closest('.canvas-app') === stageRef.current?.closest('.canvas-app') &&
        !target.closest('input, textarea, [contenteditable="true"]') && !appRef.current?.editor.innerEditing
    }
    const onCopy = (event: ClipboardEvent) => {
      if (event.defaultPrevented || !event.clipboardData || !isCanvasEvent(event)) return false
      const content = encodeSelection()
      if (!content) return false
      event.clipboardData.setData(CANVAS_CLIPBOARD_TYPE, content)
      event.clipboardData.setData('text/plain', content)
      event.preventDefault()
      return true
    }
    const onCut = (event: ClipboardEvent) => {
      if (propsRef.current.mode === 'readonly' || !onCopy(event)) return
      if (appRef.current) removeItems(appRef.current, [...appRef.current.editor.list])
      appRef.current?.editor.cancel()
      commit()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isCanvasEvent(event)) return
      if ((event.target as HTMLElement).closest('[role="menu"], [role="dialog"]')) return
      const modifier = event.metaKey || event.ctrlKey
      const nativeModifier = /Mac|iPhone|iPad/.test(navigator.platform) ? event.metaKey : event.ctrlKey
      const key = event.key.toLowerCase()
      if (!modifier && (key === '?' || event.shiftKey && key === '/')) { event.preventDefault(); setShortcutsOpen(open => !open); return }
      if (!modifier && event.shiftKey && event.code === 'Digit1') { event.preventDefault(); fitView(); return }
      if (!modifier && event.shiftKey && event.code === 'Digit2') { event.preventDefault(); fitView(true); return }
      if (!modifier && key === "'") { event.preventDefault(); setGrid(value => !value); return }
      // Also support the alternate platform modifier (Ctrl on macOS, Cmd on
      // Windows), for which the browser does not emit a native clipboard event.
      if (modifier && !nativeModifier && key === 'c') {
        const content = encodeSelection()
        if (content) { event.preventDefault(); void navigator.clipboard?.writeText(content).catch(() => {}) }
      }
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault()
        panRef.current.space = true
        stageRef.current?.classList.add('is-panning')
      }
      if (propsRef.current.mode === 'readonly') {
        if (modifier && key === 'a') { event.preventDefault(); appRef.current?.editor.select((appRef.current?.tree.children || []).filter(item => !item.skipJSON)) }
        return
      }
      if (modifier && !nativeModifier && key === 'v' && clipboardRef.current.length) { event.preventDefault(); pasteSelection() }
      if (modifier && !nativeModifier && key === 'x') {
        const content = encodeSelection()
        if (content) {
          event.preventDefault()
          void navigator.clipboard?.writeText(content).catch(() => {})
          if (appRef.current) removeItems(appRef.current, [...appRef.current.editor.list])
          appRef.current?.editor.cancel()
          commit()
        }
      }
      if (modifier && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
      if (modifier && key === 'd') { event.preventDefault(); duplicate() }
      if (modifier && key === 'g') { event.preventDefault(); if (event.shiftKey) ungroupSelection(); else groupSelection() }
      if (modifier && key === 's') { event.preventDefault(); save() }
      if (modifier && key === 'o') { event.preventDefault(); propsRef.current.onImportRequest?.() }
      if (!modifier && key === 'i') propsRef.current.onImportRequest?.()
      // Native copy/cut/paste events carry the fragment and keep host image paste working.
      if (!modifier && key === 'enter' && appRef.current?.editor.element instanceof LeaferText) {
        event.preventDefault()
        appRef.current.editor.openInnerEditor()
      }
      if (modifier && key === 'a') { event.preventDefault(); appRef.current?.editor.select((appRef.current?.tree.children || []).filter(item => !item.skipJSON)) }
      if (!modifier && (key === 'v' || key === '1' || key === 'escape')) activateTool('init')
      if (!modifier && key === 'h') activateTool('hand')
      if (!modifier && ['r', 's', 'o', 'd'].includes(key)) { activateTool(`diagram:${({ r: 'rounded', s: 'rect', o: 'ellipse', d: 'diamond' } as Record<string, string>)[key]}`); return }
      if (!modifier && key === 'a') { activateTool(`connector:${getStyleParamsFromLocalStorage().connectorMode || 'elbow'}`); return }
      if (!modifier && key === 'm') { event.preventDefault(); setShapesOpen(open => !open); return }
      if (modifier && key === '0') { event.preventDefault(); const host = hostRef.current; applyZoomAt(1, { x: (host?.clientWidth || 0) / 2, y: (host?.clientHeight || 0) / 2 }); return }
      if (modifier && ['b', 'i', 'u'].includes(key)) {
        event.preventDefault()
        const item = appRef.current?.editor.list[0], node = item && (mindNode(item) || ancestor(item, 'diagram-node')), label = item instanceof LeaferText ? item : node ? labelOf(node) : undefined
        if (label) { if (key === 'b') changeThinkingStyle('fontWeight', Number(label.fontWeight) >= 600 ? 400 : 700); if (key === 'i') changeThinkingStyle('italic', label.italic ? 0 : 1); if (key === 'u') { label.textDecoration = label.textDecoration === 'under' ? 'none' : 'under'; commit() } }
        return
      }
      const tool = plugins.find((plugin) => plugin.shortcut === key)
      if (!modifier && tool) activateTool(tool.name)
      const extensionTool = propsRef.current.elementExtensions?.find(extension => extension.shortcut?.toLowerCase() === key)
      if (!modifier && extensionTool) activateTool(extensionTool.type)
      if (!modifier && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        appRef.current?.editor.list.forEach((item) => {
          if (key === 'arrowup') item.y = (item.y || 0) - step
          if (key === 'arrowdown') item.y = (item.y || 0) + step
          if (key === 'arrowleft') item.x = (item.x || 0) - step
          if (key === 'arrowright') item.x = (item.x || 0) + step
        })
        commit()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      panRef.current.space = false
      panRef.current.active = false
      stageRef.current?.classList.remove('is-panning')
    }
    const onPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || event.clipboardData?.files.length || !isCanvasEvent(event) || propsRef.current.mode === 'readonly') return
      const content = event.clipboardData?.getData(CANVAS_CLIPBOARD_TYPE) || event.clipboardData?.getData('text/plain')
      if (!content) return
      try {
        const fragment = JSON.parse(content)
        if (fragment.format !== CANVAS_CLIPBOARD_FORMAT || fragment.version !== 1 || !Array.isArray(fragment.elements) || !fragment.elements.length) return
        if (!fragment.elements.every((item: Record<string, unknown>) => item && typeof item.tag === 'string')) return
        clipboardRef.current = fragment.elements
        event.preventDefault()
        pasteSelection()
      } catch { /* Other clipboard text belongs to the host or native text editor. */ }
    }
    window.addEventListener('copy', onCopy)
    window.addEventListener('cut', onCut)
    window.addEventListener('paste', onPaste)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('copy', onCopy); window.removeEventListener('cut', onCut); window.removeEventListener('paste', onPaste); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) }
  }, [activateTool, applyZoomAt, changeThinkingStyle, commit, copySelection, duplicate, fitView, groupSelection, pasteSelection, redo, save, undo, ungroupSelection])

  useEffect(() => {
    if (managed()) return
    const onBeforeUnload = () => save()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [managed, save])

  const zoom = (type: 'in' | 'out' | 'reset') => {
    const tree = appRef.current?.tree
    if (!tree) return
    const host = hostRef.current
    const origin = { x: (host?.clientWidth || 0) / 2, y: (host?.clientHeight || 0) / 2 }
    if (type === 'reset') {
      tree.zoom(1, { origin })
    } else {
      const currentScale = Number(tree.scale || 1)
      const nextScale = type === 'in'
        ? Math.min(4, currentScale * 1.2)
        : Math.max(0.2, currentScale / 1.2)
      tree.zoom(nextScale, { origin })
    }
    window.requestAnimationFrame(() => {
      setZoomPercent(Math.round(Number(tree.scale || 1) * 100))
      scheduleSelectionPosition()
    })
  }

  const removeSelection = useCallback(() => {
    if (propsRef.current.mode === 'readonly') return
    if (appRef.current) removeItems(appRef.current, [...appRef.current.editor.list])
    appRef.current?.editor.cancel()
    commit()
  }, [commit])

  const reorderSelection = (mode: 'top' | 'up' | 'down' | 'bottom') => {
    const selectedItems = appRef.current?.editor.list || []
    const selectedSet = new Set(selectedItems)
    const parents = [...new Set(selectedItems.map((item) => item.parent).filter(Boolean))]
    parents.forEach((parent) => {
      if (!parent || !('children' in parent) || !('add' in parent)) return
      const original = [...parent.children] as IUI[]
      let ordered = [...original]
      if (mode === 'top') ordered = [...original.filter((item) => !selectedSet.has(item)), ...original.filter((item) => selectedSet.has(item))]
      if (mode === 'bottom') ordered = [...original.filter((item) => selectedSet.has(item)), ...original.filter((item) => !selectedSet.has(item))]
      if (mode === 'up') {
        for (let index = ordered.length - 2; index >= 0; index -= 1) {
          if (selectedSet.has(ordered[index]) && !selectedSet.has(ordered[index + 1])) [ordered[index], ordered[index + 1]] = [ordered[index + 1], ordered[index]]
        }
      }
      if (mode === 'down') {
        for (let index = 1; index < ordered.length; index += 1) {
          if (selectedSet.has(ordered[index]) && !selectedSet.has(ordered[index - 1])) [ordered[index], ordered[index - 1]] = [ordered[index - 1], ordered[index]]
        }
      }
      ordered.forEach((item) => parent.add(item))
    })
    commit()
  }

  const createFrameFromSelection = () => {
    const current = appRef.current
    const list = [...(current?.editor.list || [])]
    if (!current || !list.length || list.some((item) => item.name === 'frame')) return
    const bounds = list.map((item) => item.getBounds('render', 'page'))
    const left = Math.min(...bounds.map((item) => item.x)) - 28
    const top = Math.min(...bounds.map((item) => item.y)) - 28
    const right = Math.max(...bounds.map((item) => item.x + item.width)) + 28
    const bottom = Math.max(...bounds.map((item) => item.y + item.height)) + 28
    const frame = makeContainer('section', { x: left, y: top, width: right - left, height: bottom - top }, tRef.current)
    current.tree.addAt(frame, 0)
    list.forEach((item) => item.dropTo(frame))
    current.editor.select(frame)
    commit()
  }

  const releaseSelectedFrames = () => {
    const current = appRef.current
    if (!current) return
    const frames = current.editor.list.filter((item): item is Frame => item instanceof Frame && item.name === 'frame')
    if (!frames.length) return
    const released: IUI[] = []
    frames.forEach((frame) => {
      ;([...frame.children] as IUI[]).forEach((item) => {
        if (isContainerPart(item)) { item.remove(); return }
        item.dropTo(current.tree)
        released.push(item)
      })
      frame.remove()
    })
    current.editor.select(released)
    scheduleSelectionPosition()
    commit()
  }

  const insertImageFile = useCallback(async (file: Blob, options: CanvasInsertOptions = {}): Promise<CanvasInsertResult> => {
    if (propsRef.current.mode === 'readonly') throw new CanvasIOError('READONLY')
    const owner = appRef.current, model = propsRef.current.model, resources = propsRef.current.resources, stage = stageRef.current
    if (!owner || !stage) throw new CanvasIOError('EDITOR_NOT_READY')
    if (!resources?.uploadImage) throw new CanvasIOError('ASSET_UPLOADER_REQUIRED')
    const controller = new AbortController(), abort = () => controller.abort()
    checkAbort(options.signal); options.signal?.addEventListener('abort', abort, { once: true })
    uploadControllersRef.current.add(controller)
    const operation = { ...options, signal: controller.signal }
    // Capture destination before async work; pointer movement or viewport panning cannot redirect insertion.
    const viewport = hostRef.current || stage, center = owner.tree.getInnerPoint({ x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 })
    try {
      const parsed = await parseCanvasFile(file, operation)
      for (const key of ['x', 'y', 'width', 'height'] as const) if (options[key] !== undefined && (!Number.isFinite(options[key]) || (key === 'width' || key === 'height') && options[key]! <= 0)) throw new CanvasIOError('INVALID_INSERT_BOUNDS')
      progress(operation, 'upload', 0)
      const resource = await cancellable(resources.uploadImage(parsed.resources[0].blob, { fileName: parsed.filename, source: 'api', signal: controller.signal, onProgress: value => progress(operation, 'upload', value) }), controller.signal)
      checkAbort(controller.signal)
      const value = createCanvasImportValue(parsed, { [parsed.resources[0].id]: resource.path })
      await cancellable(Promise.resolve(resources.resolveUrl(resource.path, { signal: controller.signal })), controller.signal)
      progress(operation, 'upload', 1)
      if (owner !== appRef.current || model !== propsRef.current.model) throw new CanvasIOError('EDITOR_DISPOSED')
      if (String(propsRef.current.mode) === 'readonly' || model?.readOnly) throw new CanvasIOError('READONLY')
      const explicitSize = options.width !== undefined || options.height !== undefined
      const fit = Math.min((options.width ?? (explicitSize ? Infinity : Math.min(480, stage.clientWidth * 0.55))) / parsed.width, (options.height ?? (explicitSize ? Infinity : Math.min(360, stage.clientHeight * 0.55))) / parsed.height, explicitSize ? Infinity : 1)
      const width = parsed.width * fit, height = parsed.height * fit
      const element = { ...value.scene.children![0], width, height, x: options.x ?? center.x - width / 2, y: options.y ?? center.y - height / 2 }
      // Flush earlier native edits separately. The insertion itself is exactly one synchronous transaction.
      flushContent()
      if (model) model.add(element)
      else { owner.tree.add(renderScene(element) as IUIJSONData); normalizeSelectableItems([...owner.tree.children]); flushContent(); void hydrateResources([...owner.tree.children]) }
      if (options.select !== false) owner.editor.select(findItem(owner.tree, element.id!) || [])
      setActiveKey('init')
      return { elementId: element.id!, element, warnings: parsed.warnings }
    } finally { options.signal?.removeEventListener('abort', abort); uploadControllersRef.current.delete(controller) }
  }, [flushContent, hydrateResources])

  const insertCanvasResource = useCallback((resource: CanvasResource, point: { x: number; y: number }, source?: { elementId: string; resourceId: string }) => {
    const current = appRef.current, model = propsRef.current.model
    if (!current || propsRef.current.mode === 'readonly' || model?.readOnly) return null
    const width = resource.kind === 'image' ? Math.min(480, resource.width || 320) : 280, height = resource.kind === 'image' ? width * (resource.height || 240) / (resource.width || 320) : 76
    const element: SceneNode = resource.kind === 'image'
      ? { tag: 'Image', id: createElementId(), name: 'image', editable: true, x: point.x, y: point.y, width, height, url: resource.path, data: { resourcePath: resource.path, sourceUrl: resource.path, fileName: resource.name || '', fileSize: resource.size || 0, mimeType: resource.mimeType || '' } }
      : { tag: 'Frame', id: createElementId(), name: 'attachment', x: point.x, y: point.y, width, height, editable: true, hitChildren: false, fill: '#ffffff', stroke: '#d9dfe8', cornerRadius: 8, data: { kind: 'attachment', resource }, children: [
        { id: createElementId(), tag: 'Rect', x: 12, y: 14, width: 40, height: 48, fill: '#eaf0ff', cornerRadius: 6 },
        { id: createElementId(), tag: 'Text', x: 16, y: 29, width: 32, textAlign: 'center', fontSize: 10, fill: '#3370ff', text: resource.name?.split('.').at(-1)?.slice(0, 4).toUpperCase() || 'FILE' },
        { id: createElementId(), tag: 'Text', x: 64, y: 16, width: 204, height: 23, textOverflow: 'ellipsis', fontSize: 14, fill: '#1f2329', text: resource.name || resource.path },
        { id: createElementId(), tag: 'Text', x: 64, y: 42, fontSize: 12, fill: '#8f959e', text: resource.size === undefined ? '' : `${Math.ceil(resource.size / 1024)} KB` },
      ] }
    flushContent()
    if (source) {
      const label = findItem(current.tree, source.elementId) as LeaferText | undefined
      if (!label) return null
      const value = readRich(label), index = value.findIndex(p => p.resource?.id === source.resourceId)
      if (index < 0 || value[index].resource?.path !== resource.path) return null
      value.splice(index, 1); if (!value.length) value.push({ type: 'paragraph', children: [{ text: '' }] })
      const data = { ...label.data, richText: { version: 1, value } }, text = plainText(value)
      if (model) {
        const base = model.getValue().scene, next = structuredClone(base)
        const visit = (node: SceneNode): void => { if (node.id === source.elementId) { node.text = text; node.data = data }; node.children?.forEach(visit) }
        visit(next); next.children!.push(element); model.applyScene(next, base)
      } else { label.data = data; label.text = text; current.tree.add(renderScene(element) as IUIJSONData); normalizeSelectableItems([...current.tree.children]); flushContent(); void hydrateResources([...current.tree.children]) }
    } else if (model) model.add(element)
    else { current.tree.add(renderScene(element) as IUIJSONData); normalizeSelectableItems([...current.tree.children]); flushContent(); void hydrateResources([...current.tree.children]) }
    current.editor.select(findItem(current.tree, element.id!) || []); setActiveKey('init')
    return element
  }, [flushContent, hydrateResources])

  const extractCanvasResource = useCallback((source: { elementId: string; resourceId: string }, point: { x: number; y: number }) => {
    const current = appRef.current
    if (!current || propsRef.current.mode === 'readonly' || propsRef.current.model?.readOnly) return
    const label = findItem(current.tree, source.elementId) as LeaferText | undefined
    if (!label || label.tag !== 'Text') return
    const owner = ancestor(label, 'note') || ancestor(label, 'card') || ancestor(label, 'table')
    const bounds = owner?.getBounds('box', 'page')
    if (bounds && point.x >= bounds.x && point.y >= bounds.y && point.x <= bounds.x + bounds.width && point.y <= bounds.y + bounds.height) return
    current.editor.closeInnerEditor(); flushContent()
    const resource = readRich(label).find(p => p.resource?.id === source.resourceId)?.resource
    if (resource) insertCanvasResource(resource, point, source)
  }, [flushContent, insertCanvasResource])

  const insertAttachmentFile = useCallback(async (file: Blob, options: CanvasInsertOptions = {}): Promise<CanvasInsertResult> => {
    const owner = appRef.current, runtime = resourceRuntime(owner)
    if (!owner || !runtime) throw new CanvasIOError('EDITOR_NOT_READY')
    if (!runtime.canEdit()) throw new CanvasIOError('READONLY')
    const viewport = hostRef.current!.getBoundingClientRect(), center = owner.tree.getInnerPoint(owner.tree.getWorldPointByClient({ clientX: viewport.left + viewport.width / 2, clientY: viewport.top + viewport.height / 2 }))
    const resource = await runtime.upload(file instanceof File ? file : new File([file], options.filename || 'attachment', { type: file.type }), options.signal || new AbortController().signal, value => progress(options, 'upload', value))
    const element = insertCanvasResource(resource, { x: options.x ?? center.x - 140, y: options.y ?? center.y - 38 })
    if (!element) throw new CanvasIOError('READONLY')
    return { elementId: element.id!, element, warnings: [] }
  }, [insertCanvasResource])

  const exportFile = useCallback(async (options: CanvasExportOptions): Promise<CanvasExportResult> => {
    const owner = appRef.current
    if (!owner) throw new CanvasIOError('EDITOR_NOT_READY')
    // Never flush as a side effect of export. Host may finish editing/flush explicitly before calling.
    const scene = persistedScene({ tag: 'Leafer', children: owner.tree.toJSON().children || [] })
    if (owner.editor.innerEditing || JSON.stringify(scene) !== contentBaseRef.current) throw new CanvasIOError('PENDING_LOCAL_EDITS', 'Finish the active edit before exporting')
    const controller = new AbortController(), abort = () => controller.abort()
    checkAbort(options.signal); options.signal?.addEventListener('abort', abort, { once: true }); uploadControllersRef.current.add(controller)
    try {
      return await exportCanvasFile({ scene: propsRef.current.model?.getValue().scene || scene }, { ...options, signal: controller.signal, elementIds: owner.editor.list.map(n => n.id!), readAsset: options.readAsset || propsRef.current.resources?.readImage })
    } finally { options.signal?.removeEventListener('abort', abort); uploadControllersRef.current.delete(controller) }
  }, [])

  const addImageSource = useCallback(async (input: string, options: AddImageOptions = {}) => {
    if (propsRef.current.mode === 'readonly') return null
    const owner = appRef.current, model = propsRef.current.model
    const controller = new AbortController()
    uploadControllersRef.current.add(controller)
    try {
      const fileName = options.fileName || '图片.png'
      let resourcePath: string | undefined
      let url: string
      if (managed()) {
        if (!propsRef.current.resources) throw new Error('Host-managed images require resources.resolveUrl')
        resourcePath = input
        url = await propsRef.current.resources.resolveUrl(input, { signal: controller.signal })
      } else url = input
      if (controller.signal.aborted || owner !== appRef.current || model !== propsRef.current.model || String(propsRef.current.mode) === 'readonly') return null
      return await new Promise<Record<string, unknown> | null>((resolve) => {
      const source = new window.Image()
      controller.signal.addEventListener('abort', () => { source.onload = null; source.onerror = null; resolve(null) }, { once: true })
      source.onload = () => {
        const current = appRef.current
        const stage = stageRef.current
        if (!current || current !== owner || model !== propsRef.current.model || !stage || controller.signal.aborted || propsRef.current.mode === 'readonly') { resolve(null); return }

        const maxWidth = Math.min(480, stage.clientWidth * 0.55)
        const maxHeight = Math.min(360, stage.clientHeight * 0.55)
        const scale = Math.min(maxWidth / source.naturalWidth, maxHeight / source.naturalHeight, 1)
        const width = options.width || Math.max(40, Math.round(source.naturalWidth * scale))
        const height = options.height || (options.width ? options.width * source.naturalHeight / source.naturalWidth : Math.max(40, Math.round(source.naturalHeight * scale)))
        const viewport = hostRef.current || stage
        const center = current.tree.getInnerPoint({ x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 })
        const image = new LeaferImage({
          name: 'image',
          data: { fileName, naturalWidth: source.naturalWidth, naturalHeight: source.naturalHeight, sourceUrl: resourcePath || url, resourcePath },
          url,
          x: options.x ?? center.x - width / 2,
          y: options.y ?? center.y - height / 2,
          width,
          height,
          lockRatio: true,
          editable: true,
          cornerRadius: 8,
        })
        current.tree.add(image)
        if (options.select !== false) current.editor.select(image)
        setActiveKey('init')
        commit()
        resolve(image.toJSON() as Record<string, unknown>)
      }
      source.onerror = () => { notify(tRef.current('status.imageReadFailed')); resolve(null) }
      source.crossOrigin = 'anonymous'
      source.src = url
      })
    } catch (error) {
      propsRef.current.onError?.(error)
      notify(error instanceof Error ? error.message : tRef.current('status.imageSaveFailed'))
      return null
    } finally { uploadControllersRef.current.delete(controller) }
  }, [commit, managed, notify])

  const selectedImage = selected.length === 1 && (selected[0].tag === 'Image' || selected[0].name === 'image') ? selected[0] : null
  const selectedEditablePath = selected.length === 1 && ['special-shape', 'path'].includes(selected[0].name || '') ? selected[0] : null
  const getImageSource = (item: IUI) => {
    const fill = item.fill && typeof item.fill === 'object' && !Array.isArray(item.fill) ? item.fill as unknown as { url?: string } : undefined
    return String((item as unknown as { url?: string }).url || item.data?.sourceUrl || fill?.url || '')
  }
  const downloadSelectedImage = async () => {
    if (!selectedImage) return
    const resourcePath = typeof selectedImage.data?.resourcePath === 'string' ? selectedImage.data.resourcePath : undefined
    const fileName = String(selectedImage.data?.fileName || '图片.png')
    try {
      const url = resourcePath && propsRef.current.resources?.resolveDownloadUrl
        ? await propsRef.current.resources.resolveDownloadUrl(resourcePath, {})
        : getImageSource(selectedImage)
      const download = async () => {
        if (resourcePath && !propsRef.current.resources?.resolveDownloadUrl) throw new Error('资源图片下载必须由宿主授权或提供 resolveDownloadUrl')
        const response = await fetch(url)
        if (!response.ok) throw new Error('图片下载失败')
        const objectUrl = URL.createObjectURL(await response.blob())
        const anchor = document.createElement('a')
        anchor.href = objectUrl
        anchor.download = fileName
        anchor.click()
        URL.revokeObjectURL(objectUrl)
      }
      if (propsRef.current.onImageDownload) await propsRef.current.onImageDownload({ element: selectedImage.toJSON() as Record<string, unknown>, url, path: resourcePath, fileName, download })
      else await download()
    } catch (error) {
      notify(error instanceof Error ? error.message : tRef.current('status.imageDownloadFailed'))
      propsRef.current.onError?.(error)
    }
  }
  const applyImageEdit = async (result: ImageEditResult) => {
    const item = imageEditorTarget
    if (!item || item.destroyed || isReadOnly) { setImageEditorTarget(null); return }
    const owner = appRef.current, model = propsRef.current.model, pathBefore = item.data?.resourcePath
    const controller = new AbortController()
    uploadControllersRef.current.add(controller)
    try {
    let outputUrl = result.url
    let resourcePath: string | undefined
    const blob = await fetch(result.url, { signal: controller.signal }).then(response => response.blob())
    if (propsRef.current.resources?.uploadImage) {
      const resource = await propsRef.current.resources.uploadImage(blob, { fileName: String(item.data?.fileName || '编辑后的图片.png'), source: 'edit', signal: controller.signal })
      resourcePath = resource.path
      outputUrl = await propsRef.current.resources.resolveUrl(resource.path, { signal: controller.signal })
    } else if (managed()) throw new Error('Host-managed image editing requires resources.uploadImage')
    if (controller.signal.aborted || item.destroyed || item.data?.resourcePath !== pathBefore || owner !== appRef.current || model !== propsRef.current.model || propsRef.current.mode === 'readonly') return
    const currentWidth = Number(item.width || 1)
    const currentHeight = Number(item.height || 1)
    const nextHeight = currentWidth * result.height / result.width
    const imageData = {
      fileName: result.mode === 'new' ? `编辑-${item.data?.fileName || '图片.png'}` : item.data?.fileName || '编辑后的图片.png',
      naturalWidth: result.width,
      naturalHeight: result.height,
      sourceUrl: resourcePath || outputUrl,
      resourcePath,
      imageSizeMode: 'locked',
    }
    if (result.mode === 'new') {
      const created = new LeaferImage({
        name: 'image',
        url: outputUrl,
        x: Number(item.x || 0) + currentWidth + 24,
        y: Number(item.y || 0) + (currentHeight - nextHeight) / 2,
        width: currentWidth,
        height: nextHeight,
        lockRatio: true,
        editable: true,
        opacity: item.opacity,
        data: imageData,
      })
      const parent = item.parent || appRef.current?.tree
      parent?.add(created)
      appRef.current?.editor.select(created)
    } else item.set({
      url: outputUrl,
      y: Number(item.y || 0) + (currentHeight - nextHeight) / 2,
      height: nextHeight,
      lockRatio: true,
      cornerRadius: 0,
      data: imageData,
    } as never)
    setImageEditorTarget(null)
    if (result.mode === 'replace') appRef.current?.editor.select(item)
    scheduleSelectionPosition()
    commit()
    } catch (error) {
      if (!controller.signal.aborted) { propsRef.current.onError?.(error); notify(error instanceof Error ? error.message : tRef.current('status.imageEditFailed')) }
    } finally { uploadControllersRef.current.delete(controller) }
  }
  const getEditablePath = (item: IUI) => {
    if (item.name === 'path') return item.getPathString(false, false) || ''
    if (typeof item.data?.customPath === 'string') return item.data.customPath
    const preset = SPECIAL_SHAPES.find(shape => shape.type === item.data?.specialShapeType)
    if (preset) return preset.path
    const path = (item as unknown as { path?: unknown }).path
    return typeof path === 'string' ? path : ''
  }
  const applyPathEdit = (path: string) => {
    const item = shapeEditorTarget
    if (!item || item.destroyed) { setShapeEditorTarget(null); return }
    if (item.name === 'path') {
      item.set({ path, data: { ...(item.data || {}), customPath: path } } as never)
    } else {
      item.set({ path, data: { ...(item.data || {}), customPath: path, specialShapeType: undefined } } as never)
    }
    setShapeEditorTarget(null); appRef.current?.editor.select(item); scheduleSelectionPosition(); commit()
  }

  const updateSelection = useCallback((patch: Record<string, unknown>) => {
    if (propsRef.current.mode === 'readonly') return
    flushContent()
    appRef.current?.editor.list.forEach(item => {
      item.set(patch as never)

    })
    // Property events precede Leafer's matrix invalidation; refresh after the
    // complete patch so bound endpoints use the final node transforms.
    if (appRef.current) refreshConnectors(appRef.current)
    setSelected([...(appRef.current?.editor.list || [])])
    flushContent()
  }, [flushContent])

  const setValueFromApi = useCallback((value: CanvasValue) => {
    if (propsRef.current.model) throw new Error('Use model commands; replacing a live collaborative document requires a new epoch')
    const current = appRef.current
    if (!current) return
    restoringRef.current = true
    current.editor.cancel()
    current.tree.reset({ ...renderScene(value.scene), x: current.tree.x, y: current.tree.y, scaleX: current.tree.scaleX, scaleY: current.tree.scaleY })
    normalizeSelectableItems([...current.tree.children] as IUI[])
    void hydrateResources([...current.tree.children] as IUI[])
    historyRef.current.reset(snapshot())
    setSelected([])
    lastValueRef.current = JSON.stringify(value.scene)
    window.setTimeout(() => { restoringRef.current = false; emitChange('api') }, 0)
  }, [emitChange, hydrateResources, snapshot])

  const find = useCallback((query: string, options: CanvasFindOptions = {}): CanvasTextMatch[] => {
    if (propsRef.current.model) {
      flushContent()
      return propsRef.current.model.find(query, options).map(m => ({ ...m, id: `${m.elementId}:${m.start}`, revision: String(m.revision) }))
    }
    if (!query || !appRef.current) return []
    const revision = snapshot()
    const needle = options.caseSensitive ? query : query.toLocaleLowerCase()
    const matches: CanvasTextMatch[] = []
    const visit = (items: IUI[]) => items.forEach(item => {
      if (item instanceof LeaferText) {
        const text = String(item.text || '')
        const haystack = options.caseSensitive ? text : text.toLocaleLowerCase()
        let start = 0
        while ((start = haystack.indexOf(needle, start)) >= 0) {
          matches.push({ id: `${item.id}:${start}:${start + query.length}`, elementId: String(item.id), start, end: start + query.length, text: text.slice(start, start + query.length), revision })
          start += Math.max(query.length, 1)
        }
      }
      if ('children' in item && Array.isArray(item.children)) visit(item.children as IUI[])
    })
    visit([...appRef.current.tree.children] as IUI[])
    return matches
  }, [flushContent, snapshot])

  const revealElements = useCallback((ids: string[], options: CanvasRevealOptions = {}): CanvasRevealResult => {
    const current = appRef.current, host = hostRef.current
    const result: CanvasRevealResult = { revealed: false, elementIds: [], missingIds: [], hiddenIds: [] }
    if (!current || !host) { result.missingIds = [...ids]; return result }
    const index = ids.length > 1 ? indexItems(current.tree) : undefined
    const found = [...new Set(ids)].flatMap(id => {
      const value = elementBounds(current, id, index)
      if (!value) result.missingIds.push(id)
      else if (value.hidden || !value.bounds) result.hiddenIds.push(id)
      else { result.elementIds.push(id); return [value.bounds] }
      return []
    })
    if (!found.length || host.clientWidth <= 0 || host.clientHeight <= 0) return result
    const x = Math.min(...found.map(b => b.x)), y = Math.min(...found.map(b => b.y))
    const width = Math.max(...found.map(b => b.x + b.width)) - x, height = Math.max(...found.map(b => b.y + b.height)) - y
    const padding = Math.max(0, Math.min(options.padding ?? 48, host.clientWidth / 3, host.clientHeight / 3))
    const scale = Number(current.tree.scaleX || 1)
    const factor = Math.min((host.clientWidth - padding * 2) / Math.max(width, 1), (host.clientHeight - padding * 2) / Math.max(height, 1), Math.max(0.001, options.maxZoom ?? 1) / scale)
    if (!Number.isFinite(factor) || factor <= 0) return result
    const tree = current.tree
    // World bounds include ancestor transforms and current viewport; change only view state.
    tree.set({ scaleX: scale * factor, scaleY: Number(tree.scaleY || 1) * factor,
      x: Number(tree.x || 0) * factor + host.clientWidth / 2 - (x + width / 2) * factor,
      y: Number(tree.y || 0) * factor + host.clientHeight / 2 - (y + height / 2) * factor })
    result.revealed = true
    result.bounds = { x: host.clientWidth / 2 - width * factor / 2, y: host.clientHeight / 2 - height * factor / 2, width: width * factor, height: height * factor }
    setZoomPercent(Math.round(scale * factor * 100)); scheduleSelectionPosition()
    return result
  }, [scheduleSelectionPosition])

  const reveal = useCallback((match: CanvasTextMatch) => {
    const revision = propsRef.current.model ? String(propsRef.current.model.revision) : snapshot()
    if (match.revision !== revision) return false
    const item = findItem(appRef.current?.tree, match.elementId)
    if (!item) return false
    appRef.current?.editor.select(item)
    return revealElements([match.elementId]).revealed
  }, [revealElements, snapshot])

  const replace = useCallback((match: CanvasTextMatch, text: string) => {
    if (propsRef.current.model) { flushContent(); return propsRef.current.model.replace({ ...match, revision: Number(match.revision) }, text) }
    if (propsRef.current.mode === 'readonly' || match.revision !== snapshot()) return false
    const item = findItem(appRef.current?.tree, match.elementId)
    if (!(item instanceof LeaferText)) return false
    const current = String(item.text || '')
    if (current.slice(match.start, match.end) !== match.text) return false
    item.text = `${current.slice(0, match.start)}${text}${current.slice(match.end)}`
    commit()
    return true
  }, [commit, flushContent, snapshot])

  const replaceAll = useCallback((query: string, text: string, options: CanvasFindOptions = {}) => {
    if (propsRef.current.mode === 'readonly') return 0
    if (propsRef.current.model) { flushContent(); return propsRef.current.model.replaceAll(query, text, options) }
    const matches = find(query, options)
    const groups = new Map<string, CanvasTextMatch[]>()
    matches.forEach(match => groups.set(match.elementId, [...(groups.get(match.elementId) || []), match]))
    groups.forEach((elementMatches, id) => {
      const item = findItem(appRef.current?.tree, id)
      if (!(item instanceof LeaferText)) return
      let value = String(item.text || '')
      elementMatches.sort((a, b) => b.start - a.start).forEach(match => { value = `${value.slice(0, match.start)}${text}${value.slice(match.end)}` })
      item.text = value
    })
    if (matches.length) commit()
    return matches.length
  }, [commit, find, flushContent])

  useImperativeHandle(editorHandleRef, () => {
    const handle: CanvasEditorRef = {
    clientToScene: point => {
      const tree = appRef.current?.tree, host = hostRef.current
      if (!tree || !host) throw new CanvasIOError('EDITOR_NOT_READY')
      const bounds = host.getBoundingClientRect(), position = tree.getInnerPoint({ x: point.x - bounds.left, y: point.y - bounds.top })
      return { x: position.x, y: position.y }
    },
    undo, redo, flush: () => { if (textBridgeRef.current?.isComposing) appRef.current?.editor.closeInnerEditor(); flushContent() },
    groupSelection, ungroupSelection,
    revealElements,
    revealAnchor: (anchor, options) => {
      const resolved = propsRef.current.model?.resolveAnchor(anchor)
      const result = revealElements(resolved?.elementIds || [], options)
      result.missingIds = anchor.elementIds.filter(id => !resolved?.elementIds.includes(id))
      return result
    },
    captureAnchor: () => propsRef.current.model?.captureAnchor((appRef.current?.editor.list || []).map(x => x.id!).filter(Boolean)) || null,
    resolveAnchor: anchor => propsRef.current.model?.resolveAnchor(anchor) || { valid: false, partial: true, elementIds: [] },
    getValue,
    setValue: setValueFromApi,
    getSelection: () => (appRef.current?.editor.list || []).map(item => toPersistedCanvasScene(item.toJSON() as SceneNode)),
    select: (ids) => {
      const current = appRef.current
      if (!current) return
      const index = ids.length > 1 ? indexItems(current.tree) : undefined
      const selection = ids.map(id => index ? index.get(id) : findItem(current.tree, id)).filter((item): item is IUI => Boolean(item) && !item?.skipJSON)
      if (selection.length) current.editor.select(selection)
      else current.editor.cancel()
    },
    updateSelection,
    removeSelection,
    addElement: (element) => {
      const current = appRef.current
      if (!current || propsRef.current.mode === 'readonly') return null
      current.tree.add(renderScene(element))
      const created = current.tree.children[current.tree.children.length - 1]
      normalizeSelectableItems([created])
      refreshConnectors(current)
      void hydrateResources([created])
      current.editor.select(created)
      flushContent()
      return toPersistedCanvasScene(created.toJSON() as SceneNode) as Record<string, unknown>
    },
    addCustomShape: (type, options = {}) => {
      const current = appRef.current
      const definition = [...SPECIAL_SHAPES, ...(propsRef.current.customShapes || [])].find(shape => shape.type === type)
      if (!current || !definition || propsRef.current.mode === 'readonly') return null
      const source = new Path({ path: definition.path })
      const sourceBounds = source.getBounds('box', 'inner')
      const width = options.width || 100, height = options.height || 100
      current.tree.add({
        tag: 'Path', name: 'special-shape', editable: true,
        path: fitSpecialPath(definition.path, sourceBounds, width, height), x: options.x || 0, y: options.y || 0,
        scaleX: 1, scaleY: 1,
        data: { specialShapeType: definition.type, customPath: definition.path },
      } as never)
      const created = current.tree.children[current.tree.children.length - 1]
      current.editor.select(created); flushContent()
      return created.toJSON() as Record<string, unknown>
    },
    addExtensionElement: (type, bounds = { x: 0, y: 0, width: 100, height: 100 }) => {
      const current = appRef.current
      const extension = propsRef.current.elementExtensions?.find(item => item.type === type)
      if (!current || !extension || propsRef.current.mode === 'readonly') return null
      current.tree.add(extension.create({ bounds, properties: extensionValuesRef.current[type] || {} }) as never)
      const created = current.tree.children[current.tree.children.length - 1]
      created.name = type; created.data = { ...created.data, canvasExtension: type }; created.editable = true; current.editor.select(created); flushContent()
      return created.toJSON() as Record<string, unknown>
    },
    addImage: addImageSource,
    insertImageFile, insertAttachmentFile,
    exportFile,
    find,
    reveal,
    replace,
    replaceAll,
    insertRichTextElement: (type, data) => {
      const current = appRef.current
      if (!current || propsRef.current.mode === 'readonly' || propsRef.current.model?.readOnly || !current.editor.innerEditing) return false
      return (current.editor.innerEditor as unknown as { insertCustom?: (type: string, data?: import('../../model').Json) => boolean }).insertCustom?.(type, data) || false
    },
    capabilities: { find: true, replace: true, resources: Boolean(propsRef.current.resources), collaborationCodec: propsRef.current.model ? 'aidcanvas-yjs' : 'none', anchors: Boolean(propsRef.current.model), presence: true, anchorDecorations: Boolean(propsRef.current.model), revealElements: true, textRangeAnchors: false, characterPresence: Boolean(propsRef.current.model) },
    }
    editorHandleRef.current = handle
    return handle
  }, [addImageSource, insertAttachmentFile, insertImageFile, exportFile, find, flushContent, getValue, groupSelection, hydrateResources, redo, removeSelection, replace, replaceAll, reveal, revealElements, setValueFromApi, undo, ungroupSelection, updateSelection])

  useImperativeHandle(ref, () => editorHandleRef.current!, [])

  useEffect(() => {
    if (!app || !editorHandleRef.current) return
    propsRef.current.onReady?.(editorHandleRef.current)
  }, [app])

  const selectionJSON = selected.map(item => toPersistedCanvasScene(item.toJSON() as SceneNode))
  const availableActions = (actions: CanvasEditorProps['selectionActions']) => (actions || []).filter(action => (!isReadOnly || action.allowInReadOnly) && (!action.visible || action.visible(selectionJSON)))
  const externalActions = availableActions(props.selectionActions)
  const topActions = availableActions(props.hostActions)
  const renderHostAction = (action: NonNullable<CanvasEditorProps['selectionActions']>[number]) => {
    const disabled = typeof action.disabled === 'function' ? action.disabled(selectionJSON) : action.disabled
    return <IconButton key={action.id} label={action.label} title={action.tooltip || action.label} data-tooltip={action.tooltip || action.label} disabled={disabled} icon={action.icon || <span>•</span>} onClick={() => {
      if (disabled || (propsRef.current.mode === 'readonly') && !action.allowInReadOnly) return
      Promise.resolve().then(() => action.onClick({ selection: selectionJSON, getValue, updateSelection, removeSelection })).catch(error => propsRef.current.onError?.(error))
    }} />
  }

  const displayedSaveState = props.saveStatus === 'clean' ? 'saved' : props.saveStatus || saveState

  return <CanvasI18nProvider locale={props.locale} messages={messages}>
  <div data-aidcanvas="" lang={resolveLocale(props.locale) === 'en' ? 'en' : 'zh-CN'} tabIndex={0} onFocus={() => setFocused(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false) }} onPointerDown={e => { if (!(e.target as HTMLElement).closest('button,input,textarea,[contenteditable]')) e.currentTarget.focus() }} onDoubleClickCapture={e => { if (isReadOnly) e.stopPropagation() }} className={`canvas-app thinking-canvas${shapesOpen ? ' is-shapes-open' : ''}${shortcutsOpen || outlineOpen ? ' is-drawer-open' : ''}${isReadOnly ? ' is-readonly' : ''}${props.className ? ` ${props.className}` : ''}`} style={{ ...props.theme, ...props.style }}>
    {toast && <div className="toast">{toast}</div>}
    {props.showHeader !== false && <header className="app-header">
      <div className="header-actions board-header-panel">
        <span className={`save-status is-${displayedSaveState}`} role="status"><span className="save-status-dot" />{displayedSaveState === 'saving' ? t('status.saving') : displayedSaveState === 'dirty' ? t('status.dirty') : displayedSaveState === 'error' ? t('status.error') : t('status.saved')}</span>
        {props.headerActions}
        <Popover label={t('header.export')} icon={<span className="board-export-trigger"><BoardIcon name="export" size={16} />{t('header.export')}</span>} className="export-popover">
          <button type="button" className="menu-item" role="menuitem" disabled={!props.onExportRequest} onClick={() => props.onExportRequest?.({ format: 'png' })}>{t('header.exportPng')}</button>
          <button type="button" className="menu-item" role="menuitem" disabled={!props.onExportRequest} onClick={() => props.onExportRequest?.({ format: 'svg' })}>{t('header.exportSvg')}</button>
          {!managed() && <button type="button" className="menu-item" role="menuitem" onClick={() => downloadText('canvas.canvas', JSON.stringify(getValue()), 'application/json')}>{t('header.exportJson')}</button>}
        </Popover>
        <span className="board-edit-state"><BoardIcon name="pen" size={15} />{t(isReadOnly ? 'board.readonly' : 'board.editing')}</span>
        <span className="header-panel-divider" />
        <IconButton label={t('board.outline')} icon={<BoardIcon name="outline" />} active={outlineOpen} onClick={() => { setOutlineOpen(!outlineOpen); setShortcutsOpen(false) }} />
        <Popover label={t('menu.main')} icon={<BoardIcon name="dots" />} className="view-popover" fitViewport>
          <div className="menu-heading">{props.title ?? t('board.title')}</div>
          <button type="button" className="menu-item" role="menuitem" onClick={save}><Save />{t('header.save')}<kbd>⌘ S</kbd></button>
          {!isReadOnly && <button type="button" className="menu-item" role="menuitem" disabled={!props.onImportRequest} onClick={props.onImportRequest}><FolderOpen />{t('header.import')}<kbd>⌘ O</kbd></button>}
          {!managed() && <button type="button" className="menu-item" role="menuitem" onClick={() => downloadText('canvas.canvas', JSON.stringify(getValue()), 'application/json')}><Download />{t('header.exportJson')}</button>}
          <div className="menu-separator" />
          <button type="button" className="menu-item" role="menuitem" onClick={() => fitView()}><FullSelection />{t('zoom.fit')}<kbd>⇧ 1</kbd></button>
          <button type="button" className="menu-item" role="menuitemcheckbox" aria-checked={grid} onClick={() => setGrid(!grid)}><span className="menu-check">{grid && <Check />}</span>{t('menu.grid')}<kbd>'</kbd></button>
          <button type="button" className="menu-item" role="menuitemcheckbox" aria-checked={minimapOpen} onClick={() => setMinimapOpen(!minimapOpen)}><BoardIcon name="fit" size={16} />{t('board.minimap')}</button>
          <div className="menu-separator" />
          <button type="button" className="menu-item" role="menuitem" onClick={() => { setShortcutsOpen(true); setOutlineOpen(false) }}><span className="menu-key-icon">⌘</span>{t('menu.shortcuts')}<kbd>?</kbd></button>
        </Popover>
      </div>
    </header>}

    {topActions.length > 0 && <div className="host-action-bar" role="toolbar" aria-label={t('header.hostActions')}>{topActions.map(renderHostAction)}</div>}

    <div className="canvas-workspace">
      <main ref={stageRef} className={`canvas-stage${grid ? ' has-grid' : ''}${!isReadOnly && props.showToolbar !== false ? ' has-toolbar' : ''}`} data-active-tool={activeKey} onContextMenu={event => {
        if (!(event.target as HTMLElement).closest('.canvas-host')) return
        event.preventDefault()
        const bounds = event.currentTarget.getBoundingClientRect()
        setContextMenu({ x: Math.max(8, Math.min(event.clientX - bounds.left, bounds.width - 244)), y: Math.max(8, Math.min(event.clientY - bounds.top, bounds.height - 310)) })
      }}>
        {app && <RemoteSelections app={app} model={props.model} sessions={visibleRemoteSelections(props.remoteSelections || [], props.sessionId || '', isReadOnly)} />}
        {app && props.model && <AnchorDecorations app={app} model={props.model} anchors={props.anchors || []} activeId={props.activeAnchorId} onClick={props.onAnchorClick} />}
        {app && !isReadOnly && props.showToolbar !== false && <div className="toolbar-wrap"><Toolbar app={app} plugins={plugins} activeKey={activeKey} setActiveKey={activateTool}
          canUndo={historyState.canUndo} canRedo={historyState.canRedo} hasSelection={selected.length > 0}
          onDuplicate={duplicate} onDelete={removeSelection} onGroup={groupSelection} onUngroup={ungroupSelection} onSelectAll={() => app.editor.select(app.tree.children.filter(item => !item.skipJSON))}
          onTemplates={() => setGalleryOpen(true)} onLibrary={() => setShapesOpen(true)}
          onUndo={undo} onRedo={redo} onAttachment={file => { void insertAttachmentFile(file).catch(error => propsRef.current.onError?.(error)) }} onImageRequest={props.onImportRequest} onImage={(file) => { void insertImageFile(file).catch(error => propsRef.current.onError?.(error)); return false }} customShapes={props.customShapes}
          onCreateComplete={completeCreation}
          elementExtensions={props.elementExtensions} extensionValues={extensionValues} start={props.toolbarStart} end={props.toolbarEnd} /></div>}

        {app && !isReadOnly && styleOpen && activeKey === 'init' && selected.some(item => item.leafer) && !app.editor.innerEditing && <div className="property-wrap">
          <StyleEditor app={app} plugins={[rectPlugin, ...plugins]} activeKey={activeKey} editorList={selected} onLayerChange={reorderSelection}
            elementExtensions={props.elementExtensions} extensionValues={extensionValues}
            onExtensionValueChange={(type, key, value) => setExtensionValues(previous => ({ ...previous, [type]: { ...previous[type], [key]: value } }))} />
        </div>}

        {selectionPosition && selected.length > 0 && selected.every(item => item.leafer) && !ancestor(selected[0], 'table-cell') && activeKey === 'init' && (!isReadOnly || externalActions.length > 0) && <div ref={selectionActionsRef} className="selection-actions" style={{ left: selectionPosition.x, top: selectionPosition.y }}>
          {!isReadOnly && <>
          <ThinkingContextTools key={selected.map(item => item.id).join()} selection={selected} onMindAction={changeMind} onLayout={changeMindLayout} onTheme={changeMindTheme} onStyle={changeThinkingStyle} onMoreStyles={() => setStyleOpen(!styleOpen)} />
          <IconButton label={t('selection.duplicate')} icon={<Copy />} onClick={duplicate} />
          {selected.length === 1 && kind(selected[0]) === 'attachment' && <><IconButton label={t('resource.download')} icon={<Download />} onClick={() => { const runtime = resourceRuntime(app); void runtime?.download(selected[0].data!.resource as CanvasResource).catch(runtime.error) }} /><IconButton label={t('resource.preview')} icon={<FolderOpen />} onClick={() => resourceRuntime(app)?.preview(selected[0].data!.resource as CanvasResource)} /></>}
          {selectedImage && <IconButton label={t('selection.editImage')} icon={<EditTwo />} onClick={() => setImageEditorTarget(selectedImage)} />}
          {selectedImage && <IconButton label={t('selection.downloadImage')} icon={<Download />} onClick={() => void downloadSelectedImage()} />}
          {selectedEditablePath && <IconButton label={selectedEditablePath.name === 'path' ? t('selection.editPencil') : t('selection.editShape')} icon={<EditTwo />} onClick={() => setShapeEditorTarget(selectedEditablePath)} />}
          {selected.some((item) => item instanceof Frame && item.name === 'frame')
            ? <IconButton label={t('selection.releaseFrame')} icon={<OffScreenOne />} onClick={releaseSelectedFrames} />
            : <IconButton label={t('selection.createFrame')} icon={<FullSelection />} onClick={createFrameFromSelection} />}
          <IconButton label={t('selection.delete')} danger icon={<Delete />} onClick={removeSelection} />
          </>}
          {externalActions.map(renderHostAction)}
        </div>}

        {props.showZoomControls !== false && <div className="board-bottom-controls">
          {!isReadOnly && <div className="board-history-controls" role="toolbar" aria-label={t('toolbar.actions')}><IconButton label={t('toolbar.undo')} icon={<BoardIcon name="undo" size={18} />} disabled={!historyState.canUndo} onClick={undo} /><span className="header-panel-divider" /><IconButton label={t('toolbar.redo')} icon={<BoardIcon name="redo" size={18} />} disabled={!historyState.canRedo} onClick={redo} /></div>}
          <div className="zoom-controls" role="toolbar" aria-label={t('zoom.navigation')}>
            <IconButton label={t('toolbar.hand')} icon={<BoardIcon name="hand" size={20} />} active={activeKey === 'hand'} onClick={() => activateTool(activeKey === 'hand' ? 'init' : 'hand')} /><span className="header-panel-divider" />
            <IconButton label={t('zoom.out')} icon={<BoardIcon name="minus" size={18} />} onClick={() => zoom('out')} />
            <Popover label={t('zoom.menu')} icon={<span className="zoom-value">{zoomPercent}%</span>} className="zoom-popover">
              <button type="button" className="menu-item" role="menuitem" onClick={() => fitView()}>{t('zoom.fit')}<kbd>⇧ 1</kbd></button>
              <button type="button" className="menu-item" role="menuitem" disabled={!selected.length} onClick={() => fitView(true)}>{t('zoom.selection')}<kbd>⇧ 2</kbd></button>
              <button type="button" className="menu-item" role="menuitem" onClick={() => zoom('reset')}>{t('zoom.reset')}<kbd>100%</kbd></button>
            </Popover>
            <IconButton label={t('zoom.in')} icon={<BoardIcon name="plus" size={18} />} onClick={() => zoom('in')} />
          </div>
          <IconButton label={t('menu.shortcuts')} icon={<BoardIcon name="help" size={19} />} active={shortcutsOpen} onClick={() => { setShortcutsOpen(!shortcutsOpen); setOutlineOpen(false) }} />
        </div>}
        {contextMenu && <div className="canvas-context-menu canvas-popover-content" tabIndex={-1} role="menu" aria-label={t('menu.context')} style={{ left: contextMenu.x, top: contextMenu.y }} onClick={() => setContextMenu(null)} onKeyDown={event => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
          event.preventDefault(); event.stopPropagation()
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length
          buttons[next]?.focus()
        }}>
          {selectedImage && <button type="button" className="menu-item" role="menuitem" onClick={() => void downloadSelectedImage()}>{t('selection.downloadImage')}</button>}
          {!isReadOnly && <>
            {mindNode(selected[0]) && <><button type="button" className="menu-item" role="menuitem" onClick={() => changeMind('child')}>{t('mind.addChild')}<kbd>Tab</kbd></button><button type="button" className="menu-item" role="menuitem" onClick={() => changeMind('sibling')}>{t('mind.addSibling')}<kbd>Enter</kbd></button><button type="button" className="menu-item" role="menuitem" onClick={() => changeMind('parent')}>{t('mind.addParent')}<kbd>⇧ Tab</kbd></button><button type="button" className="menu-item" role="menuitem" onClick={() => changeMind('collapse')}>{t('mind.collapse')}<kbd>⌘ .</kbd></button><div className="menu-separator" /></>}
            <button className="menu-item" role="menuitem" disabled={!selected.length} onClick={duplicate}>{t('selection.duplicate')}<kbd>⌘ D</kbd></button>
            <button className="menu-item" role="menuitem" disabled={selected.length < 2} onClick={groupSelection}>{t('menu.group')}<kbd>⌘ G</kbd></button>
            <button className="menu-item" role="menuitem" disabled={!selected.some(item => item.name === 'group')} onClick={ungroupSelection}>{t('menu.ungroup')}<kbd>⇧ ⌘ G</kbd></button>
            <div className="menu-separator" />
            <button className="menu-item" role="menuitem" disabled={!selected.length} onClick={() => reorderSelection('top')}>{t('style.layerTop')}</button>
            <button className="menu-item" role="menuitem" disabled={!selected.length} onClick={() => reorderSelection('bottom')}>{t('style.layerBottom')}</button>
            <button className="menu-item is-danger" role="menuitem" disabled={!selected.length} onClick={removeSelection}>{t('selection.delete')}<kbd>⌫</kbd></button>
            <div className="menu-separator" />
          </>}
          <button className="menu-item" role="menuitem" onClick={() => app?.editor.select(app.tree.children.filter(item => !item.skipJSON))}>{t('menu.selectAll')}<kbd>⌘ A</kbd></button>
          <button className="menu-item" role="menuitem" onClick={() => fitView()}>{t('zoom.fit')}<kbd>⇧ 1</kbd></button>
        </div>}
        {app && <NativeResourcePreviews app={app} readonly={isReadOnly} />}
        {app && <NativeTaskCheckboxes app={app} readonly={isReadOnly} activeKey={activeKey} onChange={flushContent} />}
        {app && !isReadOnly && <><ThinkingTools app={app} activeKey={activeKey} onComplete={completeThinking} /><ToolPlacementPreview app={app} activeKey={activeKey} /><CanvasResources app={app} onInsert={insertCanvasResource} onExtract={extractCanvasResource} /><RichObjectInteractions app={app} activeKey={activeKey} selection={selected} onComplete={completeThinking} /><GraphHandles app={app} activeKey={activeKey} selection={selected} onComplete={completeThinking} onMindAction={changeMind} /><TableInteractions app={app} activeKey={activeKey} selection={selected} onComplete={completeThinking} /><LibraryDragDrop app={app} onComplete={completeLibraryDrag} /></>}
        {app && app.tree.children.length === 0 && !isReadOnly && activeKey === 'init' && <>{templatePreview ? <div className="template-ghost-preview"><TemplatePicture type={templatePreview} /></div> : <div className="board-empty-hint"><span className="board-desktop-hint">{t('board.emptyHint')}</span><span className="board-touch-hint">{t('board.touchHint')}</span><button type="button" onClick={() => setGalleryOpen(true)}><BoardIcon name="templates" size={21} />{t('board.template')}</button></div>}{starterOpen && <TemplateStarter onPreview={setTemplatePreview} onInsert={insertTemplate} onMore={() => setGalleryOpen(true)} onClose={() => { setStarterOpen(false); setTemplatePreview(null) }} />}</>}
        {app && !isReadOnly && activeKey === 'init' && selected[0] && (() => {
          const node = mindNode(selected[0]) || ancestor(selected[0], 'diagram-node')
          if (!node) return null
          const bounds = node.getBounds('box', 'world'), direction = kind(node) === 'mind-node' ? mindDirectionOf(node as Frame) : 'right'
          const vertical = direction === 'up' || direction === 'down'
          const point = app.tree.getClientPointByWorld({ x: bounds.x + (vertical ? bounds.width / 2 : direction === 'left' ? 0 : bounds.width), y: bounds.y + (vertical ? direction === 'up' ? 0 : bounds.height : bounds.height / 2) }), stage = stageRef.current?.getBoundingClientRect()
          return <button type="button" className="node-quick-create" aria-label={t(kind(node) === 'mind-node' ? 'mind.addChild' : 'board.quickConnect')} style={{ left: point.x - (stage?.left || 0) - 12 + (vertical ? 0 : direction === 'left' ? -44 : 44), top: point.y - (stage?.top || 0) - 12 + (vertical ? direction === 'up' ? -44 : 44 : 0) }} onClick={() => kind(node) === 'mind-node' ? changeMind('child') : quickConnect()}><BoardIcon name="plus" size={15} /></button>
        })()}
        {app && <RichLinks app={app} />}
        {app && minimapOpen && <BoardMinimap app={app} onReveal={ids => editorHandleRef.current?.revealElements(ids, { padding: 100, maxZoom: 1 })} />}

        <div ref={hostRef} className="canvas-host"><div ref={viewRef} className="canvas-view" />{app && !isReadOnly && activeKey === 'init' && <AlignmentGuides app={app} />}</div>
      </main>
    </div>
    {shapesOpen && !isReadOnly && <ShapesLibrary onPick={key => activateTool(key)} onClose={() => setShapesOpen(false)} />}
    {outlineOpen && app && <MindOutline app={app} onReveal={id => { const item = findItem(app.tree, id); if (item) app.editor.select(item); editorHandleRef.current?.revealElements([id], { padding: 120, maxZoom: 1 }) }} onClose={() => setOutlineOpen(false)} />}
    {galleryOpen && !isReadOnly && <TemplateGallery onInsert={insertTemplate} onClose={() => setGalleryOpen(false)} />}
    {shortcutsOpen && <div className="shortcuts-backdrop" onClick={() => setShortcutsOpen(false)}>
      <section className="shortcuts-dialog" role="dialog" aria-modal="false" aria-label={t('menu.shortcuts')} onClick={event => event.stopPropagation()}>
        <header><strong>{t('menu.shortcuts')}</strong><button autoFocus aria-label={t('menu.close')} onClick={() => setShortcutsOpen(false)}>×</button></header>
        <div className="shortcuts-grid">{([
          ['toolbar.select', 'V'], ['toolbar.hand', 'H / Space'], ['toolbar.pencil', 'P'], ['toolbar.eraser', 'E'], ['toolbar.arrow', 'A'], ['toolbar.text', 'T'], ['toolbar.note', 'N'], ['shape.rounded', 'R'], ['shape.rect', 'S'], ['shape.diamond', 'D'], ['shape.ellipse', 'O'], ['toolbar.line', 'L'], ['toolbar.frame', 'F'], ['board.shapes', 'M'], ['mind.addChild', 'Tab'], ['mind.addSibling', 'Enter'], ['mind.addParent', '⇧ Tab'], ['mind.collapse', '⌘ .'], ['toolbar.undo', '⌘ Z'], ['toolbar.redo', '⇧ ⌘ Z'], ['menu.group', '⌘ G'], ['zoom.fit', '⇧ 1'], ['zoom.selection', '⇧ 2'],
        ] as [MessageKey, string][]).map(([key, shortcut]) => <div key={key}><span>{t(key).replace(/ \(.*\)/, '')}</span><kbd>{shortcut}</kbd></div>)}</div>
      </section>
    </div>}
    {imageEditorTarget && <ImageEditorModal sourceUrl={getImageSource(imageEditorTarget)} onCancel={() => setImageEditorTarget(null)} onConfirm={applyImageEdit} />}
    {shapeEditorTarget && <SpecialShapeEditorModal title={shapeEditorTarget.name === 'path' ? t('shapeEditor.pencilTitle') : t('shapeEditor.title')} path={getEditablePath(shapeEditorTarget)} onCancel={() => setShapeEditorTarget(null)} onConfirm={applyPathEdit} />}
  </div>
  </CanvasI18nProvider>
})

export default CanvasContent
