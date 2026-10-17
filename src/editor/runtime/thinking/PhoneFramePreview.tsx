import { phoneFrameGeometry } from './phoneFrame'

export function PhoneFramePreview({ width, height }: { width: number; height: number }) {
  const { radius, parts } = phoneFrameGeometry(width, height)
  return <g data-phone-preview="true" stroke="none"><rect width={width} height={height} rx={radius} fill="#ffffff" />{parts.map(part => {
    const common = { fill: part.fill, stroke: typeof part.stroke === 'string' ? part.stroke : 'none', strokeWidth: typeof part.strokeWidth === 'number' ? part.strokeWidth : 0 }
    if (part.tag === 'Path') return <path key={part.role} d={String(part.path)} fillRule="evenodd" {...common} />
    const x = Number(part.x || 0), y = Number(part.y || 0), w = Number(part.width), h = Number(part.height)
    return part.tag === 'Ellipse' ? <ellipse key={part.role} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...common} /> : <rect key={part.role} x={x} y={y} width={w} height={h} rx={Number(part.cornerRadius || 0)} {...common} />
  })}</g>
}
