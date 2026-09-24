import type { AddMenuProps } from "../plugins"
import { CircleToolIcon, IconButton } from "../../../ui/Controls"
import { DragEvent, Ellipse } from "leafer-ui"
import { useEffect } from "react"
import { NAME, STYPE_CONTROLL_KEYS } from "./const"
import { getStyleParamByKeyList } from "../../utils/styleLocalStorage"
import { applyCurrentRoughStyle, updateCurrentRoughPreview } from "../../utils/roughStyle"

const AddMenu: React.FC<AddMenuProps> = (props) => {
    const { app, activeKey, onCreateComplete, onClick } = props
    const isActive = activeKey === NAME

    useEffect(() => {
        if (!app) {
            return
        }

        if (isActive) {
            app.mode = 'draw'

            let ellipse: Ellipse
            const events = [
                app.on_(DragEvent.START, () => {
                    const styleParams = getStyleParamByKeyList(STYPE_CONTROLL_KEYS)
                    ellipse = new Ellipse({ name: NAME, editable: true, cornerRadius: [10, 10, 10, 10], ...styleParams })
                    app.tree.add(ellipse)
                }),

                app.on_(DragEvent.DRAG, (e: DragEvent) => {
                    if (ellipse) { ellipse.set(e.getPageBounds()); updateCurrentRoughPreview(ellipse) } // 获取事件在 page 坐标系中绘制形成的包围盒
                }),

                app.on_(DragEvent.END, () => {
                    if (ellipse) applyCurrentRoughStyle(ellipse)
                    app.mode = 'normal'
                    onCreateComplete()
                    app.off_(events) // 解绑事件  

                    app.editor.select(ellipse) // 方便调整属性
                })
            ]

            return () => app.off_(events)
        }
    }, [app, isActive, onCreateComplete])

    return <IconButton label="椭圆 (O)" icon={<CircleToolIcon />} active={isActive} onClick={() => onClick(NAME)} />
}

export { AddMenu }
