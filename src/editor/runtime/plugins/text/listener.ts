import { DragEvent, PointerEvent, Text } from "leafer-ui"
import type { RegisterEventFuncParam } from "../plugins"
import { NAME, STYPE_CONTROLL_KEYS } from "./const"
import { getStyleParamByKeyList } from "../../utils/styleLocalStorage"

const registerEvent = (param: RegisterEventFuncParam) => {
    const { app } = param

    app.on(PointerEvent.DOUBLE_CLICK, (e: DragEvent) => {
        // 如果当前不在正常模式，或者有选中元素，则不响应双击事件
        if (param.canEdit?.() === false || app.mode !== 'normal' || app.editor.list.length > 0) {
            return
        }

        app.mode = 'draw'
        const styleParams = getStyleParamByKeyList(STYPE_CONTROLL_KEYS)
        const { x, y } = e.getPagePoint()
        const fontColor = styleParams['fontColor']
        const text = new Text({ name: NAME, x: x, y: y, editable: true, resizeFontSize: true, lockRatio: true, editConfig: { editSize: 'font-size', lockRatio: true }, fill: fontColor, ...styleParams })
        app.tree.add(text)
        app.editor.select(text)
        app.editor.openInnerEditor(text, true)

        app.mode = 'normal'
    })
}

export { registerEvent }
