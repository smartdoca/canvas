import type { Plugins } from "../plugins";
import { AddMenu } from "./AddMenu";
import { NAME, STYPE_CONTROLL_KEYS } from "./const";

const rectPlugin: Plugins = {
    name: NAME,
    shortcut: 'r',
    AddMenu: AddMenu,
    styleControlKeys: STYPE_CONTROLL_KEYS,
    customStyleControlRenders: [],
    setStyleCustom: {},
    getStyleCustom: {},
}

export { rectPlugin }
