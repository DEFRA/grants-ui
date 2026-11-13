import { expect, test, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { loadSharedRedirectRules } from './form.js'

// Own file: the shared rules are memoised per module instance, and the first call has to be the failing one.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, readFile: vi.fn(actual.readFile) }
})

test('loadSharedRedirectRules does not keep a failed read, so the next call reads the file again', async () => {
  readFile.mockRejectedValueOnce(new Error('disk'))

  await expect(loadSharedRedirectRules()).rejects.toThrow('disk')
  await expect(loadSharedRedirectRules()).resolves.toMatchObject({ preSubmission: [{ toPath: '/summary' }] })
  expect(readFile).toHaveBeenCalledTimes(2)
})
