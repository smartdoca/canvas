import { creationPreferences } from '../../thinking/preferences'
import type { App } from 'leafer-ui'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Plugins } from '../../plugins/plugins'
import type { CanvasElementExtension, CustomShapeDefinition } from '../../../../sdk/types'
import { ExtensionTool } from './ExtensionTool'
import { useCanvasI18n } from '../../../../i18n/context'
import type { MessageKey } from '../../../../i18n/en'
import { BoardIcon } from '../../thinking/BoardIcon'
import { getStyleParamsFromLocalStorage, setStyleParamsToLocalStorage } from '../../utils/styleLocalStorage'
import type { DiagramShape } from '../../thinking/scene'
import { NotePresetPicker } from '../../thinking/NotePresetPicker'
import { ContainerPicker } from '../../thinking/ContainerPicker'
import { STROKE_WIDTH_PRESETS } from '../../plugins/path/const'

interface ToolbarProps {
  app: App; plugins: Plugins[]; activeKey: string; setActiveKey: (key: string) => void
  preferredConnectorMode?: 'straight' | 'elbow' | 'curve'
  canUndo: boolean; canRedo: boolean; hasSelection: boolean
  onUndo: () => void; onRedo: () => void; onDuplicate: () => void; onDelete: () => void
  onCreateComplete: () => void
  onGroup: () => void; onUngroup: () => void; onSelectAll: () => void
  onAttachment: (file: File) => void
  onImage: (file: File) => boolean; onImageRequest?: () => void
  onTemplates: () => void; onLibrary: () => void
  customShapes?: CustomShapeDefinition[]; elementExtensions?: CanvasElementExtension[]; extensionValues?: Record<string, Record<string, unknown>>
  start?: ReactNode; end?: ReactNode
}
const shapeTypes: DiagramShape[] = ['rounded', 'ellipse', 'diamond', 'rect', 'cylinder', 'parallelogram', 'triangle', 'hexagon', 'cloud', 'document']
const runtimeNames = ['text', 'note', 'path', 'frame', 'eraser']
const emojis = ['😊', '👍', '❤️', '🎯', '💡', '⭐', '🚀', '✅', '🔥', '🎉', '📌', '🤔', '💬', '📚', '⚡', '🌱']

export default function Toolbar({ app, preferredConnectorMode, plugins, activeKey, setActiveKey, onCreateComplete, onImage, onImageRequest, onAttachment, onTemplates, onLibrary, customShapes, elementExtensions = [], extensionValues = {}, start, end }: ToolbarProps) {
  const attachmentInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null), root = useRef<HTMLDivElement>(null), closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const [expanded, setExpanded] = useState(false)
  const [open, setOpen] = useState(''), [tableSize, setTableSize] = useState({ rows: 3, columns: 3 })
  const t = useCanvasI18n()
  const setInit = useCallback(() => { setActiveKey('init'); app.mode = 'normal'; onCreateComplete() }, [app, setActiveKey, onCreateComplete])
  const activate = (key: string) => { setActiveKey(key); setOpen(''); (app.view as HTMLElement).closest<HTMLElement>('.canvas-app')?.focus() }
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen('') }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen('') }
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); clearTimeout(closeTimer.current) }
  }, [])
  const tool = (name: string, label: string, key: string, content?: ReactNode) => <div data-tool={name} className={`board-tool-group ${open === name ? 'is-open' : ''}`} onPointerEnter={() => { clearTimeout(closeTimer.current); if (content) setOpen(name) }} onPointerLeave={() => { closeTimer.current = setTimeout(() => setOpen(''), 180) }}>
    <button type="button" className={`board-tool-button ${activeKey === key || activeKey.startsWith(`${name}:`) || name === 'shapes' && activeKey.startsWith('diagram:') || name === 'section' && activeKey.startsWith('container:') ? 'is-active' : ''}`} title={label} aria-label={label} data-canvas-insert={['text', 'note', 'frame', 'mindmap'].includes(key) || key.includes(':') ? key : undefined} aria-expanded={content ? open === name : undefined} onClick={() => { if (content) { setOpen(name); if (key) setActiveKey(key) } else activate(key) }}><BoardIcon name={name} />{content && <span className="tool-caret" />}</button>
    {content && <div className="board-tool-flyout" hidden={open !== name} role="menu" aria-label={label}>{content}</div>}
  </div>
  const pluginButton = (plugin: Plugins) => { const AddMenu = plugin.AddMenu; return <AddMenu app={app} onCreateComplete={plugin.name === 'path' ? onCreateComplete : setInit} activeKey={plugin.name === 'frame' && activeKey === 'frame' ? 'init' : activeKey} onClick={key => activate(key)} customShapes={customShapes} /> }
  return <div ref={root} className={`canvas-toolbar${expanded ? ' is-mobile-expanded' : ''}`} role="toolbar" aria-label={t('toolbar.tools')}>
    {start}
    <button type="button" className="board-tool-button board-template-button" aria-label={t('template.library')} title={t('template.library')} onClick={onTemplates}><BoardIcon name="templates" size={23} /></button>
    <span className="board-toolbar-separator" />
    {tool('shapes', t('board.shapes'), 'diagram:rounded', <><div className="shape-quick-grid">{shapeTypes.map(shape => <button type="button" className={activeKey === `diagram:${shape}` ? 'is-active' : ''} key={shape} data-canvas-insert={`diagram:${shape}`} title={t(`shape.${shape}` as MessageKey)} aria-label={t(`shape.${shape}` as MessageKey)} onClick={() => activate(`diagram:${shape}`)}><BoardIcon name={shape} size={24} /></button>)}</div><button type="button" className="flyout-footer" onClick={() => { onLibrary(); setOpen('') }}>{t('board.moreShapes')}<kbd>M</kbd></button></>)}
    {tool('text', t('toolbar.text'), 'text')}
    {tool('note', t('toolbar.note'), 'note', <NotePresetPicker draggable onPick={id => { if (!creationPreferences(app)) setStyleParamsToLocalStorage({ ...getStyleParamsFromLocalStorage(), notePreset: id }); activate(`note:${id}`) }} />)}
    {tool('connector', t('board.connector'), `connector:${preferredConnectorMode || getStyleParamsFromLocalStorage().connectorMode || 'elbow'}`, <div className="connector-choices">{['elbow', 'straight', 'curve'].map(mode => <button type="button" key={mode} data-canvas-insert={`connector:${mode}`} onClick={() => activate(`connector:${mode}`)}><BoardIcon name={mode} size={23} /><span>{t(`connector.${mode}` as MessageKey)}</span></button>)}</div>)}
    {tool('section', t('board.section'), 'frame', <ContainerPicker activeKey={activeKey} isOpen={open === 'section'} onPick={activate} />)}
    {tool('table', t('board.table'), 'table:3:3', <><div className="table-picker">{Array.from({ length: 30 }, (_, i) => { const row = Math.floor(i / 6) + 1, column = i % 6 + 1; return <button type="button" key={i} data-canvas-insert={`table:${row}:${column}`} aria-label={`${row} × ${column}`} className={row <= tableSize.rows && column <= tableSize.columns ? 'is-highlighted' : ''} onPointerEnter={() => setTableSize({ rows: row, columns: column })} onFocus={() => setTableSize({ rows: row, columns: column })} onClick={() => activate(`table:${row}:${column}`)} /> })}</div><div className="table-picker-size">{tableSize.rows} × {tableSize.columns}</div></>)}
    {tool('pen', t('toolbar.pencil'), 'path', <><div className="connector-choices"><button type="button" onClick={() => activate('path')}><BoardIcon name="pen" /><span>{t('toolbar.pencil')}</span></button><button type="button" onClick={() => activate('eraser')}><span className="eraser-icon">▱</span><span>{t('toolbar.eraser')}</span></button></div><div className="pen-width-picker" role="group" aria-label={t('style.strokeWidth')}><div className="pen-width-label">{t('style.strokeWidth')}</div><div className="pen-width-presets">{STROKE_WIDTH_PRESETS.map(width => <button type="button" key={width} aria-label={`${t('style.strokeWidth')} ${width} px`} title={`${width} px`} aria-pressed={Number(getStyleParamsFromLocalStorage().strokeWidth) === width} onClick={() => { setStyleParamsToLocalStorage({ ...getStyleParamsFromLocalStorage(), strokeWidth: width }); activate('path') }}><svg width="42" height="24" viewBox="0 0 42 24" aria-hidden="true"><path d="M12 12H30" stroke="currentColor" strokeWidth={width} strokeLinecap="round" /></svg><span>{width}</span></button>)}</div></div></>)}
    {tool('mindmap', t('board.mindmap'), 'mindmap')}
    {tool('sticker', t('board.sticker'), 'sticker:😊', <div className="sticker-grid">{emojis.map(emoji => <button type="button" key={emoji} data-canvas-insert={`sticker:${emoji}`} aria-label={emoji} onClick={() => activate(`sticker:${emoji}`)}>{emoji}</button>)}</div>)}
    <button type="button" className="board-tool-button board-image-tool" aria-label={t('toolbar.image')} title={t('toolbar.image')} onClick={() => onImageRequest ? onImageRequest() : imageInput.current?.click()}><BoardIcon name="image" /></button>
    <button type="button" className="board-tool-button" aria-label={t('resource.attachment')} title={t('resource.attachment')} onClick={() => attachmentInput.current?.click()}><BoardIcon name="attachment" /></button>
    {elementExtensions.length > 0 && tool('more', t('toolbar.more'), '', <div className="board-legacy-grid">{elementExtensions.map(extension => <ExtensionTool key={extension.type} app={app} extension={extension} properties={extensionValues[extension.type] || {}} activeKey={activeKey} onClick={key => activate(key)} onCreateComplete={setInit} />)}</div>)}
    <span className="board-toolbar-separator" />
    <button type="button" className={`board-tool-button ${activeKey === 'init' ? 'is-active' : ''}`} aria-label={t('toolbar.select')} title={t('toolbar.select')} onClick={setInit}><BoardIcon name="select" /></button>
    <button type="button" className="board-tool-button board-mobile-expand" aria-label={t('board.moreTools')} aria-expanded={expanded} onClick={() => { setExpanded(!expanded); setOpen('') }}><BoardIcon name={expanded ? 'close' : 'dots'} /></button>
    {end}
    <div className="tool-runtime-only" hidden>{plugins.filter(plugin => runtimeNames.includes(plugin.name)).map(plugin => <div key={plugin.name}>{pluginButton(plugin)}</div>)}</div>
    <input ref={attachmentInput} hidden type="file" aria-label={t('resource.file')} multiple onChange={event => { [...event.target.files || []].forEach(onAttachment); event.target.value = '' }} />
    <input ref={imageInput} hidden type="file" aria-label={t('toolbar.imageFile')} accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file) onImage(file); event.target.value = '' }} />
  </div>
}
