import { test as base, expect } from '@playwright/test'
export { expect }
export const test = base.extend({
  context: async ({ context }, use) => {
    // Every host integration scenario must exercise the current source, even
    // when an older library bundle is still present in the workspace.
    await context.route('**/examples/doca/main.jsx', async route => {
      const response = await route.fetch()
      await route.fulfill({ response, body: (await response.text()).replaceAll('/dist/index.js', '/src/index.ts').replaceAll('/dist/model.js', '/src/model/index.ts').replaceAll('/dist/io.js', '/src/io/index.ts').replaceAll('/dist/index.css', '/src/index.css') })
    })
    const errors = []
    context.on('page', page => {
      page.on('pageerror', error => errors.push(error.message))
      page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} (${message.location().url})`) })
    })
    await use(context)
    for (const page of context.pages()) await page.close()
    expect(errors, 'Unexpected browser/Leafer errors, including page close').toEqual([])
  },
})
