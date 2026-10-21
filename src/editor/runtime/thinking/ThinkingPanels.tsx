import { useEffect, useRef, useState } from 'react'
import { LayoutEvent, MoveEvent, ZoomEvent, type App, type IUI, type Text } from 'leafer-ui'
import { useCanvasI18n } from '../../../i18n/context'
import type { MessageKey } from '../../../i18n/en'
import { BoardIcon } from './BoardIcon'
import { NotePresetPicker } from './NotePresetPicker'
import { TextAlignmentControl } from './TextAlignmentControl'
import { horizontalAlign } from './richText'
import { templateIds, templateCategories, type TemplateId } from './templates'
import { layoutKeys } from './templates'
import { ancestor, isConnector, kind, labelOf, mindMap, mindNode, type MindLayout, type MindTheme } from './scene'
import { Popover } from '../../ui/Popover'
import { Dropdown } from '../../ui/Dropdown'

export function TemplatePicture({ type }: { type: TemplateId }) {
  if (type === 'mindmap' || type === 'org') return <svg viewBox="0 0 240 124" fill="none" aria-hidden="true">
    {type === 'mindmap' ? <><path d="M110 62H76V32H38m38 30v30H38m92-30h34V26h38m-38 36v35h38" stroke="#b4bfd4" strokeWidth="1.5" /><rect x="89" y="48" width="62" height="28" rx="4" fill="#3370ff" /><rect x="13" y="22" width="55" height="20" rx="3" fill="#e7f4ed" /><rect x="13" y="82" width="55" height="20" rx="3" fill="#fff0d1" /><rect x="174" y="16" width="55" height="20" rx="3" fill="#eee5fa" /><rect x="174" y="87" width="55" height="20" rx="3" fill="#ffe7e5" /></> : <><path d="M120 42v18H35v20m85-20v20m0-20h85v20" stroke="#b4bfd4" /><rect x="88" y="17" width="64" height="27" rx="3" fill="#3370ff" />{[10, 95, 180].map((x, i) => <rect key={x} x={x} y="80" width="50" height="25" rx="3" fill={['#e7f4ed', '#fff0d1', '#eee5fa'][i]} />)}</>}
  </svg>
  if (type === 'flywheel') return <svg viewBox="0 0 240 124" fill="none" aria-hidden="true"><path d="M133 22c33 0 59 17 59 40m-1 8c0 24-30 38-65 38m-14 0c-36 0-64-16-64-39m0-13c0-22 29-36 64-36" stroke="#89a9e5" strokeWidth="2" /><path d="m187 56 5 8 5-8m-66 48-7 4 7 4M43 73l5-8 5 8m52-57 8 4-8 4" stroke="#89a9e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />{[[92, 8], [173, 48], [92, 94], [10, 48]].map(([x, y], i) => <rect key={i} x={x} y={y} width="55" height="23" rx="4" fill={['#eaf1ff', '#e5f6ee', '#fff4d9', '#f2eafb'][i]} />)}<circle cx="120" cy="62" r="15" fill="#f5f7fa" /><path d="m113 65 6-7 5 3 6-7m-5 0h5v5" stroke="#3370ff" strokeWidth="1.6" /></svg>
  if (type === 'architecture') return <svg viewBox="0 0 240 124" fill="none" aria-hidden="true"><path d="M40 62h23m42 0h28V25h20m-20 37h20m-20 0v37h20m30-74h16v74h-16m16-37h15" stroke="#b4bfd4" strokeWidth="1.5" /><rect x="10" y="48" width="30" height="28" rx="3" fill="#eaf1ff" /><rect x="63" y="42" width="42" height="40" rx="3" fill="#e5f6ee" />{[13, 50, 87].map(y => <rect key={y} x="153" y={y} width="30" height="24" rx="3" fill="#f2eafb" />)}<rect x="214" y="40" width="20" height="44" rx="6" fill="#fff4d9" /><ellipse cx="224" cy="45" rx="10" ry="5" stroke="#d4ab55" /></svg>
  return <svg viewBox="0 0 240 124" fill="none" aria-hidden="true">
    {type === 'timeline' ? <><path d="M20 62h200" stroke="#a7c3f8" strokeWidth="3" />{[28, 88, 148, 208].map((x, i) => <g key={x}><circle cx={x} cy="62" r="5" fill="#3370ff" /><rect x={x - 22} y={i % 2 ? 78 : 20} width="44" height="24" rx="3" fill={i % 2 ? '#e5f6ee' : '#eaf1ff'} /></g>)}</> : type === 'pyramid' ? <><path d="m120 10 28 32H92l28-32Z" fill="#9bbaff" /><path d="m90 46 60 0 28 32H62l28-32Z" fill="#a8dfc0" /><path d="m59 82 122 0 28 32H31l28-32Z" fill="#f5d98c" /></> : type === 'wireframe' ? <><rect x="85" y="5" width="70" height="114" rx="9" stroke="#8da4ca" /><rect x="92" y="21" width="56" height="31" rx="3" fill="#dae7ff" />{[62, 77, 92].map(y => <rect key={y} x="93" y={y} width="54" height="9" rx="2" fill="#edf0f4" />)}</> : type === 'retro' ? <>{[26, 92, 158].map((x, i) => <g key={x}><rect x={x} y="17" width="55" height="19" rx="2" fill={['#dbe8ff', '#d7efdf', '#fbedc8'][i]} /><rect x={x + 3} y="45" width="49" height="28" fill={['#e9f0ff', '#e6f4eb', '#fff6dd'][i]} /><rect x={x + 3} y="80" width="49" height="28" fill={['#e9f0ff', '#e6f4eb', '#fff6dd'][i]} /></g>)}</> : <><path d="M60 62h120M120 25v74" stroke="#c0cad9" />{[[20, 48], [93, 10], [166, 48], [93, 86]].map(([x, y], i) => <rect key={i} x={x} y={y} width="55" height="27" rx="4" fill={['#eaf1ff', '#e5f6ee', '#fff4d9', '#f2eafb'][i]} />)}</>}
  </svg>
}

export function TemplateStarter({ onInsert, onMore, onClose, onPreview }: { onInsert: (id: TemplateId) => void; onMore: () => void; onClose: () => void; onPreview: (id: TemplateId | null) => void }) {
  const t = useCanvasI18n()
  return <aside className="template-starter" aria-label={t('template.from')} onPointerLeave={() => onPreview(null)} onKeyDown={event => {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault(); event.stopPropagation()
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.template-starter-list button')]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    buttons[(index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length]?.focus()
  }}>
    <header><strong>{t('template.from')}</strong><button type="button" aria-label={t('menu.close')} onClick={onClose}><BoardIcon name="close" size={16} /></button></header>
    <p>{t('template.keyboardHint')}</p>
    <div className="template-starter-list">{templateIds.map((id, i) => <button type="button" key={id} data-canvas-insert={`template:${id}`} onPointerEnter={() => onPreview(id)} onFocus={() => onPreview(id)} onClick={() => onInsert(id)}><span className={`template-mini-icon tone-${i}`}><BoardIcon name={id === 'mindmap' || id === 'org' ? 'mindmap' : id === 'wireframe' ? 'rect' : id === 'retro' ? 'note' : 'layout'} size={18} /></span>{t(`template.${id}` as MessageKey)}</button>)}</div>
    <button type="button" className="template-more" onClick={onMore}>{t('template.more')}</button>
  </aside>
}

export function TemplateGallery({ onInsert, onClose }: { onInsert: (id: TemplateId) => void; onClose: () => void }) {
  const t = useCanvasI18n(), [category, setCategory] = useState('all'), [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus(); const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [onClose])
  return <div className="template-gallery-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="template-gallery" role="dialog" aria-modal="true" aria-label={t('template.library')}>
      <header><div><BoardIcon name="templates" size={24} /><strong>{t('template.library')}</strong></div><button type="button" aria-label={t('menu.close')} onClick={onClose}><BoardIcon name="close" /></button></header>
      <div className="template-gallery-body"><nav aria-label={t('template.category')}>{['all', 'mind', 'flow', 'plan', 'team', 'design'].map(item => <button type="button" key={item} className={category === item ? 'is-active' : ''} onClick={() => setCategory(item)}>{t(`template.category.${item}` as MessageKey)}</button>)}</nav>
        <main><label className="board-search-input"><BoardIcon name="search" size={17} /><input ref={input} aria-label={t('template.search')} placeholder={t('template.search')} value={query} onChange={event => setQuery(event.target.value)} /></label>
          <h2>{t(`template.category.${category}` as MessageKey)}</h2>
          <div className="template-card-grid">{templateIds.filter(id => (category === 'all' || templateCategories[id] === category) && t(`template.${id}` as MessageKey).toLowerCase().includes(query.toLowerCase())).map(id => <button type="button" className="template-card" key={id} data-canvas-insert={`template:${id}`} onClick={() => onInsert(id)}><div className="template-card-picture"><TemplatePicture type={id} /></div><span>{t(`template.${id}` as MessageKey)}</span></button>)}</div>
          {!templateIds.some(id => (category === 'all' || templateCategories[id] === category) && t(`template.${id}` as MessageKey).toLowerCase().includes(query.toLowerCase())) && <p className="board-empty-result">{t('search.empty')}</p>}
        </main></div>
    </section>
  </div>
}

export function ThinkingContextTools({ selection, onMindAction, onLayout, onTheme, onStyle, onMoreStyles }: { selection: IUI[]; onMindAction: (action: 'child' | 'sibling' | 'parent' | 'collapse') => void; onLayout: (layout: MindLayout) => void; onTheme: (theme: MindTheme) => void; onStyle: (key: string, value: string | number) => void; onMoreStyles: () => void }) {
  const t = useCanvasI18n(), item = selection[0], node = mindNode(item), map = mindMap(item), table = ancestor(item, 'table')
  const strokeItem = kind(item) === 'diagram-node' || table === item ? item.children?.[0] || item : item
  const label = table ? table.children?.[0] && labelOf(table.children[0]) : item?.tag === 'Text' ? item as Text : item && labelOf(item)
  const textCapable = selection.length > 0 && selection.every(item => kind(item) !== 'attachment' && (item.tag === 'Text' || Boolean(labelOf(item))))
  const fillCapable = selection.length > 0 && selection.every(item => !isConnector(item) && kind(item) !== 'connector-label' && !['Text', 'Image', 'Line'].includes(item.tag) && item.name !== 'path')
  const strokeCapable = selection.length > 0 && selection.every(item => kind(item) !== 'connector-label' && !['Text', 'Image'].includes(item.tag))
  const palette = ['#ffffff', '#eaf1ff', '#dcefe4', '#fff1c4', '#f2e5fa', '#ffe5e3', '#3370ff', '#36a872', '#e5a329', '#9254de', '#646a73', '#1f2329']
  if (selection.length && selection.every(isConnector)) return <>
    <Popover label={t('style.stroke')} icon={<BoardIcon name="color" />} className="context-style-popover"><div className="context-color-grid">{palette.map(color => <button type="button" key={color} aria-label={`${t('style.stroke')} ${color}`} style={{ background: color }} onClick={() => onStyle('stroke', color)} />)}</div></Popover>
    <Dropdown label={t('style.strokeWidth')} value={Number(strokeItem.strokeWidth ?? 1.5)} onChange={value => onStyle('strokeWidth', value)} options={[0, 1, 1.5, 2, 3, 4, 6].map(value => ({ value, label: String(value) }))} />
    <Popover label={t('connector.mode')} icon={<BoardIcon name={String(item.data?.mode || 'elbow')} />} className="context-style-popover">{(['elbow', 'straight', 'curve'] as const).map(mode => <button type="button" className="menu-item" role="menuitemradio" aria-checked={item.data?.mode === mode} key={mode} onClick={() => onStyle('routeMode', mode)}>{t(`connector.${mode}`)}</button>)}</Popover>
    <Popover label={t('connector.lineStyle')} icon={<span>┄</span>} className="context-style-popover">{(['solid', 'dashed', 'dotted'] as const).map(mode => <button type="button" className="menu-item" key={mode} onClick={() => onStyle('lineDash', mode)}>{t(`connector.${mode}`)}</button>)}</Popover>
    <button type="button" className="icon-button" aria-label={t('connector.resetRoute')} title={t('connector.resetRoute')} onClick={() => onStyle('resetRoute', 1)}>↺</button>
    <span className="toolbar-divider" />
    {(['startHead', 'endHead'] as const).map(key => <Popover key={key} label={t(`connector.${key}`)} icon={<span>{key === 'startHead' ? '←' : '→'}</span>} className="context-style-popover">{(['none', 'arrow', 'triangle', 'circle'] as const).map(head => <button type="button" className="menu-item" role="menuitemradio" aria-checked={(item.data?.[key] || (key === 'startHead' ? 'none' : 'arrow')) === head} key={head} onClick={() => onStyle(key, head)}>{t(`connector.head.${head}`)}</button>)}</Popover>)}
    <span className="toolbar-divider" />
  </>
  return <>
    {selection.length > 0 && selection.every(item => ancestor(item, 'note')) && <Popover fitViewport label={t('note.presets')} icon={<BoardIcon name="note" />} className="note-preset-popover"><NotePresetPicker onPick={id => onStyle('notePreset', id)} /></Popover>}
    {fillCapable && <Popover label={t('style.fill')} icon={<BoardIcon name="fill" />} className="context-style-popover"><div className="context-color-grid">{palette.map(color => <button type="button" key={color} aria-label={`${t('style.fill')} ${color}`} style={{ background: color }} onClick={() => onStyle('fill', color)} />)}</div></Popover>}
    {strokeCapable && <Popover label={t('style.stroke')} icon={<BoardIcon name="border" />} className="context-style-popover"><div className="context-color-grid">{palette.map(color => <button type="button" key={color} aria-label={`${t('style.stroke')} ${color}`} style={{ background: color }} onClick={() => onStyle('stroke', color)} />)}</div></Popover>}
    {strokeCapable && <><Dropdown label={t('style.strokeWidth')} value={Number(strokeItem.strokeWidth ?? 1.5)} onChange={value => onStyle('strokeWidth', value)} options={[0, 1, 1.5, 2, 3, 4, 6].map(value => ({ value, label: String(value) }))} /><Popover label={t('connector.lineStyle')} icon={<span>┄</span>} className="context-style-popover">{(['solid', 'dashed', 'dotted'] as const).map(mode => <button type="button" className="menu-item" key={mode} onClick={() => onStyle('lineDash', mode)}>{t(`connector.${mode}`)}</button>)}</Popover><span className="toolbar-divider" /></>}
    {textCapable && <>
    <Dropdown label={t('style.fontSize')} value={Number(label?.fontSize || 16)} onChange={value => onStyle('fontSize', value)} options={[12, 14, 16, 18, 20, 24, 28, 32, 36, 48].map(value => ({ value, label: String(value) }))} />
    <button type="button" className={`icon-button ${Number(label?.fontWeight) >= 600 ? 'is-toggled' : ''}`} aria-label={t('style.weight.bold')} onClick={() => onStyle('fontWeight', Number(label?.fontWeight) >= 600 ? 400 : 700)}><BoardIcon name="bold" size={18} /></button>
    <Popover label={t('style.text')} icon={<BoardIcon name="color" />} className="context-style-popover"><div className="context-color-grid">{palette.map(color => <button type="button" key={color} aria-label={`${t('style.text')} ${color}`} style={{ background: color }} onClick={() => onStyle('fontColor', color)} />)}</div></Popover>
    </>}
    {selection.length === 1 && (table || ['note', 'card', 'diagram-node'].includes(kind(item) || item.name || '')) && <>
      <TextAlignmentControl horizontal={horizontalAlign(label?.textAlign)} vertical={label?.verticalAlign || 'top'} onHorizontal={align => onStyle('textAlign', align)} onVertical={align => onStyle('verticalAlign', align)} />
    </>}
    {selection.length === 1 && node && <><span className="toolbar-divider" /><Popover label={t('mind.theme')} icon={<BoardIcon name="templates" />} className="context-style-popover">{(['blue', 'green', 'warm', 'mono'] as MindTheme[]).map(theme => <button type="button" className="menu-item mind-theme-option" role="menuitemradio" aria-checked={(map?.data?.theme || 'blue') === theme} key={theme} onClick={() => onTheme(theme)}><i style={{ background: ({ blue: '#3370ff', green: '#25845b', warm: '#d27d2c', mono: '#41454c' })[theme] }} />{t(`mind.theme.${theme}` as MessageKey)}</button>)}</Popover><Popover label={t('mind.layout')} icon={<BoardIcon name="layout" />} className="context-style-popover">{layoutKeys.map(layout => <button type="button" key={layout} role="menuitemradio" aria-checked={map?.data?.layout === layout} className="menu-item" onClick={() => onLayout(layout)}>{t(`mind.layout.${layout}` as MessageKey)}</button>)}</Popover><button type="button" className="icon-button" aria-label={t('mind.addChild')} onClick={() => onMindAction('child')}><BoardIcon name="plus" size={18} /></button><button type="button" className="icon-button" aria-label={t('mind.collapse')} onClick={() => onMindAction('collapse')}><BoardIcon name="collapse" size={19} /></button></>}
    {isConnector(item) && <Popover label={t('connector.mode')} icon={<BoardIcon name="connector" />} className="context-style-popover">{['elbow', 'straight', 'curve'].map(mode => <button type="button" className="menu-item" key={mode} onClick={() => onStyle('routeMode', mode)}>{t(`connector.${mode}` as MessageKey)}</button>)}</Popover>}
    <button type="button" className="icon-button" aria-label={t('style.more')} onClick={onMoreStyles}><BoardIcon name="dots" /></button><span className="toolbar-divider" />
  </>
}

export function BoardMinimap({ app, onNavigate }: { app: App; onNavigate: (point: { x: number; y: number }) => void }) {
  const t = useCanvasI18n()
  const [, redraw] = useState(0)
  useEffect(() => {
    let frame: number | undefined
    const paint = () => { if (frame === undefined) frame = requestAnimationFrame(() => { frame = undefined; redraw(n => n + 1) }) }
    const ids = [app.on_(MoveEvent.MOVE, paint), app.on_(ZoomEvent.ZOOM, paint), app.tree.on_(LayoutEvent.AFTER, paint)]
    return () => { if (frame !== undefined) cancelAnimationFrame(frame); app.off_(ids) }
  }, [app])
  const nodes = app.tree.children.filter(item => !item.skipJSON && item.visible !== false && !['connector', 'mind-edge'].includes(kind(item)))
  const bounds = nodes.map(item => item.getBounds('box', 'page'))
  if (!bounds.length) return <div className="board-minimap"><span>{t('board.empty')}</span></div>
  const x = Math.min(...bounds.map(b => b.x)), y = Math.min(...bounds.map(b => b.y)), width = Math.max(1, Math.max(...bounds.map(b => b.x + b.width)) - x), height = Math.max(1, Math.max(...bounds.map(b => b.y + b.height)) - y)
  const host = (app.view as HTMLElement).getBoundingClientRect(), from = app.tree.getInnerPoint(app.tree.getWorldPointByClient({ clientX: host.left, clientY: host.top })), to = app.tree.getInnerPoint(app.tree.getWorldPointByClient({ clientX: host.right, clientY: host.bottom }))
  const navigate = (event: React.PointerEvent<SVGSVGElement>) => {
    const matrix = event.currentTarget.getScreenCTM()
    if (!matrix) return
    event.preventDefault(); event.stopPropagation()
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()); onNavigate(point)
  }
  return <div className="board-minimap"><svg viewBox={`${x - 20} ${y - 20} ${width + 40} ${height + 40}`} aria-label={t('board.minimap')} onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); navigate(event) }} onPointerMove={event => { if (event.buttons === 1 && event.currentTarget.hasPointerCapture(event.pointerId)) navigate(event) }}>{nodes.map((item, index) => <rect key={item.id || index} x={bounds[index].x} y={bounds[index].y} width={bounds[index].width} height={bounds[index].height} fill="#e1eaff" stroke="#9bb5ed" strokeWidth={Math.max(width, height) / 250} tabIndex={0} role="button" aria-label={String(labelOf(item)?.text || item.name || t('board.element'))} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); const b = bounds[index]; onNavigate({ x: b.x + b.width / 2, y: b.y + b.height / 2 }) } }} />)}<rect className="board-minimap-viewport" x={from.x} y={from.y} width={Math.max(0, to.x - from.x)} height={Math.max(0, to.y - from.y)} fill="#3370ff12" stroke="#3370ff" strokeWidth={Math.max(width, height) / 200} pointerEvents="none" /></svg></div>
}

export function ShapesLibrary({ onPick, onClose }: { onPick: (key: string) => void; onClose: () => void }) {
  const t = useCanvasI18n(), [query, setQuery] = useState('')
  const shapes = ['rounded', 'rect', 'ellipse', 'diamond', 'parallelogram', 'cylinder', 'triangle', 'hexagon', 'cloud', 'document']
  return <aside className="board-shapes-library" aria-label={t('board.shapeLibrary')}><header><strong>{t('board.shapes')}</strong><button type="button" aria-label={t('menu.close')} onClick={onClose}><BoardIcon name="back" size={16} /></button></header><label className="board-search-input"><BoardIcon name="search" size={16} /><input aria-label={t('board.searchShapes')} placeholder={t('search.title')} value={query} onChange={event => setQuery(event.target.value)} /></label><div className="shape-library-scroll">
    <h3>{t('board.basic')}</h3><div className="library-shape-grid">{shapes.filter(shape => t(`shape.${shape}` as MessageKey).includes(query)).map(shape => <button type="button" key={shape} data-canvas-insert={`diagram:${shape}`} title={t(`shape.${shape}` as MessageKey)} aria-label={t(`shape.${shape}` as MessageKey)} onClick={() => onPick(`diagram:${shape}`)}><BoardIcon name={shape} size={25} /></button>)}</div>
    <h3>{t('board.connector')}</h3><div className="library-shape-grid">{['straight', 'elbow', 'curve'].filter(mode => t(`connector.${mode}` as MessageKey).includes(query)).map(mode => <button type="button" key={mode} data-canvas-insert={`connector:${mode}`} title={t(`connector.${mode}` as MessageKey)} aria-label={t(`connector.${mode}` as MessageKey)} onClick={() => onPick(`connector:${mode}`)}><BoardIcon name={mode} size={26} /></button>)}</div>
    <h3>{t('board.table')}</h3><div className="library-shape-grid">{[2, 3, 4].map(size => <button type="button" key={size} data-canvas-insert={`table:${size}:${size}`} aria-label={`${t('board.table')} ${size} × ${size}`} onClick={() => onPick(`table:${size}:${size}`)}><BoardIcon name="table" size={25} /></button>)}</div>
    <h3>{t('board.flowchart')}</h3><div className="library-shape-grid">{['rounded', 'ellipse', 'diamond', 'document', 'cylinder', 'parallelogram'].map(shape => <button type="button" key={shape} data-canvas-insert={`diagram:${shape}`} title={t(`shape.${shape}` as MessageKey)} aria-label={`${t('board.flowchart')} ${t(`shape.${shape}` as MessageKey)}`} onClick={() => onPick(`diagram:${shape}`)}><BoardIcon name={shape} size={25} /></button>)}</div>
    <h3>{t('board.mindmap')}</h3><div className="library-shape-grid">{layoutKeys.map(layout => <button type="button" key={layout} data-canvas-insert={`mindmap:${layout}`} title={t(`mind.layout.${layout}` as MessageKey)} aria-label={t(`mind.layout.${layout}` as MessageKey)} onClick={() => onPick(`mindmap:${layout}`)}><BoardIcon name={layout === 'down' ? 'layout' : 'mindmap'} size={25} /></button>)}</div>
  </div></aside>
}

export function MindOutline({ app, onReveal, onClose }: { app: App; onReveal: (id: string) => void; onClose: () => void }) {
  const t = useCanvasI18n()
  const groups: IUI[] = []
  const visit = (items: IUI[]) => items.forEach(item => { if (kind(item) === 'mindmap') groups.push(item); else if (item.children) visit(item.children) })
  visit(app.tree.children)
  return <aside className="board-outline"><header><strong>{t('board.outline')}</strong><button type="button" aria-label={t('menu.close')} onClick={onClose}><BoardIcon name="close" size={18} /></button></header>{!groups.length && <p>{t('mind.outlineEmpty')}</p>}{groups.map(group => {
    const nodes = group.children!.filter(node => kind(node) === 'mind-node')
    const rows = (parentId: string, depth: number): React.ReactNode => depth > 32 ? null : nodes.filter(node => String(node.data?.parentId || '') === parentId).map(node => <div key={node.id}><button type="button" style={{ paddingLeft: 18 + depth * 16 }} onClick={() => onReveal(node.id!)}><span className="outline-dot" />{String(labelOf(node)?.text || t('mind.untitled'))}</button>{rows(node.id!, depth + 1)}</div>)
    return <div className="outline-tree" key={group.id}>{rows('', 0)}</div>
  })}</aside>
}
