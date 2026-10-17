import { type Frame, type IUIJSONData } from 'leafer-ui'
import { createElementId } from '../../../model'

type PhonePart = IUIJSONData & { role: string; tag: 'Rect' | 'Ellipse' | 'Path'; fill: string }

function roundedRect(x: number, y: number, width: number, height: number, radius: number) {
  return `M${x + radius} ${y}H${x + width - radius}Q${x + width} ${y} ${x + width} ${y + radius}V${y + height - radius}Q${x + width} ${y + height} ${x + width - radius} ${y + height}H${x + radius}Q${x} ${y + height} ${x} ${y + height - radius}V${y + radius}Q${x} ${y} ${x + radius} ${y}Z`
}

/** Hardware geometry is shared by the scene and both uncommitted previews. */
export function phoneFrameGeometry(width: number, height: number) {
  const scale = Math.min(width / 390, height / 844), radius = 46 * scale, inset = 13 * scale
  const parts: PhonePart[] = [
    { role: 'device-bezel', tag: 'Path', path: roundedRect(3 * scale, 0, width - 6 * scale, height, radius) + roundedRect(inset, 10 * scale, width - inset * 2, height - 20 * scale, 36 * scale), windingRule: 'evenodd', fill: '#292c32', stroke: '#858c98', strokeWidth: 1.25 * scale },
    { role: 'device-mute', tag: 'Rect', x: 0, y: 98 * scale, width: 4 * scale, height: 24 * scale, cornerRadius: 2 * scale, fill: '#555b65' },
    { role: 'device-volume-up', tag: 'Rect', x: 0, y: 154 * scale, width: 4 * scale, height: 48 * scale, cornerRadius: 2 * scale, fill: '#555b65' },
    { role: 'device-volume-down', tag: 'Rect', x: 0, y: 218 * scale, width: 4 * scale, height: 48 * scale, cornerRadius: 2 * scale, fill: '#555b65' },
    { role: 'device-power', tag: 'Rect', x: width - 4 * scale, y: 170 * scale, width: 4 * scale, height: 76 * scale, cornerRadius: 2 * scale, fill: '#555b65' },
    { role: 'device-earpiece', tag: 'Rect', x: width / 2 - 48 * scale, y: 22 * scale, width: 96 * scale, height: 27 * scale, cornerRadius: 13.5 * scale, fill: '#1d2026' },
    { role: 'device-speaker', tag: 'Rect', x: width / 2 - 30 * scale, y: 33.5 * scale, width: 42 * scale, height: 4 * scale, cornerRadius: 2 * scale, fill: '#464d59' },
    { role: 'device-camera', tag: 'Ellipse', x: width / 2 + 23 * scale, y: 31.5 * scale, width: 8 * scale, height: 8 * scale, fill: '#354154' },
    { role: 'device-camera-glint', tag: 'Ellipse', x: width / 2 + 25 * scale, y: 33 * scale, width: 2 * scale, height: 2 * scale, fill: '#75899d' },
    { role: 'device-bar', tag: 'Rect', x: width / 2 - 55 * scale, y: height - 26 * scale, width: 110 * scale, height: 5 * scale, cornerRadius: 2.5 * scale, fill: '#292c32' },
  ]
  return { scale, radius, parts }
}

export function syncPhoneFrame(frame: Frame) {
  if (!frame.id) frame.id = createElementId()
  const { scale, radius, parts } = phoneFrameGeometry(Number(frame.width), Number(frame.height))
  const upgrading = !frame.children.some(item => item.data?.containerPart === 'device-bezel')
  if (upgrading) frame.set({ stroke: undefined, strokeWidth: 0 })
  frame.cornerRadius = radius
  parts.forEach(({ role, tag, ...geometry }, index) => {
    const item = frame.children.find(child => child.data?.containerPart === role)
    const attributes = { ...geometry, zIndex: 1000 + index, editable: false, hittable: false, hitSelf: false }
    if (item) item.set(attributes)
    else frame.add({ ...attributes, tag, id: `${frame.id}:phone:${role}`, name: `container-${role}`, data: { kind: 'container-decoration', containerPart: role } })
  })
  frame.children.find(item => item.name === 'frame-title')?.set({ x: 26 * scale, y: 62 * scale, width: Math.max(20, Number(frame.width) - 52 * scale), height: 24 * scale })
}
