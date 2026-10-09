import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanupDOM, setupDOM, setupLoadingDocument } from './test-helpers.js'

const snapshotGlobals = () =>
  ['document', 'window', 'location'].map((name) => Object.getOwnPropertyDescriptor(globalThis, name))

afterEach(cleanupDOM)

describe('cookie DOM test helpers', () => {
  it('closes every window and restores the original global descriptors after nested setups', () => {
    const originalGlobals = snapshotGlobals()
    const first = setupDOM('<p>First page</p>')
    const firstClose = vi.spyOn(first.dom.window, 'close')
    const second = setupDOM('<p>Second page</p>', 'http://localhost/cookies')
    const secondClose = vi.spyOn(second.dom.window, 'close')

    expect(globalThis.document).toBe(second.document)
    expect(globalThis.location.href).toBe('http://localhost/cookies')

    cleanupDOM()

    expect(firstClose).toHaveBeenCalledOnce()
    expect(secondClose).toHaveBeenCalledOnce()
    expect(snapshotGlobals()).toEqual(originalGlobals)
  })

  it('restores globals even when importing the page module fails', async () => {
    const originalGlobals = snapshotGlobals()
    const error = new Error('Module failed to load')

    await expect(
      setupLoadingDocument('<p>Loading page</p>', async () => {
        throw error
      })
    ).rejects.toBe(error)

    expect(snapshotGlobals()).toEqual(originalGlobals)
  })
})
