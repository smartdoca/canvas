import type { AddMenuProps } from "../plugins"
import { Text as TextIcon } from "@icon-park/react"
import { IconButton } from "../../../ui/Controls"
import { DragEvent, PointerEvent, Text as LeaferText } from "leafer-ui"
import { useEffect } from "react"
import { NAME } from "./const"
import { getTextStyleParams } from "./style"
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
                    const styleParams = getTextStyleParams()
                    const { x, y } = e.getPagePoint()
                    const text = new LeaferText({ name: NAME, x: x, y: y, editable: true, resizeFontSize: true, lockRatio: true, editConfig: { editSize: 'font-size', lockRatio: true }, ...styleParams })
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
