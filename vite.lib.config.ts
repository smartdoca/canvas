import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    lib: { entry: { index: 'src/index.ts', model: 'src/model/index.ts', io: 'src/io/index.ts' }, formats: ['es'], fileName: (_format, entry) => `${entry}.js`, cssFileName: 'index' },
    cssCodeSplit: false,
    rollupOptions: {
      external: (id) => /^(react|react-dom|leafer-ui|roughjs|cropperjs|yjs|@leafer-in\/)/.test(id),
    },
  },
})
