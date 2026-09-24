import type { AddMenuProps } from "../plugins"
import { Write } from "@icon-park/react"
import { IconButton } from "../../../ui/Controls"
import { DragEvent, Path } from "leafer-ui"
import { useEffect } from "react"
import { NAME, STYPE_CONTROLL_KEYS } from "./const"
import { getStyleParamByKeyList } from "../../utils/styleLocalStorage"

const AddMenu: React.FC<AddMenuProps> = (props) => {
    const { app, activeKey, onClick } = props
    const isActive = activeKey === NAME

    useEffect(() => {
        if (!app) {
            return
        }

        if (isActive) {
            app.mode = 'draw'

            let path: Path | undefined
            const events = [
                app.on_(DragEvent.START, (e: DragEvent) => {
                    const styleParams = getStyleParamByKeyList(STYPE_CONTROLL_KEYS)
                    path = new Path({ name: NAME, editable: true, strokeCap: 'round', strokeJoin: 'round', path: '', ...styleParams })
                    app.tree.add(path)
                    const point = e.getPagePoint() // 转换事件为 page 坐标 = pen.getPagePoint(e)
                    path.pen.moveTo(point.x, point.y)
                }),

                app.on_(DragEvent.DRAG, (e: DragEvent) => {
                    const point = e.getPagePoint() // 转换事件为 page 坐标 = pen.getPagePoint(e)
                    path?.pen.lineTo(point.x, point.y)
                }),
                app.on_(DragEvent.END, () => {
                    // Pencil is a persistent tool: finish this stroke but keep drawing mode active.
                    path = undefined
                }),
            ]

            return () => app.off_(events)
        }
    }, [app, isActive])

    return <IconButton label="铅笔 (P)" icon={<Write />} active={isActive} onClick={() => onClick(isActive ? 'init' : NAME)} />
}

export { AddMenu }
