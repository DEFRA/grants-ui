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

describe('runner-engine fields', () => {
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

  /**
   * Renders the form, runs a single `fields` step against it and records each submit.
   * @param {string} formHtml
   * @param {object[]} fields
   * @returns {Promise<FormData[]>}
   */
  const runFieldsStep = async (formHtml, fields) => {
    document.body.innerHTML = `<form method="post">${formHtml}<button class="govuk-button">Continue</button></form>`
    const form = document.querySelector('form')
    /** @type {FormData[]} */
    const submits = []
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      submits.push(new FormData(form))
    })
    await loadRunner('/example-grant/application-declaration', undefined, [
      { slug: 'application-declaration', name: 'Complete declaration', type: 'fields', fields }
    ])
    globalThis.runJourney()
    return submits
  }

  test('fills a text input and ticks a checkbox, then submits once', async () => {
    const submits = await runFieldsStep(
      `<input name="fullName" type="text">
       <input name="declaration" type="checkbox" value="true">`,
      [
        { type: 'text', fieldName: 'fullName', value: 'Test Applicant' },
        { type: 'checkbox', fieldName: 'declaration', checked: true }
      ]
    )

    expect(errorSpy).not.toHaveBeenCalled()
    expect(submits).toHaveLength(1)
    expect(submits[0].get('fullName')).toBe('Test Applicant')
    expect(submits[0].get('declaration')).toBe('true')
  })

  test('unticks a checkbox when checked is false', async () => {
    const submits = await runFieldsStep(`<input name="marketing" type="checkbox" value="true" checked>`, [
      { type: 'checkbox', fieldName: 'marketing', checked: false }
    ])

    expect(errorSpy).not.toHaveBeenCalled()
    expect(submits).toHaveLength(1)
    expect(submits[0].has('marketing')).toBe(false)
  })

  test('reuses the single-field fillers for radios and selects', async () => {
    const submits = await runFieldsStep(
      `<input name="choice" type="radio" value="a">
       <input name="choice" type="radio" value="b">
       <select name="county"><option value="">Select</option><option value="kent">Kent</option></select>`,
      [
        { type: 'radios', fieldName: 'choice', value: 'b' },
        { type: 'selectField', fieldName: 'county' }
      ]
    )

    expect(errorSpy).not.toHaveBeenCalled()
    expect(submits).toHaveLength(1)
    expect(submits[0].get('choice')).toBe('b')
    expect(submits[0].get('county')).toBe('kent')
  })

  test.each([
    [{ type: 'mystery', fieldName: 'fullName' }, 'Unknown field type "mystery" for fullName'],
    [{ type: 'text', fieldName: 'missing', value: 'x' }, 'missing input not found']
  ])('fails without submitting when an entry cannot be filled (%o)', async (entry, message) => {
    const submits = await runFieldsStep(`<input name="fullName" type="text">`, [
      { type: 'text', fieldName: 'fullName', value: 'Test Applicant' },
      entry
    ])

    expect(submits).toHaveLength(0)
    expect(errorSpy).toHaveBeenCalledWith('[journey-runner] Failed on "Complete declaration":', message)
  })

  test('fails without submitting when the fields array is empty', async () => {
    const submits = await runFieldsStep(`<input name="fullName" type="text">`, [])

    expect(submits).toHaveLength(0)
    expect(errorSpy).toHaveBeenCalledWith(
      '[journey-runner] Failed on "Complete declaration":',
      'fields step needs a non-empty "fields" array'
    )
  })
})
