// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createAnnouncer } from './announcer.js'

describe('createAnnouncer', () => {
  it('adds a visually hidden polite status region to the wrapper', () => {
    const wrapper = document.createElement('div')

    const { element } = createAnnouncer(wrapper)

    expect(element.parentElement).toBe(wrapper)
    expect(element.className).toBe('govuk-visually-hidden')
    expect(element.getAttribute('role')).toBe('status')
    expect(element.getAttribute('aria-live')).toBe('polite')
  })

  it('takes a class for a visible message, and announces and clears text', () => {
    const announcer = createAnnouncer(document.createElement('div'), { className: 'parcel-map__status' })

    expect(announcer.element.className).toBe('parcel-map__status')

    announcer.announce('Hello')
    expect(announcer.element.textContent).toBe('Hello')

    announcer.clear()
    expect(announcer.element.textContent).toBe('')
  })
})
