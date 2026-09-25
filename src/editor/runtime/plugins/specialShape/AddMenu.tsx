import { DragEvent, Path } from 'leafer-ui'
import { useEffect, useState } from 'react'
import { IconButton } from '../../../ui/Controls'
import { getStyleParamByKeyList } from '../../utils/styleLocalStorage'
import type { AddMenuProps } from '../plugins'
import { NAME, SPECIAL_SHAPES, STYLE_CONTROL_KEYS, type SpecialShapeType } from './const'
import { applyCurrentRoughStyle, fitSpecialPath, updateCurrentRoughPreview } from '../../utils/roughStyle'
import { useCanvasI18n } from '../../../../i18n/context'
import type { MessageKey } from '../../../../i18n/en'

function ShapeIcon({ path }: { path?: string }) {
  return <svg viewBox="0 0 100 100" aria-hidden="true"><path d={path || 'M12 52 C25 12 45 84 62 31 C73 2 91 37 86 70 C80 93 28 94 12 52 Z'} fill="none" stroke="currentColor" strokeWidth="7" strokeLinejoin="round" /></svg>
}

export function AddMenu({ app, activeKey, onClick, onCreateComplete, customShapes = [] }: AddMenuProps) {
  const [shapeType, setShapeType] = useState<SpecialShapeType>('heart')
  const active = activeKey === NAME
  const t = useCanvasI18n()
  const shapes = [...SPECIAL_SHAPES, ...customShapes]
  const selectedShape = shapes.find((item) => item.type === shapeType) || shapes[0]

  useEffect(() => {
    if (!active) return
    app.mode = 'draw'
    let shape: Path | undefined
    let intrinsicWidth = 100
    let intrinsicHeight = 100
    let intrinsicX = 0
    let intrinsicY = 0
    const events = [
      app.on_(DragEvent.START, (event: DragEvent) => {
        const point = event.getPagePoint()
        shape = new Path({ name: NAME, editable: true, path: selectedShape.path, x: point.x, y: point.y, scaleX: 1, scaleY: 1, ...getStyleParamByKeyList(STYLE_CONTROL_KEYS) })
        shape.data = { ...(shape.data || {}), specialShapeType: selectedShape.type, customPath: selectedShape.path }
        app.tree.add(shape)
        // Measure the authored path before any Rough conversion. Converting at
        // pointer-down can interrupt creation for complex/multi-subpath shapes;
        // the final Rough path is applied once on pointer-up instead.
        shape.updateLayout()
        const intrinsicBounds = shape.getBounds('box', 'inner')
        intrinsicX = intrinsicBounds.x
        intrinsicY = intrinsicBounds.y
        intrinsicWidth = Math.max(1, intrinsicBounds.width)
        intrinsicHeight = Math.max(1, intrinsicBounds.height)
        shape.set({ path: fitSpecialPath(selectedShape.path, intrinsicBounds, 1, 1), x: point.x, y: point.y, scaleX: 1, scaleY: 1 })
      }),
      app.on_(DragEvent.DRAG, (event: DragEvent) => {
        if (!shape) return
        const bounds = event.getPageBounds()
        // Presets are authored around a 100×100 view box, but many paths (for
        // example the heart) do not actually occupy all 100 units. Scale by
        // the measured intrinsic path box so the result matches the drag box.
        shape.set({
          path: fitSpecialPath(selectedShape.path, { x: intrinsicX, y: intrinsicY, width: intrinsicWidth, height: intrinsicHeight }, Math.max(1, bounds.width), Math.max(1, bounds.height)),
          x: bounds.x,
          y: bounds.y,
          scaleX: 1,
          scaleY: 1,
        })
        updateCurrentRoughPreview(shape)
      }),
      app.on_(DragEvent.END, () => {
        if (shape) {
          applyCurrentRoughStyle(shape)
          // Keep the final transform used by the live preview. Setting Path
          // width/height here makes Leafer resolve it back to the preset's
          // intrinsic 100×100 box, so the element jumps after pointer-up.
          app.editor.select(shape)
        }
        onCreateComplete()
        app.off_(events)
      }),
    ]
    return () => app.off_(events)
  }, [active, app, onCreateComplete, selectedShape])

  return <div className="special-shape-tool">
    <IconButton label={t('toolbar.specialShape')} icon={<ShapeIcon path={selectedShape.path} />} active={active} onClick={(event) => { onClick(NAME); event.currentTarget.blur() }} />
    <div className="special-shape-menu" role="menu" aria-label={t('toolbar.specialShape')}>
      {shapes.map((item) => {
        const builtin = SPECIAL_SHAPES.some(shape => shape.type === item.type)
        const label = builtin ? t(`shape.${item.type}` as MessageKey) : item.label
        return <button key={item.type} type="button" role="menuitem" data-tooltip={label} aria-label={label} className={shapeType === item.type ? 'is-selected' : ''} onClick={(event) => { setShapeType(item.type as SpecialShapeType); onClick(NAME); event.currentTarget.blur() }}>
        <ShapeIcon path={item.path} />
      </button>
      })}
    </div>
  </div>
}
