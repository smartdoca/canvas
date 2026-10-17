import type { styleValue } from '../plugins/plugins'

const DEFAULT_STYLE_PARAMS: { [key: string]: styleValue } = {
    strokeWidth: 1.5,
    connectorMode: 'elbow',
    stroke: '#646a73',
    fill: undefined,
    dashPattern: undefined,
    cornerRadius: 8,
    fontColor: '#1d1d1d',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    fontSize: 16,
    fontWeight: 400,
    italic: false,
    textDecoration: 'none',
    textAlign: 'left',
    letterSpacing: 0,
    lineHeight: 1.5,
    sides: 5,
    corners: 5,
    opacity: 1,
}

// Preferences are ephemeral. Embeddable editors must not access host storage.
let sessionStyle = { ...DEFAULT_STYLE_PARAMS }
const setStyleParamsToLocalStorage = (param: { [key: string]: styleValue }) => { sessionStyle = { ...param } }

const getStyleParamsFromLocalStorage = (): { [key: string]: styleValue } => {
    return { ...DEFAULT_STYLE_PARAMS, ...sessionStyle }
}

const getStyleParamByKeyList = (keyList: string[]): { [key: string]: styleValue } => {
    const styleParamStr = getStyleParamsFromLocalStorage()
    const result: { [key: string]: styleValue } = {}
    keyList.forEach(key => {
        if (styleParamStr[key] !== undefined) {
            result[key] = styleParamStr[key]
        }
    })
    return result
}

const isStyleParamsExist = (): boolean => {
    return true
}

export { DEFAULT_STYLE_PARAMS, setStyleParamsToLocalStorage, getStyleParamsFromLocalStorage, getStyleParamByKeyList, isStyleParamsExist }
