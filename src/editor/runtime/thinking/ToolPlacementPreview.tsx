import { useEffect, useState } from 'react'
import { MoveEvent, ZoomEvent, type App } from 'leafer-ui'
import { getStyleParamsFromLocalStorage } from '../utils/styleLocalStorage'
import { shapePath, type DiagramShape } from './scene'
import { notePresets } from './noteStyles'
import { containerPresets, containerType } from './containers'
import { PhoneFramePreview } from './PhoneFramePreview'

/** An uncommitted, viewport-sized ghost; it never enters the scene or history. */
export function ToolPlacementPreview({ app, activeKey }: { app: App; activeKey: string }) {
  const [pointer, setPointer] = useState<{ clientX: number; clientY: number; key: string }>()
  const preset = containerType(activeKey)
  const active = Boolean(preset) || /^(diagram:|table:|sticker:|mindmap|connector:|note$|text$)/.test(activeKey)
  useEffect(() => {
    if (!active) return
    const host = (app.view as HTMLElement).closest('.canvas-host')!
    const move = (event: PointerEvent) => setPointer(!event.buttons && host.contains(event.target as Node) ? { clientX: event.clientX, clientY: event.clientY, key: activeKey } : undefined)
    const hide = () => setPointer(undefined)
    const repaint = () => setPointer(previous => previous && { ...previous })
    const ids = [app.on_(MoveEvent.MOVE, repaint), app.on_(ZoomEvent.ZOOM, repaint)]
    document.addEventListener('pointermove', move, true); document.addEventListener('pointerdown', hide, true); document.addEventListener('pointercancel', hide, true); window.addEventListener('blur', hide)
    return () => { app.off_(ids); document.removeEventListener('pointermove', move, true); document.removeEventListener('pointerdown', hide, true); document.removeEventListener('pointercancel', hide, true); window.removeEventListener('blur', hide) }
  }, [active, activeKey, app])
  if (!active || !pointer || pointer.key !== activeKey || app.editor.innerEditing) return null
  const stage = (app.view as HTMLElement).closest('.canvas-stage')!.getBoundingClientRect(), point = app.tree.getInnerPoint(app.tree.getWorldPointByClient(pointer)), scale = Math.abs(Number(app.tree.scaleX || 1))
  const [type, value, extra] = activeKey.split(':'), style = getStyleParamsFromLocalStorage()
  let body: React.ReactNode
  if (type === 'diagram') {
    const shape = value as DiagramShape, path = shapePath(shape, 160, 80)
    body = <g transform="translate(-80 -40)" fill="#ffffff" stroke="#3370ff" strokeWidth={1.5 / scale}>{shape === 'ellipse' ? <ellipse cx="80" cy="40" rx="80" ry="40" /> : path ? <path d={path} /> : <rect width="160" height="80" rx={shape === 'rounded' ? 8 : 0} />}</g>
  } else if (type === 'table') {
    const rows = Number(value), columns = Number(extra), width = columns * 140, height = rows * 46
    body = <g transform={`translate(${-width / 2} ${-height / 2})`} stroke="#a8bde8" strokeWidth={1 / scale}><rect width={width} height={height} fill="#fff" /><rect width={width} height="46" fill="#eaf1ff" />{Array.from({ length: columns - 1 }, (_, i) => <path key={`c${i}`} d={`M${(i + 1) * 140} 0v${height}`} />)}{Array.from({ length: rows - 1 }, (_, i) => <path key={`r${i}`} d={`M0 ${(i + 1) * 46}h${width}`} />)}</g>
  } else if (type === 'note') {
    const preset = notePresets.find(p => p.id === style.notePreset)
    body = <rect x="-100" y="-100" width="200" height="200" rx={preset && 'cornerRadius' in preset ? preset.cornerRadius : 2} fill={preset?.fill || (typeof style.fill === 'string' ? style.fill : '#fff2a8')} stroke={preset && 'stroke' in preset ? preset.stroke : undefined} strokeDasharray={preset && 'dashPattern' in preset ? preset.dashPattern.join(' ') : undefined} />
  }
  else if (preset) {
    const { width, height, fill, radius } = containerPresets[preset]
    body = <g transform={`translate(${-width / 2} ${-height / 2})`} stroke="#8b84ee" strokeWidth={1 / scale}>{preset === 'phone' ? <PhoneFramePreview width={width} height={height} /> : <rect width={width} height={height} rx={radius || 0} fill={fill || '#fff'} strokeDasharray="6 4" />}{preset.startsWith('swimlane-') && [1, 2].map(i => <path key={i} d={preset.endsWith('horizontal') ? `M0 ${height * i / 3}H${width}` : `M${width * i / 3} 0V${height}`} />)}{preset === 'matrix' && <path d={`M${width / 2} 0V${height}M0 ${height / 2}H${width}`} />}{preset === 'axes' && <path d={`M48 60V${height - 44}H${width - 30}`} />}</g>
  }
  else if (type === 'text') body = <g fill="#1f2329"><text x="0" y="20" fontSize="20">T</text><path d="M0 0v28" stroke="#3370ff" strokeWidth={1 / scale} /></g>
  else if (type === 'sticker') body = <text x="-26" y="24" fontSize="52">{activeKey.slice(8)}</text>
  else if (type === 'mindmap') body = <g stroke="#3370ff" strokeWidth={1.5 / scale}><rect x="-80" y="-24" width="160" height="48" rx="5" fill="#eaf1ff" /><path d="M80 0h32m0-30v60m0-60h30m-30 60h30" fill="none" /></g>
  else body = <path d="M-40 0H0V30H40m-8-5 8 5-8 5" fill="none" stroke="#3370ff" strokeWidth={1.5 / scale} />
  return <svg className="tool-placement-preview" data-tool={activeKey} data-page-x={point.x} data-page-y={point.y}><g transform={`translate(${pointer.clientX - stage.left} ${pointer.clientY - stage.top}) scale(${scale})`}>{body}</g></svg>
}
