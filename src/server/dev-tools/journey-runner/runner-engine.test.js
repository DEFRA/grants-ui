// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const CLICK_LINK_STEP = {
  slug: 'task-list',
  name: 'Task list — your-legal-status',
  type: 'clickLink',
  linkSlug: 'confirm-legal-status'
}

/**
 * Loads a fresh copy of the browser runner on the given page, with one link.
 * @param {string} pageUrl
 * @param {string} [href]
 * @param {object[]} [steps]
 * @returns {Promise<import('vitest').Mock>} click spy for the link
 */
const loadRunner = async (pageUrl, href, steps = [CLICK_LINK_STEP]) => {
  globalThis.history.pushState({}, '', pageUrl)
  const onClick = vi.fn((event) => event.preventDefault())
  if (href) {
    const link = document.createElement('a')
    link.href = href
    link.addEventListener('click', onClick)
    document.body.appendChild(link)
  }
  globalThis.__journeySteps = steps
  vi.resetModules()
  await import('./runner-engine.js')
  return onClick
}

describe('runner-engine clickLink', () => {
  /** @type {import('vitest').MockInstance} */
  let errorSpy

  beforeEach(() => {
    vi.spyOn(globalThis.console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(globalThis.console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    delete globalThis.__journeyRunner
    delete globalThis.__journeySteps
    sessionStorage.clear()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  test('clicks the link carrying the current ref on a multiple-application grant', async () => {
    const onClick = await loadRunner(
      '/water-management/task-list?ref=ABC-123',
      '/water-management/confirm-legal-status?ref=ABC-123'
    )

    globalThis.runJourney()

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  test('clicks the plain link when the page has no ref', async () => {
    const onClick = await loadRunner('/water-management/task-list', '/water-management/confirm-legal-status')

    globalThis.runJourney()

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  test('reports the missing link without the ref', async () => {
    await loadRunner('/water-management/task-list?ref=ABC-123', '/water-management/other-page?ref=ABC-123')

    globalThis.runJourney()

    expect(errorSpy).toHaveBeenCalledWith(
      '[journey-runner] Failed on "Task list — your-legal-status":',
      'Link to /confirm-legal-status not found'
    )
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('ref=')
  })

  test('textFields ticks a declaration checkbox alongside the text inputs', async () => {
    document.body.innerHTML = `
      <form method="post">
        <input name="projectLocated__easting" type="text">
        <input name="confirmCorrectLocationSelected" type="checkbox" value="true">
        <input name="confirmCorrectLocationSelected" type="hidden" value="unchecked">
        <button class="govuk-button">Continue</button>
      </form>`
    const form = document.querySelector('form')
    /** @type {FormData | undefined} */
    let submitted
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      submitted = new FormData(form)
    })
    await loadRunner('/water-management/eligibility-project-location', undefined, [
      {
        slug: 'eligibility-project-location',
        name: 'Where is project located',
        type: 'textFields',
        fields: { projectLocated__easting: '530000', confirmCorrectLocationSelected: 'true' }
      }
    ])

    globalThis.runJourney()

    expect(errorSpy).not.toHaveBeenCalled()
    expect(submitted.get('projectLocated__easting')).toBe('530000')
    expect(submitted.getAll('confirmCorrectLocationSelected')).toEqual(['true', 'unchecked'])
  })

  test.each([false, true])('checkboxes keeps a declaration ticked when it is already checked (%s)', async (checked) => {
    document.body.innerHTML = `
      <form method="post">
        <input name="confirmConsultedWithTenants" type="checkbox" value="true"${checked ? ' checked' : ''}>
        <input name="confirmConsultedWithTenants" type="hidden" value="unchecked">
        <button class="govuk-button">Continue</button>
      </form>`
    const form = document.querySelector('form')
    /** @type {FormData | undefined} */
    let submitted
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      submitted = new FormData(form)
    })
    await loadRunner('/water-management/eligibility-landowner-landlord-requirements', undefined, [
      {
        slug: 'eligibility-landowner-landlord-requirements',
        name: 'What you need to do',
        type: 'checkboxes',
        fieldName: 'confirmConsultedWithTenants'
      }
    ])

    globalThis.runJourney()

    expect(errorSpy).not.toHaveBeenCalled()
    expect(submitted.getAll('confirmConsultedWithTenants')).toEqual(['true', 'unchecked'])
  })
})
