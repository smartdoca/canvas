import { mergeConfig } from 'vite'
import base from './phone-projection.vite.config.mjs'
export default mergeConfig(base, { cacheDir: 'tmp/qa-menu-viewport-vite' })
