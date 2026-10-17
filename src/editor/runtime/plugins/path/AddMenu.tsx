import type { AddMenuProps } from "../plugins"
import { Write } from "@icon-park/react"
import { IconButton } from "../../../ui/Controls"
import { DragEvent, MoveEvent, Path, PathCreator, ZoomEvent } from "leafer-ui"
import { useEffect } from "react"
import { NAME, STYPE_CONTROLL_KEYS } from "./const"
import { getStyleParamByKeyList } from "../../utils/styleLocalStorage"
import { useCanvasI18n } from "../../../../i18n/context"
import { createElementId } from "../../../../model"

const AddMenu: React.FC<AddMenuProps> = (props) => {
    const { app, activeKey, onClick, onCreateComplete } = props
    const isActive = activeKey === NAME
    const t = useCanvasI18n()

    useEffect(() => {
        if (!app) {
            return
        }

        if (isActive) {
            app.mode = 'draw'

            let stroke: { preview: Path; pen: PathCreator; style: ReturnType<typeof getStyleParamByKeyList> } | undefined
            let frame: number | undefined
            const repaint = () => {
                frame = undefined
                if (!stroke) return
                // Never expose the pen's mutable command array to the renderer.
                stroke.preview.path = [...stroke.pen.path]
                stroke.preview.setTransform(app.tree.getTransform(app.sky))
            }
            const scheduleRepaint = () => {
                if (stroke && frame === undefined) frame = requestAnimationFrame(repaint)
            }
            const cancel = () => {
                if (frame !== undefined) cancelAnimationFrame(frame)
                frame = undefined
                stroke?.preview.destroy()
                stroke = undefined
            }
            const append = (e: DragEvent) => {
                if (!stroke) return
                const point = e.getInnerPoint(app.tree)
                if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return
                const data = stroke.pen.path
                if (point.x !== data[data.length - 2] || point.y !== data[data.length - 1]) stroke.pen.lineTo(point.x, point.y)
            }
            const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel() }
            const events = [
                app.on_(DragEvent.START, (e: DragEvent) => {
                    cancel()
                    const point = e.getInnerPoint(app.tree)
                    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return
                    const style = getStyleParamByKeyList(STYPE_CONTROLL_KEYS)
                    const pen = new PathCreator().moveTo(point.x, point.y)
                    const preview = new Path({ strokeCap: 'round', strokeJoin: 'round', ...style, hittable: false, path: [...pen.path] })
                    // In-progress strokes are view state: no history, autosave or
                    // model projection should run for every pointer movement.
                    app.sky.add(preview)
                    stroke = { preview, pen, style }
                    repaint()
                }),

                app.on_(DragEvent.DRAG, (e: DragEvent) => {
                    append(e)
                    scheduleRepaint()
                }),
                app.on_(DragEvent.END, (e: DragEvent) => {
                    if (!stroke) return
                    append(e)
                    const { pen, style } = stroke
                    cancel()
                    if (pen.path.length < 6) return
                    app.tree.add(new Path({ id: createElementId(), name: NAME, editable: true, strokeCap: 'round', strokeJoin: 'round', ...style, path: [...pen.path] }))
                    onCreateComplete()
                }),
                app.on_(MoveEvent.MOVE, scheduleRepaint),
                app.on_(ZoomEvent.ZOOM, scheduleRepaint),
            ]
            window.addEventListener('keydown', escape)
            window.addEventListener('blur', cancel)
            const view = app.view as HTMLElement
            view.addEventListener('pointercancel', cancel, true)

            return () => {
                app.off_(events)
                window.removeEventListener('keydown', escape)
                window.removeEventListener('blur', cancel)
                view.removeEventListener('pointercancel', cancel, true)
                cancel()
                if (!app.destroyed && app.mode === 'draw') app.mode = 'normal'
            }
        }
    }, [app, isActive, onCreateComplete])

    return <IconButton label={t('toolbar.pencil')} icon={<Write />} active={isActive} onClick={() => onClick(isActive ? 'init' : NAME)} />
}

export { AddMenu }
