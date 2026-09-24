import type { Plugins } from "../plugins";
import { AddMenu } from "./AddMenu";
import { NAME, STYPE_CONTROLL_KEYS } from "./const";

const pathPlugin: Plugins = {
    name: NAME,
    shortcut: 'p',
    AddMenu: AddMenu,
    styleControlKeys: STYPE_CONTROLL_KEYS,
    customStyleControlRenders: [],
    setStyleCustom: {},
    getStyleCustom: {},
}

export { pathPlugin }
