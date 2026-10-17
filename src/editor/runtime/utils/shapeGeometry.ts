import type { IUI } from 'leafer-ui'
const pathNumber = (value: number) => Number(value.toFixed(3))
const pathTokens = (path: string) => path.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || []

export function fitSpecialPath(path: string, sourceBounds: { x: number; y: number; width: number; height: number }, width: number, height: number) {
  const tokens = pathTokens(path)
  let parameterIndex = 0
  tokens.forEach((token, index) => {
    if (/^[A-Za-z]$/.test(token)) { parameterIndex = 0; return }
    const axis = parameterIndex % 2
    const sourceStart = axis ? sourceBounds.y : sourceBounds.x
    const sourceSize = Math.max(0.001, axis ? sourceBounds.height : sourceBounds.width)
    const targetSize = axis ? height : width
    tokens[index] = String(pathNumber((Number(token) - sourceStart) / sourceSize * targetSize))
    parameterIndex += 1
  })
  return tokens.join(' ')
}

export function bakeSpecialShapeScale(item: IUI) {
  if (item.name !== 'special-shape') return false
  const attrs = item as unknown as Record<string, unknown>
  const scaleX = Number(item.scaleX ?? 1)
  const scaleY = Number(item.scaleY ?? 1)
  if (Math.abs(Math.abs(scaleX) - 1) < 0.001 && Math.abs(Math.abs(scaleY) - 1) < 0.001) return false
  if (typeof attrs.path !== 'string') return false

  const beforeWorld = { ...item.getBounds('box', 'world') }
  const beforeInner = { ...item.getBounds('box', 'inner') }
  const targetWidth = beforeInner.width * Math.abs(scaleX)
  const targetHeight = beforeInner.height * Math.abs(scaleY)
  attrs.path = fitSpecialPath(attrs.path, beforeInner, targetWidth, targetHeight)
  item.scaleX = Math.sign(scaleX) || 1
  item.scaleY = Math.sign(scaleY) || 1

  item.updateLayout()
  const afterWorld = item.getBounds('box', 'world')
  item.moveWorld(
    beforeWorld.x + beforeWorld.width / 2 - afterWorld.x - afterWorld.width / 2,
    beforeWorld.y + beforeWorld.height / 2 - afterWorld.y - afterWorld.height / 2,
  )
  return true
}
