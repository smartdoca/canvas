import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useCanvasI18n } from '../../../i18n/context'

interface Props { path: string; title?: string; onCancel: () => void; onConfirm: (path: string) => void }

function numbersOf(path: string) { return [...path.matchAll(/-?\d*\.?\d+/g)].map(match => Number(match[0])) }
function replaceNumbers(path: string, values: number[]) { let index = 0; return path.replace(/-?\d*\.?\d+/g, () => String(Math.round((values[index++] ?? 0) * 10) / 10)) }

export default function SpecialShapeEditorModal({ path: initialPath, title, onCancel, onConfirm }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const t = useCanvasI18n()
  const heading = title || t('shapeEditor.title')
  const [template, setTemplate] = useState(initialPath)
  const [values, setValues] = useState(() => numbersOf(initialPath))
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const path = useMemo(() => replaceNumbers(template, values), [template, values])
  const viewBounds = useMemo(() => {
    const xs = values.filter((_, index) => index % 2 === 0), ys = values.filter((_, index) => index % 2 === 1)
    const minX = xs.length ? Math.min(...xs) : 0, maxX = xs.length ? Math.max(...xs) : 100
    const minY = ys.length ? Math.min(...ys) : 0, maxY = ys.length ? Math.max(...ys) : 100
    const padding = Math.max(4, Math.max(maxX - minX, maxY - minY) * .08)
    return { x: minX - padding, y: minY - padding, width: Math.max(1, maxX - minX) + padding * 2, height: Math.max(1, maxY - minY) + padding * 2 }
  }, [values])
  const updateRaw = (next: string) => { setTemplate(next); setValues(numbersOf(next)) }
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragIndex === null || !svgRef.current) return
    const screenBounds = svgRef.current.getBoundingClientRect()
    const next = [...values]
    next[dragIndex] = (event.clientX - screenBounds.left) / screenBounds.width * viewBounds.width + viewBounds.x
    next[dragIndex + 1] = (event.clientY - screenBounds.top) / screenBounds.height * viewBounds.height + viewBounds.y
    setValues(next)
  }
  return <div className="shape-editor-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onCancel()}>
    <section className="shape-editor-modal" role="dialog" aria-modal="true" aria-label={heading}>
      <header><div><strong>{heading}</strong><span>{t('shapeEditor.hint')}</span></div><button aria-label={t('shapeEditor.close')} onClick={onCancel}>×</button></header>
      <div className="shape-editor-body">
        <div className="shape-editor-preview"><svg ref={svgRef} viewBox={`${viewBounds.x} ${viewBounds.y} ${viewBounds.width} ${viewBounds.height}`} onPointerMove={move} onPointerUp={() => setDragIndex(null)} onPointerCancel={() => setDragIndex(null)}>
          <path d={path} fill="rgba(98,87,232,.14)" stroke="#6257e8" strokeWidth="1.5" />
          {values.map((value, index) => index % 2 === 0 && values[index + 1] !== undefined ? <circle key={index} cx={value} cy={values[index + 1]} r={Math.max(viewBounds.width, viewBounds.height) / 55} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); setDragIndex(index) }} /> : null)}
        </svg></div>
        <aside><label>{t('shapeEditor.path')}</label><textarea spellCheck={false} value={path} onChange={event => updateRaw(event.target.value)} /><p>{t('shapeEditor.help')}</p></aside>
      </div>
      <footer><button onClick={onCancel}>{t('shapeEditor.cancel')}</button><button onClick={() => { setTemplate(initialPath); setValues(numbersOf(initialPath)) }}>{t('shapeEditor.revert')}</button><span /><button className="primary" disabled={!path.trim()} onClick={() => onConfirm(path)}>{t('shapeEditor.apply')}</button></footer>
    </section>
  </div>
}
