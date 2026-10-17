import type { Plugins } from '../plugins'
import { AddMenu } from './AddMenu'

export const notePlugin: Plugins = { name: 'note', shortcut: 'n', AddMenu, styleControlKeys: ['fill', 'opacity'], customStyleControlRenders: [], getStyleCustom: {}, setStyleCustom: {} }
