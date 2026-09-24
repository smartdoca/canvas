import { test as base, expect } from '@playwright/test'
export { expect }
export const test = base.extend({
  context: async ({ context }, use) => {
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
