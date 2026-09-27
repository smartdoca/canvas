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
import '@leafer-in/export'
import { EditorEvent, EditorMoveEvent, EditorRotateEvent, EditorScaleEvent } from '@leafer-in/editor'
import { Copy, Delete, Download, EditTwo, FolderOpen, FullSelection, OffScreenOne, Save, ZoomIn, ZoomOut } from '@icon-park/react'
import { CanvasIOError, parseCanvasFile, createCanvasImportValue, exportCanvasFile, type CanvasInsertOptions, type CanvasInsertResult, type CanvasExportOptions, type CanvasExportResult } from '../../io'
import { cancellable, checkAbort, progress } from '../../io/common'
import { rectPlugin } from './plugins/rect'
import { ellipsePlugin } from './plugins/ellipse'
import { pathPlugin } from './plugins/path'
import { textPlugin } from './plugins/text'
import { linePlugin } from './plugins/line'
import { arrowPlugin } from './plugins/arrow'
import { polygonPlugin } from './plugins/polygon'
import { starPlugin } from './plugins/star'
import { eraserPlugin } from './plugins/eraser'
import { circlePlugin, squarePlugin } from './plugins/constrainedShapes'
import { imagePlugin } from './plugins/image'
import { framePlugin } from './plugins/frame'
import { specialShapePlugin } from './plugins/specialShape'
import { SPECIAL_SHAPES } from './plugins/specialShape/const'
import type { Plugins } from './plugins/plugins'
import Toolbar from './components/toolbar/Toolbar'
import StyleEditor from './components/styleEditor/StyleEditor'
import { SnapshotHistory } from '../core/history'
import { createElementId, toPersistedCanvasScene, visibleRemoteSelections, type SceneNode } from '../../model'
import { CANVAS_STORAGE_KEY, createDocument, parseDocument } from '../core/document'
import { ActionButton, IconButton } from '../ui/Controls'
import ImageEditorModal, { type ImageEditResult } from './components/ImageEditorModal'
import SpecialShapeEditorModal from './components/SpecialShapeEditorModal'
import { RemoteSelections } from './components/RemoteSelections'
import { AnchorDecorations } from './components/AnchorDecorations'
import { elementBounds } from './utils/elementBounds'
import { findItem } from './utils/findItem'
import { createTextInputBridge } from './utils/textInputBridge'
import { bakeSpecialShapeScale, fitSpecialPath, refreshRoughFill, updateRoughFill, updateRoughGeometry } from './utils/roughStyle'
import { type AddImageOptions, type CanvasEditorProps, type CanvasEditorRef, type CanvasFindOptions, type CanvasRevealOptions, type CanvasRevealResult, type CanvasSaveStatus, type CanvasTextMatch, type CanvasValue } from '../../sdk/types'
import { CanvasI18nProvider } from '../../i18n/context'
import type { MessageKey } from '../../i18n/en'
import { resolveLocale, translate, type TranslateParams } from '../../i18n/translate'

const plugins: Plugins[] = [rectPlugin, squarePlugin, ellipsePlugin, circlePlugin, linePlugin, arrowPlugin, pathPlugin, textPlugin, polygonPlugin, starPlugin, framePlugin, imagePlugin, specialShapePlugin, eraserPlugin]

type SaveState = 'saved' | 'saving' | 'dirty' | 'error'

const FRAME_TITLE_NAME = 'frame-title'

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

function normalizeSelectableItems(items: IUI[]) {
  items.forEach((item) => {
    // Every persisted scene item in this canvas is selectable.
    item.editable = true
    item.hittable = true
    item.hitSelf = true
    if (item.name === 'text' && item instanceof LeaferText) {
      item.resizeFontSize = true
      item.lockRatio = true
      item.editConfig = { ...(item.editConfig || {}), editSize: 'font-size', lockRatio: true }
    }
    if (item.name === 'square' || item.name === 'circle') item.lockRatio = true
    if (item.tag === 'Image' || item.name === 'image') {
      item.lockRatio = item.data?.imageSizeMode !== 'free'
    }
    if (item instanceof Frame && item.name === 'frame') {
      if (item.data?.roughMode && item.data?.roughOriginalFill == null) item.fill = 'rgba(0,0,0,0)'
      const fill = typeof item.fill === 'string' ? item.fill.replace(/\s/g, '').toLowerCase() : item.fill
      item.hitFill = item.fill == null || fill === 'transparent' || fill === 'rgba(0,0,0,0)' ? 'none' : 'path'
      item.hitStroke = 'path'
      addFrameTitle(item)
    }
    // Regenerate persisted hand-drawn fills so documents saved with the old
    // clipped 24px bitmap automatically receive the seamless texture.
    if (item.data?.roughMode) updateRoughGeometry(item)
    if ('children' in item && Array.isArray(item.children)) normalizeSelectableItems(item.children as IUI[])
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
  const visit = (node: Record<string, unknown>) => { node.id = createElementId(); if (Array.isArray(node.children)) node.children.forEach(visit) }
  visit(result)
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
  const roughFillTimerRef = useRef<number>()
  const panRef = useRef({ active: false, space: false, x: 0, y: 0 })
  const restoringRef = useRef(false)
  const resourceMutationRef = useRef(false)
  const selectionActionsRef = useRef<HTMLDivElement>(null)
  const movedFrameItemsRef = useRef(new Set<IUI>())
  const editorHandleRef = useRef<CanvasEditorRef>()
  const uploadControllersRef = useRef(new Set<AbortController>())
  const propsRef = useRef(props)
  propsRef.current = props
  const lastValueRef = useRef('')
  const viewBaseRef = useRef<SceneNode>({ tag: 'Leafer', children: [] })
  const nativeModelWriteRef = useRef(false)
  const textBridgeRef = useRef<ReturnType<typeof createTextInputBridge>>()
  const contentBaseRef = useRef('')
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
  const isReadOnly = props.mode === 'readonly'

  useEffect(() => {
    if (isReadOnly || !focused) { propsRef.current.onPresenceChange?.(null); return }
    const timer = window.setTimeout(() => propsRef.current.onPresenceChange?.({ elementIds: selected.map(x => x.id!).filter(Boolean) }), 125)
    return () => window.clearTimeout(timer)
  }, [focused, isReadOnly, selected])

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
    if (!current?.editor.list.length || !stage) { setSelectionPosition(null); return }
    const bounds = current.editor.list.map((item) => {
      const world = item.getBounds('render', 'world')
      const start = current.tree.getClientPointByWorld({ x: world.x, y: world.y })
      const end = current.tree.getClientPointByWorld({ x: world.x + world.width, y: world.y + world.height })
      return { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y }
    })
    const stageBounds = stage.getBoundingClientRect()
    const left = Math.min(...bounds.map((item) => item.x))
    const right = Math.max(...bounds.map((item) => item.x + item.width))
    const bottom = Math.max(...bounds.map((item) => item.y + item.height))
    const position = { x: (left + right) / 2 - stageBounds.left, y: bottom - stageBounds.top }
    if (selectionActionsRef.current) {
      selectionActionsRef.current.style.left = `${position.x}px`
      selectionActionsRef.current.style.top = `${position.y}px`
    }
    setSelectionPosition(position)
  }, [])

  const scheduleSelectionPosition = useCallback(() => {
    if (positionFrameRef.current !== undefined) window.cancelAnimationFrame(positionFrameRef.current)
    positionFrameRef.current = window.requestAnimationFrame(updateSelectionPosition)
  }, [updateSelectionPosition])

  const applyZoomAt = useCallback((nextScale: number, origin: { x: number; y: number }) => {
    const tree = appRef.current?.tree
    if (!tree) return
    tree.zoom(Math.min(4, Math.max(0.2, nextScale)), { origin })
    setZoomPercent(Math.round(Number(tree.scale || 1) * 100))
    scheduleSelectionPosition()
  }, [scheduleSelectionPosition])

  const reconcileFrameMembership = useCallback(() => {
    const current = appRef.current
    if (!current) return
    const frames: Frame[] = []
    const visit = (items: IUI[]) => items.forEach((item) => {
      if (item instanceof Frame && item.name === 'frame') frames.push(item)
      if ('children' in item && Array.isArray(item.children)) visit(item.children as IUI[])
    })
    visit([...current.tree.children] as IUI[])

    const candidates = new Set<IUI>([...current.tree.children] as IUI[])
    movedFrameItemsRef.current.forEach((item) => candidates.add(item))
    movedFrameItemsRef.current.clear()
    let changed = false
    candidates.forEach((item) => {
      if (item instanceof Frame || (item.parent !== current.tree && !(item.parent instanceof Frame))) return
      const bounds = item.getBounds('render', 'world')
      const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
      const target = frames
        .filter((frame) => {
          const frameBounds = frame.getBounds('box', 'world')
          return center.x >= frameBounds.x && center.x <= frameBounds.x + frameBounds.width && center.y >= frameBounds.y && center.y <= frameBounds.y + frameBounds.height
        })
        .sort((a, b) => {
          const aBounds = a.getBounds('box', 'world')
          const bBounds = b.getBounds('box', 'world')
          return aBounds.width * aBounds.height - bBounds.width * bBounds.height
        })[0]
      if (target && item.parent !== target) { item.dropTo(target); changed = true }
      if (!target && item.parent instanceof Frame) { item.dropTo(current.tree); changed = true }
    })
    if (changed) {
      scheduleSelectionPosition()
    }
  }, [scheduleSelectionPosition])

  const snapshot = useCallback(() => {
    const tree = appRef.current?.tree
    const assign = (items: IUI[]) => items.forEach(item => {
      if (!item.id) item.id = createElementId()
      if ('children' in item && Array.isArray(item.children)) assign(item.children as IUI[])
    })
    if (tree) assign([...tree.children])
    // Root pan/zoom/size are view state, never collaborative content.
    return JSON.stringify(persistedScene({ tag: 'Leafer', children: tree?.toJSON().children || [] }))
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
    if (propsRef.current.autoSave !== false && propsRef.current.value === undefined) localStorage.setItem(propsRef.current.storageKey || CANVAS_STORAGE_KEY, JSON.stringify(getValue()))
    updateSaveState('saved')
  }, [getValue, managed, updateSaveState])

  const flushContent = useCallback(() => {
    window.clearTimeout(changeTimerRef.current)
    if (!appRef.current || restoringRef.current || resourceMutationRef.current) return
    if (propsRef.current.model?.isDisposed) return
    const revisionBefore = propsRef.current.model?.revision
    textBridgeRef.current?.flush()
    const current = snapshot()
    if (current === contentBaseRef.current) return
    const model = propsRef.current.model
    if (propsRef.current.mode === 'readonly') return
    if (model) {
      nativeModelWriteRef.current = true
      try {
        const next = JSON.parse(current) as SceneNode
        // Text-session commits already carry character identities; never diff its stale DOM against the live text.
        const activeId = textBridgeRef.current?.elementId
        const find = (node: SceneNode): SceneNode | undefined => node.id === activeId ? node : node.children?.map(find).find(Boolean)
        if (activeId) { const target = find(next), base = find(viewBaseRef.current); if (target && base) { if (base.text === undefined) delete target.text; else target.text = base.text } }
        model.applyScene(next, viewBaseRef.current)
      }
      finally { nativeModelWriteRef.current = false }
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
    if (restoringRef.current || resourceMutationRef.current || !appRef.current || propsRef.current.mode === 'readonly') return
    window.clearTimeout(changeTimerRef.current)
    changeTimerRef.current = window.setTimeout(flushContent, 120)
  }, [flushContent])

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
      const collect = (items: IUI[]) => items.forEach(item => { if (item.id) existing.set(item.id, item); if ('children' in item && Array.isArray(item.children)) collect(item.children as IUI[]) })
      collect([...current.tree.children])
      const used = new Set<string>()
      const reconcile = (parent: typeof current.tree | Group | Frame, nodes: SceneNode[]) => nodes.forEach((node, index) => {
        const { children, ...attrs } = node
        let item = existing.get(node.id!)
        if (item && node.id === textBridgeRef.current?.elementId && textBridgeRef.current?.isComposing) attrs.text = (item as LeaferText).text
        if (!item || item.tag !== node.tag) {
          item?.remove()
          parent.addAt(attrs as never, index)
          item = parent.children[index] as IUI
        } else {
          const old = item.toJSON() as Record<string, unknown>
          const patch: Record<string, unknown> = {}
          Object.keys(old).forEach(k => { if (!['children', 'id', 'tag'].includes(k) && !(k in attrs)) patch[k] = undefined })
          Object.entries(attrs).forEach(([k, v]) => { if (!['id', 'tag'].includes(k) && JSON.stringify(old[k]) !== JSON.stringify(v)) patch[k] = v })
          if (Object.keys(patch).length) item.set(patch as never)
          if (item.parent !== parent || parent.children[index] !== item) parent.addAt(item, index)
        }
        used.add(node.id!)
        if (children?.length && (item instanceof Group || item instanceof Frame)) reconcile(item, children)
      })
      reconcile(current.tree, renderScene(value.scene).children || [])
      existing.forEach((item, id) => { if (!used.has(id)) item.remove() })
      normalizeSelectableItems([...current.tree.children])
      const selection = selectionIds.map(id => findItem(current.tree, id!)).filter((x): x is IUI => Boolean(x))
      if (selection.length !== current.editor.list.length || selection.some((item, index) => item !== current.editor.list[index])) current.editor.select(selection)
      setSelected(selection)
      contentBaseRef.current = snapshot(); viewBaseRef.current = JSON.parse(contentBaseRef.current)
      lastValueRef.current = contentBaseRef.current
      setHistoryState({ canUndo: model.canUndo, canRedo: model.canRedo })
      void hydrateResources([...current.tree.children])
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
    current.editor.select([])
    current.tree.reset(JSON.parse(value))
    normalizeSelectableItems([...current.tree.children] as IUI[])
    setSelected([])
    setHistoryState({ canUndo: historyRef.current.canUndo, canRedo: historyRef.current.canRedo })
    updateSaveState('dirty')
    window.setTimeout(() => { restoringRef.current = false; save() }, 0)
  }, [save, updateSaveState])

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
    const copies = current.editor.list.map((item) => {
      const data = cloneForInsertion(item.toJSON() as Record<string, unknown>)
      data.x = Number(data.x || 0) + 16
      data.y = Number(data.y || 0) + 16
      current.tree.add(data)
      return current.tree.children[current.tree.children.length - 1]
    })
    current.editor.select(copies)
    commit()
  }, [commit])

  const copySelection = useCallback(() => {
    clipboardRef.current = (appRef.current?.editor.list || []).map((item) => item.toJSON() as Record<string, unknown>)
  }, [])

  const pasteSelection = useCallback(() => {
    const current = appRef.current
    if (!current || !clipboardRef.current.length) return
    const copies = clipboardRef.current.map((source) => {
      const data = cloneForInsertion({ ...source, x: Number(source.x || 0) + 16, y: Number(source.y || 0) + 16 })
      current.tree.add(data)
      return current.tree.children[current.tree.children.length - 1]
    })
    clipboardRef.current = copies.map((item) => item.toJSON() as Record<string, unknown>)
    current.editor.select(copies)
    commit()
  }, [commit])

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
      fill: '#f7f8fa',
      editor: {
        buttonsDirection: 'bottom',
        buttonsFixed: true,
        rotateable: true,
        hideRotatePoints: false,
        circleDirection: 'top',
        circleMargin: 26,
        circle: { pointType: 'rotate', width: 12, height: 12, fill: '#ffffff', stroke: '#6257e8', strokeWidth: 2, cornerRadius: 6 },
      },
      wheel: { preventDefault: true },
      touch: { preventDefault: true },
      pointer: { preventDefaultMenu: true },
    })
    appRef.current = instance
    textBridgeRef.current = createTextInputBridge(instance, () => propsRef.current.model, fn => {
      nativeModelWriteRef.current = true
      try { fn() } finally { nativeModelWriteRef.current = false }
    })
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
    historyRef.current.reset(JSON.stringify(instance.tree.toJSON()))
    contentBaseRef.current = snapshot()
    viewBaseRef.current = JSON.parse(contentBaseRef.current)

    instance.editor.on(EditorEvent.SELECT, (event: EditorEvent) => {
      setSelected([...event.editor.list])
      propsRef.current.onSelectionChange?.(event.editor.list.map(item => toPersistedCanvasScene(item.toJSON() as SceneNode)))
      scheduleSelectionPosition()
    })
    instance.tree.on(PropertyEvent.CHANGE, commit)
    instance.tree.on(PropertyEvent.LEAFER_CHANGE, commit)
    instance.tree.on(ChildEvent.ADD, commit)
    instance.tree.on(ChildEvent.REMOVE, commit)
    instance.editor.on(EditorMoveEvent.MOVE, () => {
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
    instance.on(ZoomEvent.ZOOM, () => {
      scheduleSelectionPosition()
      window.clearTimeout(roughFillTimerRef.current)
      roughFillTimerRef.current = window.setTimeout(() => {
        const refresh = (items: IUI[]) => items.forEach(item => {
          refreshRoughFill(item)
          if ('children' in item && Array.isArray(item.children)) refresh(item.children as IUI[])
        })
        refresh([...instance.tree.children] as IUI[])
      }, 90)
    })
    instance.on(LeaferPointerEvent.UP, () => {
      // Leafer commits an editor resize at the end of the pointer-up cycle.
      // Rebuilding a Rough path synchronously here captures the old geometry
      // and effectively cancels the resize. Wait until the next frame so both
      // the native outline and size-aware texture use the committed bounds.
      const selectedItems = [...instance.editor.list]
      window.requestAnimationFrame(() => selectedItems.forEach((item) => {
        if (item.destroyed) return
        bakeSpecialShapeScale(item)
        if (item.data?.roughMode) updateRoughGeometry(item)
      }))
      window.setTimeout(reconcileFrameMembership, 0)
    })
    instance.on(KeyEvent.DOWN, (event: KeyEvent) => {
      if (propsRef.current.mode === 'readonly') return
      const editingText = Boolean(instance.editor.innerEditing)
      if (!editingText && (event.code === 'Delete' || event.code === 'Backspace')) {
        instance.editor.list.forEach((item) => item.remove())
        instance.editor.select([])
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
      window.clearTimeout(roughFillTimerRef.current)
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
    appRef.current.editor.select([])
    appRef.current.tree.reset(props.value.scene as never)
    normalizeSelectableItems([...appRef.current.tree.children] as IUI[])
    void hydrateResources([...appRef.current.tree.children] as IUI[])
    historyRef.current.reset(JSON.stringify(appRef.current.tree.toJSON()))
    setSelected([])
    lastValueRef.current = serialized
    window.setTimeout(() => { restoringRef.current = false }, 0)
  }, [hydrateResources, props.value])

  useEffect(() => {
    if (!app) return
    propsRef.current.model?.setReadOnly(isReadOnly)
    if (isReadOnly) {
      setActiveKey('init'); app.mode = 'normal'; app.editor.closeInnerEditor()
      setImageEditorTarget(null); setShapeEditorTarget(null)
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
    const host = hostRef.current
    if (!host || !app) return
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
    }
  }, [activeKey, app, applyZoomAt, scheduleSelectionPosition])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!target || !target.closest('.canvas-app') || !stageRef.current?.closest('.canvas-app')?.contains(target)) return
      if (target?.matches('input, textarea, [contenteditable="true"]') || appRef.current?.editor.innerEditing) return
      const modifier = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault()
        panRef.current.space = true
        stageRef.current?.classList.add('is-panning')
      }
      if (propsRef.current.mode === 'readonly') {
        if (modifier && key === 'c') { event.preventDefault(); copySelection() }
        if (modifier && key === 'a') { event.preventDefault(); appRef.current?.editor.select([...(appRef.current?.tree.children || [])]) }
        return
      }
      if (modifier && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
      if (modifier && key === 'd') { event.preventDefault(); duplicate() }
      if (modifier && key === 'g') { event.preventDefault(); if (event.shiftKey) ungroupSelection(); else groupSelection() }
      if (modifier && key === 's') { event.preventDefault(); save() }
      if (modifier && key === 'c') { event.preventDefault(); copySelection() }
      // Leave Cmd/Ctrl+V to the browser: the host must receive image ClipboardEvents.
      if (modifier && key === 'x') {
        event.preventDefault(); copySelection()
        appRef.current?.editor.list.forEach((item) => item.remove())
        appRef.current?.editor.select([]); commit()
      }
      if (modifier && key === 'a') { event.preventDefault(); appRef.current?.editor.select([...(appRef.current?.tree.children || [])]) }
      if (!modifier && (key === 'v' || key === '1' || key === 'escape')) setActiveKey('init')
      if (!modifier && key === 'h') setActiveKey('hand')
      const tool = plugins.find((plugin) => plugin.shortcut === key)
      if (!modifier && tool) setActiveKey(tool.name)
      const extensionTool = propsRef.current.elementExtensions?.find(extension => extension.shortcut?.toLowerCase() === key)
      if (!modifier && extensionTool) setActiveKey(extensionTool.type)
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
      const target = event.target as HTMLElement | null
      if (event.defaultPrevented || event.clipboardData?.files.length || !target || !stageRef.current?.closest('.canvas-app')?.contains(target)) return
      if (target.matches('input, textarea, [contenteditable="true"]') || appRef.current?.editor.innerEditing || propsRef.current.mode === 'readonly') return
      if (clipboardRef.current.length) { event.preventDefault(); pasteSelection() }
    }
    window.addEventListener('paste', onPaste)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('paste', onPaste); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) }
  }, [commit, copySelection, duplicate, groupSelection, pasteSelection, redo, save, undo, ungroupSelection])

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
    appRef.current?.editor.list.forEach((item) => item.remove())
    appRef.current?.editor.select([])
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
    const frame = new Frame({ name: 'frame', x: left, y: top, width: right - left, height: bottom - top, fill: '#ffffff', hitFill: 'path', hitStroke: 'path', stroke: '#8b84ee', strokeWidth: 1, dashPattern: [8, 4], cornerRadius: 8, overflow: 'hide', editable: true, data: { title: 'Frame' } })
    addFrameTitle(frame)
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
        if (item.name === FRAME_TITLE_NAME) { item.remove(); return }
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
    const rect = stage.getBoundingClientRect(), center = owner.tree.getInnerPoint(owner.tree.getWorldPointByClient({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }))
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
      else { owner.tree.add(element as IUIJSONData); normalizeSelectableItems([...owner.tree.children]); flushContent(); void hydrateResources([...owner.tree.children]) }
      if (options.select !== false) owner.editor.select(findItem(owner.tree, element.id!) || [])
      setActiveKey('init')
      return { elementId: element.id!, element, warnings: parsed.warnings }
    } finally { options.signal?.removeEventListener('abort', abort); uploadControllersRef.current.delete(controller) }
  }, [flushContent, hydrateResources])

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
        const stageBounds = stage.getBoundingClientRect()
        const worldCenter = current.tree.getWorldPointByClient({
          clientX: stageBounds.left + stageBounds.width / 2,
          clientY: stageBounds.top + stageBounds.height / 2,
        })
        const center = current.tree.getInnerPoint(worldCenter)
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
    if (typeof item.data?.roughOriginalPath === 'string') return item.data.roughOriginalPath
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
    } else if (item.data?.roughMode) {
      item.data = { ...(item.data || {}), roughOriginalPath: path, customPath: path, specialShapeType: undefined }
      updateRoughGeometry(item)
    } else {
      item.set({ path, data: { ...(item.data || {}), customPath: path, specialShapeType: undefined } } as never)
    }
    setShapeEditorTarget(null); appRef.current?.editor.select(item); scheduleSelectionPosition(); commit()
  }

  const updateSelection = useCallback((patch: Record<string, unknown>) => {
    if (propsRef.current.mode === 'readonly') return
    appRef.current?.editor.list.forEach(item => {
      item.set(patch as never)
      if (item.data?.roughMode) {
        if ('fill' in patch) updateRoughFill(item, patch.fill)
        updateRoughGeometry(item)
      }
    })
    setSelected([...(appRef.current?.editor.list || [])])
    commit()
  }, [commit])

  const setValueFromApi = useCallback((value: CanvasValue) => {
    if (propsRef.current.model) throw new Error('Use model commands; replacing a live collaborative document requires a new epoch')
    const current = appRef.current
    if (!current) return
    restoringRef.current = true
    current.editor.select([])
    current.tree.reset(value.scene as never)
    normalizeSelectableItems([...current.tree.children] as IUI[])
    void hydrateResources([...current.tree.children] as IUI[])
    historyRef.current.reset(JSON.stringify(current.tree.toJSON()))
    setSelected([])
    lastValueRef.current = JSON.stringify(value.scene)
    window.setTimeout(() => { restoringRef.current = false; emitChange('api') }, 0)
  }, [emitChange, hydrateResources])

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
    const found = [...new Set(ids)].flatMap(id => {
      const value = elementBounds(current, id)
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
      const tree = appRef.current?.tree
      if (!tree) throw new CanvasIOError('EDITOR_NOT_READY')
      const position = tree.getInnerPoint(tree.getWorldPointByClient({ clientX: point.x, clientY: point.y }))
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
    select: (ids) => appRef.current?.editor.select(ids.map(id => findItem(appRef.current?.tree, id)).filter((item): item is IUI => Boolean(item))),
    updateSelection,
    removeSelection,
    addElement: (element) => {
      const current = appRef.current
      if (!current || propsRef.current.mode === 'readonly') return null
      current.tree.add(element)
      const created = current.tree.children[current.tree.children.length - 1]
      current.editor.select(created)
      commit()
      return created.toJSON() as Record<string, unknown>
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
      current.editor.select(created); commit()
      return created.toJSON() as Record<string, unknown>
    },
    addExtensionElement: (type, bounds = { x: 0, y: 0, width: 100, height: 100 }) => {
      const current = appRef.current
      const extension = propsRef.current.elementExtensions?.find(item => item.type === type)
      if (!current || !extension || propsRef.current.mode === 'readonly') return null
      current.tree.add(extension.create({ bounds, properties: extensionValuesRef.current[type] || {} }) as never)
      const created = current.tree.children[current.tree.children.length - 1]
      created.name = type; created.editable = true; current.editor.select(created); commit()
      return created.toJSON() as Record<string, unknown>
    },
    addImage: addImageSource,
    insertImageFile,
    exportFile,
    find,
    reveal,
    replace,
    replaceAll,
    capabilities: { find: true, replace: true, resources: Boolean(propsRef.current.resources), collaborationCodec: propsRef.current.model ? 'aidcanvas-yjs' : 'none', anchors: Boolean(propsRef.current.model), presence: true, anchorDecorations: Boolean(propsRef.current.model), revealElements: true, textRangeAnchors: false, characterPresence: false },
    }
    editorHandleRef.current = handle
    return handle
  }, [addImageSource, insertImageFile, exportFile, commit, find, flushContent, getValue, groupSelection, hydrateResources, redo, removeSelection, replace, replaceAll, reveal, revealElements, setValueFromApi, undo, ungroupSelection, updateSelection])

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
  <div data-aidcanvas="" lang={resolveLocale(props.locale) === 'en' ? 'en' : 'zh-CN'} tabIndex={0} onFocus={() => setFocused(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false) }} onPointerDown={e => { if (!(e.target as HTMLElement).closest('button,input,textarea,[contenteditable]')) e.currentTarget.focus() }} onDoubleClickCapture={e => { if (isReadOnly) e.stopPropagation() }} className={`canvas-app${isReadOnly ? ' is-readonly' : ''}${props.className ? ` ${props.className}` : ''}`} style={{ ...props.theme, ...props.style }}>
    {toast && <div className="toast">{toast}</div>}
    {props.showHeader !== false && <header className="app-header">
      <div className="brand"><span className="brand-title">{props.title ?? t('header.title')}</span><span className="save-status">{displayedSaveState === 'saving' ? t('status.saving') : displayedSaveState === 'dirty' ? t('status.dirty') : displayedSaveState === 'error' ? t('status.error') : t('status.saved')}</span></div>
      <div className="header-actions">
        {props.headerActions}
        <ActionButton onClick={save}><Save /><span>{t('header.save')}</span></ActionButton>
        {!isReadOnly && <ActionButton disabled={!props.onImportRequest} onClick={props.onImportRequest}><FolderOpen /><span>{t('header.import')}</span></ActionButton>}
        <details className="file-menu">
          <summary><ActionButton className="primary"><Download /><span>{t('header.export')}</span></ActionButton></summary>
          <div className="menu-popover">
            <button className="menu-item" disabled={!props.onExportRequest} onClick={() => props.onExportRequest?.({ format: 'png' })}>{t('header.exportPng')}</button>
            <button className="menu-item" disabled={!props.onExportRequest} onClick={() => props.onExportRequest?.({ format: 'svg' })}>{t('header.exportSvg')}</button>
          </div>
        </details>
      </div>
    </header>}

    {topActions.length > 0 && <div className="host-action-bar" role="toolbar" aria-label={t('header.hostActions')}>{topActions.map(renderHostAction)}</div>}

    <div className="canvas-workspace">
      <main ref={stageRef} className={`canvas-stage${!isReadOnly && props.showToolbar !== false ? ' has-toolbar' : ''}`} data-active-tool={activeKey}>
        {app && <RemoteSelections app={app} sessions={visibleRemoteSelections(props.remoteSelections || [], props.sessionId || '', isReadOnly)} />}
        {app && props.model && <AnchorDecorations app={app} model={props.model} anchors={props.anchors || []} activeId={props.activeAnchorId} onClick={props.onAnchorClick} />}
        {app && !isReadOnly && props.showToolbar !== false && <div className="toolbar-wrap"><Toolbar app={app} plugins={plugins} activeKey={activeKey} setActiveKey={setActiveKey}
          canUndo={historyState.canUndo} canRedo={historyState.canRedo}
          onUndo={undo} onRedo={redo} onImageRequest={props.onImportRequest} onImage={(file) => { void insertImageFile(file).catch(error => propsRef.current.onError?.(error)); return false }} customShapes={props.customShapes}
          elementExtensions={props.elementExtensions} extensionValues={extensionValues} start={props.toolbarStart} end={props.toolbarEnd} /></div>}

        {app && !isReadOnly && (selected.length > 0 || plugins.some((plugin) => plugin.name === activeKey && plugin.styleControlKeys.length > 0) || props.elementExtensions?.some(extension => extension.type === activeKey && extension.properties?.length)) && activeKey !== 'eraser' && <div className="property-wrap">
          <StyleEditor app={app} plugins={plugins} activeKey={activeKey} editorList={selected} onLayerChange={reorderSelection}
            elementExtensions={props.elementExtensions} extensionValues={extensionValues}
            onExtensionValueChange={(type, key, value) => setExtensionValues(previous => ({ ...previous, [type]: { ...previous[type], [key]: value } }))} />
        </div>}

        {selectionPosition && activeKey === 'init' && (!isReadOnly || externalActions.length > 0) && <div ref={selectionActionsRef} className="selection-actions" style={{ left: selectionPosition.x, top: selectionPosition.y }}>
          {!isReadOnly && <>
          <IconButton label={t('selection.duplicate')} icon={<Copy />} onClick={duplicate} />
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

        {props.showZoomControls !== false && <div className="zoom-controls">
          <IconButton label={t('zoom.out')} icon={<ZoomOut />} onClick={() => zoom('out')} />
          <button className="zoom-label" title={t('zoom.reset')} aria-label={t('zoom.reset')} onClick={() => zoom('reset')}>{zoomPercent}%</button>
          <IconButton label={t('zoom.in')} icon={<ZoomIn />} onClick={() => zoom('in')} />
        </div>}
        <div ref={hostRef} className="canvas-host"><div ref={viewRef} className="canvas-view" /></div>
      </main>
    </div>
    {imageEditorTarget && <ImageEditorModal sourceUrl={getImageSource(imageEditorTarget)} onCancel={() => setImageEditorTarget(null)} onConfirm={applyImageEdit} />}
    {shapeEditorTarget && <SpecialShapeEditorModal title={shapeEditorTarget.name === 'path' ? t('shapeEditor.pencilTitle') : t('shapeEditor.title')} path={getEditablePath(shapeEditorTarget)} onCancel={() => setShapeEditorTarget(null)} onConfirm={applyPathEdit} />}
  </div>
  </CanvasI18nProvider>
})

export default CanvasContent
