import type { Plugins } from "../plugins";
import { AddMenu } from "./AddMenu";
import { NAME, STYPE_CONTROLL_KEYS } from "./const";

const ellipsePlugin: Plugins = {
    name: NAME,
    shortcut: 'o',
    AddMenu: AddMenu,
    styleControlKeys: STYPE_CONTROLL_KEYS,
    customStyleControlRenders: [],
    setStyleCustom: {},
    getStyleCustom: {},
}

export { ellipsePlugin }
