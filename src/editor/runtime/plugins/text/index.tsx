import type { IUI } from "leafer-ui";
import type { Plugins, styleValue } from "../plugins";
import { AddMenu } from "./AddMenu";
import { NAME, STYPE_CONTROLL_KEYS } from "./const";
import { registerEvent } from "./listener";
import { FontFamilySelector, FontSizeSelector, LetterSpacingSelector, LineHeightSelector } from "./styleRender";

const textPlugin: Plugins = {
    name: NAME,
    shortcut: 't',
    AddMenu: AddMenu,
    styleControlKeys: STYPE_CONTROLL_KEYS,
    customStyleControlRenders: [
        { key: 'fontFamily', title: '字体', order: 4.5, render: FontFamilySelector },
        {
            key: 'fontSize',
            title: '字体大小',
            order: 5,
            render: FontSizeSelector,
        },
        { key: 'letterSpacing', title: '字间距', order: 8.5, render: LetterSpacingSelector },
        { key: 'lineHeight', title: '行高', order: 8.6, render: LineHeightSelector },
    ],
    RegisterEvent: registerEvent,
    setStyleCustom: {
        fontColor: (i: IUI, value: styleValue) => {
            i.set({ fill: value as string | undefined })
        }
    },
    getStyleCustom: {
        fontColor: (i: IUI): styleValue => {
            return i.fill as string | undefined
        }
    },
}

export { textPlugin }
