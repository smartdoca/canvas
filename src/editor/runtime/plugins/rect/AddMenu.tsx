import type { AddMenuProps } from "../plugins"
import { RectangleOne } from "@icon-park/react"
import { IconButton } from "../../../ui/Controls"
import { DragEvent, Rect } from "leafer-ui"
import { useEffect } from "react"
import { NAME, STYPE_CONTROLL_KEYS } from "./const"
import { getStyleParamByKeyList } from "../../utils/styleLocalStorage"
import { applyCurrentRoughStyle, updateCurrentRoughPreview } from "../../utils/roughStyle"
import { useCanvasI18n } from "../../../../i18n/context"

const AddMenu: React.FC<AddMenuProps> = (props) => {
    const { app, activeKey, onCreateComplete, onClick } = props
    const isActive = activeKey === NAME
    const t = useCanvasI18n()

    useEffect(() => {
        if (!app) {
            return
        }

        if (isActive) {
            app.mode = 'draw'

            let rect: Rect
            const events = [
                app.on_(DragEvent.START, () => {
                    const styleParam = getStyleParamByKeyList(STYPE_CONTROLL_KEYS)
                    rect = new Rect({ name: NAME, editable: true, cornerRadius: [10, 10, 10, 10], ...styleParam })
                    app.tree.add(rect)
                }),

                app.on_(DragEvent.DRAG, (e: DragEvent) => {
                    if (rect) { rect.set(e.getPageBounds()); updateCurrentRoughPreview(rect) } // 获取事件在 page 坐标系中绘制形成的包围盒
                }),

                app.on_(DragEvent.END, () => {
                    if (rect) applyCurrentRoughStyle(rect)
                    app.mode = 'normal'
                    onCreateComplete()
                    app.off_(events) // 解绑事件  

                    app.editor.select(rect) // 方便调整属性
                })
            ]

            return () => app.off_(events)
        }
    }, [app, isActive, onCreateComplete])

    return <IconButton label={t('toolbar.rect')} icon={<RectangleOne />} active={isActive} onClick={() => onClick(NAME)} />
}

export { AddMenu }
