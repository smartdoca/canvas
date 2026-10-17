import { Group, Text } from 'leafer-ui'
import { createElementId } from '../../../model'
import { branchFills, connectionPorts, makeConnector, makeDiagram, makeMindMap, makeNode, layoutMindMap, setConnectorPath, type MindLayout, type RouteMode } from './scene'

export const templateIds = ['timeline', 'org', 'architecture', 'mindmap', 'flywheel', 'pyramid', 'wireframe', 'retro'] as const
export type TemplateId = typeof templateIds[number]
export const templateCategories: Record<TemplateId, string> = { timeline: 'plan', org: 'mind', architecture: 'flow', mindmap: 'mind', flywheel: 'flow', pyramid: 'plan', wireframe: 'design', retro: 'team' }

export function createTemplate(type: TemplateId, x: number, y: number, text: (key: string) => string) {
  if (type === 'mindmap' || type === 'org') {
    const group = makeMindMap(x, y, text(type === 'org' ? 'template.orgRoot' : 'mind.root'), text('mind.branch'), type === 'org' ? 'down' : 'balanced')
    const root = group.children.find(node => node.data?.root)!
    const branches = group.children.filter(node => node.data?.parentId === root.id)
    branches.forEach((branch, index) => {
      const label = branch.children?.find(child => child.tag === 'Text') as Text
      label.text = text(type === 'org' ? `template.team${index + 1}` : `template.topic${index + 1}`)
      for (let j = 0; j < 2; j++) group.add(makeNode(text(type === 'org' ? 'template.member' : 'mind.subtopic'), 0, 0, { parentId: branch.id, colorIndex: index }))
    })
    layoutMindMap(group)
    return group
  }
  const group = new Group({ id: createElementId(), name: 'thinking-template', x, y, editable: true, data: { kind: 'template', template: type } })
  const node = (title: string, px: number, py: number, width = 160, height = 64, fill = '#eaf1ff', shape: Parameters<typeof makeDiagram>[0] = 'rounded') => { const item = makeDiagram(shape, px, py, title, width, height, fill, '#a8bde8'); group.add(item); return item }
  const label = (value: string, px: number, py: number, fontSize = 16) => group.add(new Text({ id: createElementId(), name: 'text', text: value, x: px, y: py, fill: '#1f2329', fontSize, fontFamily: 'Arial, "PingFang SC", sans-serif', editable: true }))
  const connect = (from: ReturnType<typeof node>, to: ReturnType<typeof node>, mode: RouteMode = 'elbow', sourceAnchor = connectionPorts[1], targetAnchor = connectionPorts[3]) => {
    const start = { x: Number(from.x) + Number(from.width) * sourceAnchor.x, y: Number(from.y) + Number(from.height) * sourceAnchor.y }, end = { x: Number(to.x) + Number(to.width) * targetAnchor.x, y: Number(to.y) + Number(to.height) * targetAnchor.y }
    // Template-local connectors move as part of their containing group.
    const edge = makeConnector(start, end, mode, from.id, to.id)
    edge.data = { ...edge.data, kind: 'template-edge', sourceAnchor, targetAnchor }
    setConnectorPath(edge, start, end)
    group.addAt(edge, 0)
  }
  if (type === 'architecture') {
    const user = node(text('template.user'), -320, 0, 140, 64)
    const app = node(text('template.application'), -100, 0, 180, 64, '#e5f6ee')
    const services = [node(text('template.service1'), 180, -100), node(text('template.service2'), 180, 0), node(text('template.service3'), 180, 100)]
    connect(user, app); services.forEach(service => connect(app, service))
    node(text('template.database'), 440, 0, 140, 64, '#fff4d9', 'cylinder')
    services.forEach(service => connect(service, group.children.find(item => item.name === 'diagram-node' && item.x === 440) as ReturnType<typeof node>))
  } else if (type === 'timeline') {
    for (let i = 0; i < 4; i++) {
      const step = node(text(`template.stage${i + 1}`), i * 200 - 360, i % 2 ? 50 : -70, 160, 60, branchFills[i])
      label(`0${i + 1}`, i * 200 - 295, -140, 28)
      if (i) connect(group.children.filter(child => child.name === 'diagram-node').at(-2) as typeof step, step)
    }
  } else if (type === 'retro') {
    for (let i = 0; i < 3; i++) {
      node(text(`template.retro${i + 1}`), i * 240 - 320, -140, 210, 54, branchFills[i])
      for (let j = 0; j < 2; j++) node(text('template.writeIdea'), i * 240 - 305, j * 100 - 50, 180, 80, ['#fff4c4', '#e5f6ee', '#eaf1ff'][i])
    }
  } else if (type === 'pyramid') {
    node(text('template.vision'), -90, -160, 180, 80, '#dce8ff', 'triangle')
    node(text('template.strategy'), -160, -50, 320, 64, '#e5f6ee')
    node(text('template.execution'), -230, 40, 460, 64, '#fff4d9')
  } else if (type === 'flywheel') {
    const items = [node(text('template.discover'), -80, -180, 160, 60), node(text('template.create'), 180, -20, 160, 60, '#e5f6ee'), node(text('template.deliver'), -80, 140, 160, 60, '#fff4d9'), node(text('template.improve'), -340, -20, 160, 60, '#f2eafb')]
    items.forEach((item, i) => connect(item, items[(i + 1) % items.length], 'curve', connectionPorts[(i + 1) % 4], connectionPorts[i]))
    label(text('template.growth'), -45, -2, 20)
  } else if (type === 'wireframe') {
    node('', -170, -260, 340, 550, '#ffffff')
    label('9:41', -142, -240, 12)
    node(text('template.pageTitle'), -145, -190, 290, 45, '#f2f3f5')
    node('', -145, -125, 290, 155, '#eaf1ff')
    for (let i = 0; i < 3; i++) node(text('template.content'), -145, 50 + i * 56, 290, 40, '#f5f6f7')
    node(text('template.action'), -145, 235, 290, 38, '#dce8ff')
  }
  return group
}

export const layoutKeys: MindLayout[] = ['right', 'left', 'balanced', 'down']
