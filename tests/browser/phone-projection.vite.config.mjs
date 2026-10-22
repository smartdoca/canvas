// Dedicated QA server: release consumers under ignored tmp/ are not entrypoints.
import { mergeConfig } from 'vite'
import base from '../../vite.config.ts'

export default mergeConfig(base, {
  plugins: [{
    name: 'qa-phone-engine-readback',
    resolveId(id) { if (id === '/__qa/canvas-engine.js') return '\0qa-phone-engine' },
    load(id) { if (id === '\0qa-phone-engine') return 'export * from "leafer-ui"' },
    configureServer(server) {
      // Existing engine readback tests use Vite's default dependency URL.
      // Read this isolated server's runtime rather than a shared stale cache.
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== '/node_modules/.vite/deps/leafer-ui.js') return next()
        response.setHeader('Content-Type', 'text/javascript')
        response.end('export * from "/__qa/canvas-engine.js"')
      })
    },
  }],
  cacheDir: 'tmp/qa-phone-model-vite',
  optimizeDeps: { entries: ['index.html', 'examples/doca/index.html'], force: true },
  resolve: { dedupe: ['react', 'react-dom'] },
})
