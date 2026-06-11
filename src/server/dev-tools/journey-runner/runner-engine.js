// @ts-nocheck
/* eslint-disable no-console */
/* global sessionStorage */

/**
 * Browser-side journey runner.
 *
 * Loaded by `journey-runner-plugin.js`, which prepends
 * `globalThis.__journeySteps = [...]` (read from a journey JSON file) before
 * this script. On each page load we look at the current URL, find the matching
 * step, fill its fields and submit - then the next page loads and we repeat
 * until we reach the configured stop point or run out of steps.
 *
 * Public API exposed on `globalThis`:
 *   - `runJourney(stopAtPageOrSection?)` - start a run.
 *   - `stopJourney()` - cancel an in-flight run.
 */
;(function () {
  if (globalThis.__journeyRunner) {
    return
  }
  globalThis.__journeyRunner = true

  const steps = globalThis.__journeySteps
  if (!steps?.length) {
    console.warn('[journey-runner] No journey steps found')
    return
  }

  const STORAGE_KEY = '__journeyRunner'
  const LAST_SUBMIT_KEY = '__journeyRunnerLastSubmit'
  const LOG_PREFIX = '[journey-runner]'
  const UUID_PATTERN = /^[0-9a-f-]{36}$/i
  const SNAPSHOT_VALUE_MAX_LENGTH = 80

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------

  /**
   * Set an input/select/textarea value via the prototype setter so frameworks
   * that wrap `value` (React-style) still observe the change, then dispatch
   * `input` and `change` events.
   * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} el
   * @param {string} value
   * @returns {void}
   */
  function setInputValue(el, value) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')
    if (setter?.set) {
      setter.set.call(el, value)
    } else {
      el.value = value
    }
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  /**
   * @param {string} name
   * @returns {string}
   */
  function inputSelector(name) {
    return `input[name="${name}"]`
  }

  // ---------------------------------------------------------------------------
  // Form submission
  // ---------------------------------------------------------------------------

  /**
   * Persist a redacted summary of what the form is about to submit so we can
   * include it in error reports if the next page navigation fails.
   * @param {HTMLFormElement} form
   * @returns {void}
   */
  function snapshotFormPayload(form) {
    try {
      const data = new FormData(form)
      const entries = []
      for (const [name, value] of data.entries()) {
        if (name === 'crumb') {
          continue
        }
        const str = typeof value === 'string' ? value : '[file]'
        entries.push(
          `${name}=${str.length > SNAPSHOT_VALUE_MAX_LENGTH ? str.slice(0, SNAPSHOT_VALUE_MAX_LENGTH) + '…' : str}`
        )
      }
      sessionStorage.setItem(LAST_SUBMIT_KEY, JSON.stringify({ path: globalThis.location.pathname, entries }))
    } catch (err) {
      console.warn(`${LOG_PREFIX} Could not snapshot form payload:`, err.message)
    }
  }

  /**
   * Find the page form and click its primary submit button.
   * @returns {void}
   */
  function submitForm() {
    const form = document.querySelector('form[method="post"], form.form')
    if (!form) {
      throw new Error('No form found on page')
    }
    const button = form.querySelector('button.govuk-button:not(.govuk-button--secondary)')
    if (!button) {
      throw new Error('No submit button found')
    }
    snapshotFormPayload(form)
    button.click()
  }

  // ---------------------------------------------------------------------------
  // Step handlers - one per `step.type`
  // ---------------------------------------------------------------------------

  /** @type {Record<string, (step: JourneyStep) => void>} */
  const stepHandlers = {
    submitOnly() {
      submitForm()
    },

    yesNo(step) {
      const input = document.querySelector(`input[name="${step.fieldName}"][value="${step.value || 'true'}"]`)
      if (!input) {
        throw new Error(`${step.fieldName} radio not found`)
      }
      input.click()
      submitForm()
    },

    radios(step) {
      const radio = document.querySelector(inputSelector(step.fieldName))
      if (!radio) {
        throw new Error(`${step.fieldName} radio not found`)
      }
      radio.click()
      submitForm()
    },

    checkboxes(step) {
      const all = document.querySelectorAll(inputSelector(step.fieldName))
      if (!all.length) {
        throw new Error(`${step.fieldName} checkbox not found`)
      }
      const toClick = step.selectAll ? Array.from(all) : [all[0]]
      toClick.forEach((cb) => cb.click())
      submitForm()
    },

    numberField(step) {
      const input = document.querySelector(inputSelector(step.fieldName))
      if (!input) {
        throw new Error(`${step.fieldName} input not found`)
      }
      setInputValue(input, step.value)
      submitForm()
    },

    selectField(step) {
      const select = document.querySelector(`select[name="${step.fieldName}"]`)
      if (!select) {
        throw new Error(`${step.fieldName} select not found`)
      }
      const option = select.querySelector('option[value]:not([value=""])')
      if (!option) {
        throw new Error(`${step.fieldName} has no options`)
      }
      select.value = option.value
      select.dispatchEvent(new Event('change', { bubbles: true }))
      submitForm()
    },

    multilineText(step) {
      const textarea = document.querySelector(`textarea[name="${step.fieldName}"]`)
      if (!textarea) {
        throw new Error(`${step.fieldName} textarea not found`)
      }
      setInputValue(textarea, step.value)
      submitForm()
    },

    dateParts(step) {
      const date = new Date()
      if (step.offsetDays) {
        date.setDate(date.getDate() + step.offsetDays)
      }
      const day = document.querySelector(inputSelector(`${step.fieldName}__day`))
      const month = document.querySelector(inputSelector(`${step.fieldName}__month`))
      const year = document.querySelector(inputSelector(`${step.fieldName}__year`))
      if (!day || !month || !year) {
        throw new Error(`${step.fieldName} date inputs not found`)
      }
      setInputValue(day, String(date.getDate()))
      setInputValue(month, String(date.getMonth() + 1))
      setInputValue(year, String(date.getFullYear()))
      submitForm()
    },

    monthYear(step) {
      const date = new Date()
      const month = document.querySelector(inputSelector(`${step.fieldName}__month`))
      const year = document.querySelector(inputSelector(`${step.fieldName}__year`))
      if (!month || !year) {
        throw new Error(`${step.fieldName} month/year inputs not found`)
      }
      setInputValue(month, String(date.getMonth() + 1))
      setInputValue(year, String(date.getFullYear()))
      submitForm()
    },

    clickLink(step) {
      const link = document.querySelector(`a[href$="/${step.linkSlug}"]`)
      if (!link) {
        throw new Error(`Link to /${step.linkSlug} not found`)
      }
      link.click()
    },

    textFields(step) {
      Object.keys(step.fields).forEach((name) => {
        const input = document.querySelector(`input[name="${name}"], textarea[name="${name}"]`)
        if (input) {
          setInputValue(input, step.fields[name])
        }
      })
      submitForm()
    }
  }

  // ---------------------------------------------------------------------------
  // Step lookup - match the current URL to a configured step
  // ---------------------------------------------------------------------------

  /**
   * Strip the leading form-slug segment so we can compare against page slugs
   * directly. e.g. `/example-grant-with-auth/select-land-parcel` → `/select-land-parcel`.
   * @param {string} path
   * @returns {string}
   */
  function getPagePath(path) {
    const segments = path.split('/').filter(Boolean)
    return '/' + segments.slice(1).join('/')
  }

  /**
   * @param {JourneyStep} step
   * @param {string} path
   * @returns {boolean}
   */
  function stepMatchesPath(step, path) {
    const pagePath = getPagePath(path)

    if (step.matchMode === 'prefix') {
      // Match `/{slug}/{itemId}` where itemId is a UUID (RepeatPageController
      // item-entry pages). Excludes `/{slug}/summary`-style sub-routes so they
      // fall through to a more specific step.
      const expectedPrefix = `/${step.slug}/`
      if (!pagePath.startsWith(expectedPrefix)) {
        return false
      }
      return UUID_PATTERN.test(pagePath.slice(expectedPrefix.length))
    }

    return pagePath === `/${step.slug}`
  }

  /**
   * Find the next un-completed step matching the current URL.
   * @param {number} afterIndex
   * @param {string | undefined} section
   * @returns {number} step index, or -1 if no match
   */
  function findCurrentStep(afterIndex, section) {
    const path = globalThis.location.pathname
    for (let i = afterIndex + 1; i < steps.length; i++) {
      const step = steps[i]
      if (section && step.section !== section) {
        continue
      }
      if (stepMatchesPath(step, path)) {
        return i
      }
    }
    return -1
  }

  /**
   * Decide whether the runner genuinely stalled on the step it last attempted.
   *
   * "Stuck" means the form we just submitted re-rendered on its own page
   * instead of navigating forward - so the current URL must still match the
   * last-attempted step. If the URL instead matches an *earlier*, already
   * completed step (e.g. we finished a section and looped back to the
   * task-list hub, whose `/{slug}/tasks` URL also matches an earlier
   * `clickLink` step), the journey progressed and then completed - that is not
   * stuck.
   * @param {number} upToIndex index of the last-attempted step
   * @param {string | undefined} section
   * @returns {number} the stuck step index, or -1 if not stuck
   */
  function findStuckStep(upToIndex, section) {
    if (upToIndex < 0 || upToIndex >= steps.length) {
      return -1
    }
    const step = steps[upToIndex]
    if (section && step.section !== section) {
      return -1
    }
    return stepMatchesPath(step, globalThis.location.pathname) ? upToIndex : -1
  }

  // ---------------------------------------------------------------------------
  // Diagnostics - explain why the runner stopped
  // ---------------------------------------------------------------------------

  /**
   * Build a human-readable report describing why the runner is stuck on the
   * current page. Includes any error summary, the page heading, and the last
   * submitted payload (if available). Consumes (deletes) the last-submit
   * snapshot as a side effect.
   * @param {JourneyStep} stuckStep
   * @param {number} stuckIdx
   * @returns {string}
   */
  function buildStuckErrorReport(stuckStep, stuckIdx) {
    /** @type {string[]} */
    const detailParts = []

    const errorSummary = document.querySelector('.govuk-error-summary')
    if (errorSummary) {
      detailParts.push(errorSummary.textContent.trim())
    }

    const heading = document.querySelector('h1')?.textContent?.trim()
    if (heading) {
      detailParts.push(`Page heading: "${heading}"`)
    }

    const lastSubmitRaw = sessionStorage.getItem(LAST_SUBMIT_KEY)
    if (lastSubmitRaw) {
      try {
        /** @type {LastSubmitSnapshot} */
        const lastSubmit = JSON.parse(lastSubmitRaw)
        const submittedSummary = lastSubmit.entries?.length ? lastSubmit.entries.join(', ') : '(no fields submitted)'
        detailParts.push(`Last submitted payload from ${lastSubmit.path}: ${submittedSummary}`)
      } catch (err) {
        detailParts.push(`Could not parse last-submit snapshot: ${err.message}`)
      }
    } else {
      detailParts.push('No last-submit snapshot (form may not have been submitted by the runner)')
    }

    sessionStorage.removeItem(LAST_SUBMIT_KEY)
    const errorDetail = detailParts.length ? `\n${detailParts.join('\n')}` : ''
    return `Stuck on "${stuckStep.name}" (step ${stuckIdx + 1}) at ${globalThis.location.pathname} - submit did not navigate forward.${errorDetail}`
  }

  // ---------------------------------------------------------------------------
  // Main orchestration
  // ---------------------------------------------------------------------------

  /**
   * @param {JourneyState} state
   * @returns {void}
   */
  function reportNoMatchingStep(state) {
    sessionStorage.removeItem(STORAGE_KEY)
    const stuckIdx = findStuckStep(state.lastCompleted ?? -1, state.section)
    if (stuckIdx !== -1) {
      console.error(`${LOG_PREFIX} ${buildStuckErrorReport(steps[stuckIdx], stuckIdx)}`)
      return
    }
    console.log(`${LOG_PREFIX} Reached ${globalThis.location.pathname} - not a known step, journey complete`)
  }

  /**
   * Read journey state from sessionStorage and run whichever step matches the
   * current URL. Called on every page load while a journey is active.
   * @returns {void}
   */
  function processCurrentPage() {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return
    }

    /** @type {JourneyState} */
    const state = JSON.parse(raw)
    const idx = findCurrentStep(state.lastCompleted ?? -1, state.section)

    if (idx === -1) {
      reportNoMatchingStep(state)
      return
    }

    const step = steps[idx]
    const stepNumber = idx + 1

    if (state.section && step.section !== state.section) {
      sessionStorage.removeItem(STORAGE_KEY)
      console.log(`${LOG_PREFIX} Section "${state.section}" complete - stopping at ${globalThis.location.pathname}`)
      return
    }

    if (stepNumber >= state.stopAt) {
      sessionStorage.removeItem(STORAGE_KEY)
      console.log(`${LOG_PREFIX} Arrived at "${step.name}" (step ${stepNumber}) - stopping here`)
      return
    }

    const errorSummary = document.querySelector('.govuk-error-summary')
    if (errorSummary) {
      sessionStorage.removeItem(STORAGE_KEY)
      console.error(`${LOG_PREFIX} Page has errors, stopping:\n${errorSummary.textContent.trim()}`)
      return
    }

    const handler = stepHandlers[step.type]
    if (!handler) {
      sessionStorage.removeItem(STORAGE_KEY)
      console.error(`${LOG_PREFIX} Unknown step type: ${step.type}`)
      return
    }

    console.log(`${LOG_PREFIX} Step ${stepNumber}: ${step.name}`)

    try {
      // Mark step as started before running the handler so the next page load
      // resumes from the following step rather than re-running this one.
      state.lastCompleted = idx
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      handler(step)
    } catch (err) {
      sessionStorage.removeItem(STORAGE_KEY)
      console.error(`${LOG_PREFIX} Failed on "${step.name}":`, err.message)
    }
  }

  // ---------------------------------------------------------------------------
  // Public API - exposed on globalThis for browser console use
  // ---------------------------------------------------------------------------

  /**
   * Start a journey run.
   * @param {number | string} [stopAtPageOrSection]
   *   - **Number**: stop when arriving at that step (1-indexed).
   *   - **String**: only run steps whose `section` tag matches.
   *   - **Omitted**: run to the end.
   * @returns {void}
   */
  globalThis.runJourney = function (stopAtPageOrSection) {
    /** @type {JourneyState} */
    let state
    if (typeof stopAtPageOrSection === 'string') {
      const hasSection = steps.some((s) => s.section === stopAtPageOrSection)
      if (!hasSection) {
        console.error(`${LOG_PREFIX} No steps found for section "${stopAtPageOrSection}"`)
        return
      }
      state = { stopAt: steps.length + 1, section: stopAtPageOrSection }
      console.log(`${LOG_PREFIX} Starting journey for section "${stopAtPageOrSection}"`)
    } else {
      state = { stopAt: stopAtPageOrSection || steps.length + 1 }
      console.log(`${LOG_PREFIX} Starting journey, will stop at step ${state.stopAt}`)
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    processCurrentPage()
  }

  /**
   * Cancel an in-flight journey.
   * @returns {void}
   */
  globalThis.stopJourney = function () {
    sessionStorage.removeItem(STORAGE_KEY)
    console.log(`${LOG_PREFIX} Journey stopped`)
  }

  processCurrentPage()
})()

/**
 * @typedef {object} JourneyStep
 * @property {string} name                 Human-readable step name (used in logs).
 * @property {string} type                 Step type - must match a key in `stepHandlers`.
 * @property {string} slug                 URL slug to match against the current page path.
 * @property {string} [section]            Optional section tag for partial runs.
 * @property {string} [fieldName]          Form field name (for steps that touch a single field).
 * @property {string} [value]              Value to set (for input/text/yesNo steps).
 * @property {boolean} [selectAll]         Tick every checkbox instead of just the first.
 * @property {number} [offsetDays]         Days to add to "today" for date-parts steps.
 * @property {string} [linkSlug]           Slug to match against an `<a href>` for clickLink.
 * @property {'prefix'} [matchMode]        Match `/slug/{uuid}` instead of exact `/slug`.
 * @property {Record<string, string>} [fields] Multiple field name → value pairs.
 */

/**
 * @typedef {object} JourneyState
 * @property {number} stopAt               Stop when reaching this 1-indexed step.
 * @property {string} [section]            Restrict run to steps with this section tag.
 * @property {number} [lastCompleted]      Index of the last completed step (for resume across page loads).
 */

/**
 * @typedef {object} LastSubmitSnapshot
 * @property {string} path                 Path the form was submitted from.
 * @property {string[]} entries            `name=value` pairs for the submitted fields.
 */
