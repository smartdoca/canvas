/* eslint-disable react-refresh/only-export-components */
import { Square } from '@icon-park/react'
import { DragEvent, Ellipse, Rect } from 'leafer-ui'
import { useEffect } from 'react'
import { CircleToolIcon, IconButton } from '../../ui/Controls'
import type { AddMenuProps, Plugins } from './plugins'
import { getStyleParamByKeyList } from '../utils/styleLocalStorage'
import { applyCurrentRoughStyle, updateCurrentRoughPreview } from '../utils/roughStyle'
import { STYPE_CONTROLL_KEYS as RECT_KEYS } from './rect/const'
import { STYPE_CONTROLL_KEYS as ELLIPSE_KEYS } from './ellipse/const'

function squareBounds(bounds: { x: number; y: number; width: number; height: number }) {
  const side = Math.max(Math.abs(bounds.width), Math.abs(bounds.height))
  return { x: bounds.x, y: bounds.y, width: side, height: side }
}

function SquareMenu({ app, activeKey, onClick, onCreateComplete }: AddMenuProps) {
  const active = activeKey === 'square'
  useEffect(() => {
    if (!active) return
    app.mode = 'draw'; let item: Rect | undefined
    const events = [app.on_(DragEvent.START, () => { item = new Rect({ name: 'square', editable: true, lockRatio: true, ...getStyleParamByKeyList(RECT_KEYS) }); app.tree.add(item) }), app.on_(DragEvent.DRAG, event => { if (item) { item.set(squareBounds(event.getPageBounds())); updateCurrentRoughPreview(item) } }), app.on_(DragEvent.END, () => { if (item) { applyCurrentRoughStyle(item); app.editor.select(item) } app.mode = 'normal'; onCreateComplete(); app.off_(events) })]
    return () => app.off_(events)
  }, [active, app, onCreateComplete])
  return <IconButton label="正方形" icon={<Square />} active={active} onClick={() => onClick('square')} />
}

function CircleMenu({ app, activeKey, onClick, onCreateComplete }: AddMenuProps) {
  const active = activeKey === 'circle'
  useEffect(() => {
    if (!active) return
    app.mode = 'draw'; let item: Ellipse | undefined
    const events = [app.on_(DragEvent.START, () => { item = new Ellipse({ name: 'circle', editable: true, lockRatio: true, ...getStyleParamByKeyList(ELLIPSE_KEYS) }); app.tree.add(item) }), app.on_(DragEvent.DRAG, event => { if (item) { item.set(squareBounds(event.getPageBounds())); updateCurrentRoughPreview(item) } }), app.on_(DragEvent.END, () => { if (item) { applyCurrentRoughStyle(item); app.editor.select(item) } app.mode = 'normal'; onCreateComplete(); app.off_(events) })]
    return () => app.off_(events)
  }, [active, app, onCreateComplete])
  return <IconButton label="圆形" icon={<CircleToolIcon />} active={active} onClick={() => onClick('circle')} />
}

export const squarePlugin: Plugins = { name: 'square', AddMenu: SquareMenu, styleControlKeys: RECT_KEYS, customStyleControlRenders: [], setStyleCustom: {}, getStyleCustom: {} }
export const circlePlugin: Plugins = { name: 'circle', AddMenu: CircleMenu, styleControlKeys: ELLIPSE_KEYS, customStyleControlRenders: [], setStyleCustom: {}, getStyleCustom: {} }
