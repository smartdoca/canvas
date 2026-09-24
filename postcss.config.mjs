// Scope both package CSS and bundled icon styles. Re-processing built CSS is idempotent.
export default { plugins: [{
  postcssPlugin: 'aidcanvas-namespace',
  Once(root) {
    const file = root.source?.input.file?.replaceAll('\\', '/') || ''
    if (!file.endsWith('/src/index.css') && !file.includes('/@icon-park/react/styles/')) return
    const names = new Map()
    root.walkAtRules(/keyframes$/, rule => {
      if (!rule.params.startsWith('aidcanvas-')) { names.set(rule.params, `aidcanvas-${rule.params}`); rule.params = names.get(rule.params) }
    })
    root.walkDecls(/animation/, declaration => { for (const [before, after] of names) declaration.value = declaration.value.replaceAll(before, after) })
    root.walkRules(rule => {
      if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return
      rule.selectors = rule.selectors.map(selector => selector.includes('[data-aidcanvas]') ? selector : selector.startsWith('.canvas-app') ? selector.replace('.canvas-app', '[data-aidcanvas].canvas-app') : `[data-aidcanvas] ${selector}`)
    })
  },
}] }
