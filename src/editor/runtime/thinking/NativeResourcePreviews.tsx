import { useEffect, useState } from 'react'
import { MoveEvent, PointerEvent as LeaferPointerEvent, PropertyEvent, ZoomEvent, type App, type IUI, type Text } from 'leafer-ui'
import { EditorEvent, InnerEditorEvent } from '@leafer-in/editor'
import type { CanvasElement, CanvasResource } from '../../../sdk/types'
import { useCanvasI18n } from '../../../i18n/context'
import { allItems, kind } from './scene'
import { richLayout } from './richText'
import { RESOURCE_DRAG, resourceRuntime } from './slateRuntime'
import { BoardIcon } from './BoardIcon'
import { richContainer } from './richBounds'
import { isNativeImage, nativeImageResource } from './nativeImage'

/** Native media actions share host authorization with Slate media. */
export function NativeResourcePreviews({ app, readonly, activeKey }: { app: App; readonly: boolean; activeKey: string }) {
  const t = useCanvasI18n(), [menu, setMenu] = useState<{ resource: CanvasResource; x: number; y: number; element?: CanvasElement }>(), [, paint] = useState(0)
  useEffect(() => {
    if (activeKey !== 'init') return
    const host = (app.view as HTMLElement).closest<HTMLElement>('.canvas-host')!
    let click: { item: IUI; x: number; y: number; moved: boolean } | undefined
    const down = (event: PointerEvent) => {
      click = undefined
      if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || app.editor.innerEditing || !(event.target instanceof HTMLElement) || !host.contains(event.target) || event.target.closest('.canvas-slate-mount,button,input')) return
      const item = app.tree.pick(app.tree.getWorldPointByClient(event)).target as IUI
      if (isNativeImage(item) && app.editor.list.length === 1 && app.editor.list[0] === item) click = { item, x: event.clientX, y: event.clientY, moved: false }
    }
    const move = (event: PointerEvent) => { if (click && Math.hypot(event.clientX - click.x, event.clientY - click.y) > 4) click.moved = true }
    const cancel = () => { click = undefined }
    const up = (event: LeaferPointerEvent) => {
      const current = click; cancel()
      if (!current || current.moved || event.dragging || event.moving) return
      const item = current.item
      if (event.target !== item && event.target !== app.editor.editBox.rect) return
      if (item.leafer && app.editor.list.length === 1 && app.editor.list[0] === item) resourceRuntime(app)?.preview(nativeImageResource(item))
    }
    const ids = [app.on_(LeaferPointerEvent.UP, up)]
    document.addEventListener('pointerdown', down, true); document.addEventListener('pointermove', move, true); document.addEventListener('pointercancel', cancel, true); window.addEventListener('blur', cancel)
    return () => { app.off_(ids); document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointermove', move, true); document.removeEventListener('pointercancel', cancel, true); window.removeEventListener('blur', cancel) }
  }, [activeKey, app])
  useEffect(() => {
    const host = (app.view as HTMLElement).closest<HTMLElement>('.canvas-host')!
    const context = (event: MouseEvent) => {
      if (!host.contains(event.target as Node) || (event.target as HTMLElement).closest('.canvas-slate-mount')) return
      const world = app.tree.getWorldPointByClient(event)
      const picked = app.tree.pick(world).target
      for (const item of allItems(app).filter(item => item.visible !== false).reverse()) {
        const p = item.getInnerPoint(world)
        if (p.x < 0 || p.y < 0 || p.x > Number(item.width) || p.y > Number(item.height)) continue
        let resource: CanvasResource | undefined
        if (kind(item) === 'attachment') resource = item.data?.resource
        else if (isNativeImage(item) && item === picked) resource = nativeImageResource(item)
        else if (item.tag === 'Text') resource = richLayout(item as Text)?.media.find(m => p.x >= m.x && p.y >= m.y && p.x <= m.x + m.width && p.y <= m.y + m.height)?.resource
        if (!resource) continue
        event.preventDefault(); event.stopImmediatePropagation()
        const stage = host.closest('.canvas-stage')!.getBoundingClientRect()
        setMenu({ resource, ...(isNativeImage(item) ? { element: item.toJSON() as CanvasElement } : {}), x: Math.max(8, Math.min(stage.width - 140, event.clientX - stage.left)), y: Math.max(8, Math.min(stage.height - 88, event.clientY - stage.top)) }); return
      }
    }
    const close = (event: PointerEvent) => { if (!(event.target as HTMLElement).closest('.native-resource-menu')) setMenu(undefined) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(undefined) }
    const refresh = () => paint(n => n + 1)
    const ids = [app.on_(MoveEvent.MOVE, refresh), app.on_(ZoomEvent.ZOOM, refresh), app.tree.on_(PropertyEvent.CHANGE, refresh), app.editor.on_(EditorEvent.SELECT, refresh), app.editor.on_(InnerEditorEvent.OPEN, refresh), app.editor.on_(InnerEditorEvent.CLOSE, refresh)]
    document.addEventListener('contextmenu', context, true); document.addEventListener('pointerdown', close, true); window.addEventListener('keydown', escape)
    return () => { app.off_(ids); document.removeEventListener('contextmenu', context, true); document.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', escape) }
  }, [app])
  const runtime = resourceRuntime(app), selected = new Set(app.editor.list)
  const stage = (app.view as HTMLElement).closest('.canvas-stage')!.getBoundingClientRect()
  const texts = new Set<Text>()
  const visit = (item: IUI) => {
    if (item.skipJSON) return
    if (item.tag === 'Text' && item.visible !== false) texts.add(item as Text)
    item.children?.forEach(visit)
  }
  if (!app.editor.innerEditing) selected.forEach(item => {
    if (item.tag === 'Text' || ['note', 'table', 'table-cell', 'card'].some(type => kind(item) === type || item.name === type)) visit(item)
  })
  const targets = [...texts].flatMap(item => (richLayout(item)?.media || []).flatMap(media => {
    const clipped = Boolean(richContainer(item as Text)), boxWidth = Number(item.width), boxHeight = Number(item.height)
    if (clipped && (media.x >= boxWidth || media.y >= boxHeight || media.x + media.width <= 0 || media.y + media.height <= 0)) return []
    const clipPath = clipped ? `inset(${Math.max(0, -media.y) / media.height * 100}% ${Math.max(0, media.x + media.width - boxWidth) / media.width * 100}% ${Math.max(0, media.y + media.height - boxHeight) / media.height * 100}% ${Math.max(0, -media.x) / media.width * 100}%)` : undefined
    const start = app.tree.getClientPointByWorld(item.getWorldPoint({ x: media.x, y: media.y })), end = app.tree.getClientPointByWorld(item.getWorldPoint({ x: media.x + media.width, y: media.y + media.height }))
    return [{ item, media, clipPath, x: start.x - stage.left, y: start.y - stage.top, width: end.x - start.x, height: end.y - start.y }]
  }))
  return <>
    {targets.map(({ item, media, clipPath, x, y, width, height }) => <div key={`${item.id}:${media.resource.id}`} className="native-rich-resource" data-native-resource={media.resource.id} style={{ position: 'absolute', left: x, top: y, width, height, clipPath, zIndex: 8 }} draggable={!readonly} onDragStart={event => { if (readonly || !runtime?.canEdit()) { event.preventDefault(); return }; event.dataTransfer.setData(RESOURCE_DRAG, JSON.stringify({ elementId: item.id, resourceId: media.resource.id })); event.dataTransfer.effectAllowed = 'move' }} onPointerDown={event => { event.stopPropagation() }} onClick={event => { if (readonly || !runtime?.canEdit() || (event.target as HTMLElement).closest('button')) return; app.editor.select(item); app.editor.openInnerEditor(item, true); (app.editor.innerEditor as unknown as { selectResource?: (id: string) => void }).selectResource?.(media.resource.id) }}>
      {media.resource.kind === 'attachment' && <button type="button" aria-label={t('resource.download')} title={t('resource.download')} onPointerDown={event => event.stopPropagation()} onClick={() => { void runtime?.download(media.resource).catch(runtime.error) }}><BoardIcon name="export" size={16} /></button>}
    </div>)}
    {menu && <div className="native-resource-menu canvas-popover-content" role="menu" style={{ position: 'absolute', left: menu.x, top: menu.y, zIndex: 40 }}>{menu.resource.kind === 'image' && <button type="button" className="menu-item" role="menuitem" onClick={() => { setMenu(undefined); void runtime?.copyImage(menu.resource, menu.element).catch(runtime.error) }}>{t('resource.copyImage')}</button>}<button type="button" className="menu-item" role="menuitem" onClick={() => { setMenu(undefined); void runtime?.download(menu.resource, menu.element).catch(runtime.error) }}>{t('resource.download')}</button></div>}
  </>
}
