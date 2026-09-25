import type { AddMenuProps } from "../plugins"
import { Text as TextIcon } from "@icon-park/react"
import { IconButton } from "../../../ui/Controls"
import { DragEvent, PointerEvent, Text as LeaferText } from "leafer-ui"
import { useEffect } from "react"
import { NAME, STYPE_CONTROLL_KEYS } from "./const"
import { getStyleParamByKeyList } from "../../utils/styleLocalStorage"
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

            const events = [
                app.on_(PointerEvent.TAP, (e: DragEvent) => {
                    const styleParams = getStyleParamByKeyList(STYPE_CONTROLL_KEYS)

                    const { x, y } = e.getPagePoint()
                    const fontColor = styleParams['fontColor']
                    const text = new LeaferText({ name: NAME, x: x, y: y, editable: true, resizeFontSize: true, lockRatio: true, editConfig: { editSize: 'font-size', lockRatio: true }, fill: fontColor as string | undefined, ...styleParams })
                    app.tree.add(text)
                    app.editor.select(text)
                    app.editor.openInnerEditor(text, true)

                    app.mode = 'normal'
                    onCreateComplete()
                    app.off_(events)
                }),
            ]

            return () => app.off_(events)
        }
    }, [app, isActive, onCreateComplete])

    return <IconButton label={t('toolbar.text')} icon={<TextIcon />} active={isActive} onClick={() => onClick(NAME)} />
}

export { AddMenu } 
