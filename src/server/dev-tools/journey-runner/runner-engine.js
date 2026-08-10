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
  const PARCELS_API_URL = '/api/map/parcels'
  const PARCELS_FIELD_NAME = 'landParcels'
  const WAIT_TIMEOUT_MS = 10000
  const WAIT_POLL_INTERVAL_MS = 100

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

  /**
   * Poll until `predicate` holds, for pages that settle their form state from an
   * async round-trip after an interaction.
   * @param {() => boolean} predicate
   * @param {string} description  what we are waiting for, for the failure message
   * @param {number} [timeoutMs]
   * @returns {Promise<void>}
   */
  function waitFor(predicate, description, timeoutMs = WAIT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs
      const poll = () => {
        if (predicate()) {
          resolve()
        } else if (Date.now() > deadline) {
          reject(new Error(`Timed out after ${timeoutMs}ms waiting for ${description}`))
        } else {
          globalThis.setTimeout(poll, WAIT_POLL_INTERVAL_MS)
        }
      }
      poll()
    })
  }

  /**
   * The page's error summary, ignoring ones inside a `hidden` container. The
   * map pages ship a pre-rendered "No land parcels were found" summary that
   * only their client script unhides - counting it would stop every run on
   * those pages before the step even executed.
   * @returns {Element | undefined}
   */
  function visibleErrorSummary() {
    return Array.from(document.querySelectorAll('.govuk-error-summary')).find((el) => !el.closest('[hidden]'))
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
      // With `value`, pick that specific option (e.g. a particular land parcel);
      // otherwise take the first radio in the group.
      const selector = step.value
        ? `input[name="${step.fieldName}"][value="${step.value}"]`
        : inputSelector(step.fieldName)
      const radio = document.querySelector(selector)
      if (!radio) {
        const valueSuffix = step.value ? ` with value "${step.value}"` : ''
        throw new Error(`${step.fieldName} radio${valueSuffix} not found`)
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

    /**
     * Land-grants "select actions" pages tick an action checkbox, which carries a
     * `landActionQuantity_<actionCode>` field. For an action the user sizes
     * themselves that is a revealed input to type into; for one sized by the
     * parcel it is a hidden field the page fills from an availability round-trip
     * after the tick - so wait for that rather than inventing a number, which the
     * server rejects.
     * @param {JourneyStep} step
     * @returns {Promise<void>}
     */
    async landActions(step) {
      const checkbox = document.querySelector(inputSelector(step.fieldName))
      if (!checkbox) {
        throw new Error(`${step.fieldName} action checkbox not found`)
      }
      checkbox.click()

      const quantityField = document.querySelector(`input[name="landActionQuantity_${checkbox.value}"]`)
      if (quantityField) {
        if (step.value || quantityField.type !== 'hidden') {
          setInputValue(quantityField, step.value ?? '1')
        } else {
          await waitFor(() => Number(quantityField.value) > 0, `chosen area for ${checkbox.value} (page reported none)`)
        }
      }

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

    /**
     * Links into direct-only utility pages carry a query string
     * (`remove-parcel?parcelId=SD1234-5678`), so the `/slug`-suffix match never
     * sees them. Such steps set `linkHrefContains` instead.
     * @param {JourneyStep} step
     * @returns {void}
     */
    clickLink(step) {
      const selector = step.linkHrefContains ? `a[href*="${step.linkHrefContains}"]` : `a[href$="/${step.linkSlug}"]`
      const link = document.querySelector(selector)
      if (!link) {
        throw new Error(`No link matching ${selector}`)
      }
      link.click()
    },

    /**
     * Map-based parcel selection (`MapSelectPageController`). There is nothing
     * per-parcel in the DOM to click - the map is a canvas, and the real
     * selection listener writes hidden `landParcels` inputs into
     * `#selected-parcels-inputs`. The runner takes the parcel IDs straight from
     * the API the map itself loads and writes those same inputs, so the POST
     * payload is identical to a human's without waiting on (or depending on)
     * the map rendering.
     * @param {JourneyStep} step
     * @returns {Promise<void>}
     */
    async mapParcel(step) {
      const container = document.getElementById('selected-parcels-inputs')
      if (!container) {
        throw new Error('Parcel selection container not found - is this a map page?')
      }

      const response = await fetch(PARCELS_API_URL, { headers: { accept: 'application/json' } })
      if (!response.ok) {
        throw new Error(`${PARCELS_API_URL} returned ${response.status}`)
      }

      const body = await response.json()
      const available = (body.features ?? []).map((f) => f.properties?.id ?? f.id).filter(Boolean)
      if (!available.length) {
        throw new Error('No land parcels returned for this account')
      }

      let chosen
      if (step.value) {
        if (!available.includes(step.value)) {
          throw new Error(`Parcel "${step.value}" not available (have: ${available.join(', ')})`)
        }
        chosen = [step.value]
      } else if (step.selectAll) {
        chosen = available
      } else {
        chosen = [available[0]]
      }

      container.replaceChildren(
        ...chosen.map((id) => {
          const input = document.createElement('input')
          input.type = 'hidden'
          input.name = PARCELS_FIELD_NAME
          input.value = id
          return input
        })
      )

      // The page disables Continue when the map fails to load (e.g. no tile
      // access). The selection above does not come from the map, so re-enable it
      // rather than stalling a run the server would have accepted.
      const continueButton = document.getElementById('map-select-continue')
      if (continueButton) {
        continueButton.disabled = false
      }

      console.log(`${LOG_PREFIX} Selected parcel(s): ${chosen.join(', ')}`)
      submitForm()
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

    const errorSummary = visibleErrorSummary()
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
    // A section run that completed no steps never started: the current page is
    // not one of the section's pages (e.g. a cold run entered on the grant's
    // first page, before the section is reachable). Report failure rather than a
    // spurious "journey complete", whose wording would otherwise be picked up as
    // a success by the CLI driver's SUCCESS_MARKERS.
    if (state.section && (state.lastCompleted ?? -1) < 0) {
      console.error(`${LOG_PREFIX} No steps found for section "${state.section}" on ${globalThis.location.pathname}`)
      return
    }
    console.log(`${LOG_PREFIX} Reached ${globalThis.location.pathname} - not a known step, journey complete`)
  }

  /**
   * Decide whether the run should stop before the matched step is executed,
   * in priority order. Returns `null` when the step should run.
   * @param {JourneyState} state
   * @param {JourneyStep} step
   * @param {number} stepNumber 1-based position of `step` in `steps`
   * @returns {{ level: 'log' | 'error', message: string } | null}
   */
  function findStopReason(state, step, stepNumber) {
    if (state.section && step.section !== state.section) {
      return {
        level: 'log',
        message: `Section "${state.section}" complete - stopping at ${globalThis.location.pathname}`
      }
    }

    if (stepNumber >= state.stopAt) {
      return { level: 'log', message: `Arrived at "${step.name}" (step ${stepNumber}) - stopping here` }
    }

    const errorSummary = visibleErrorSummary()
    if (errorSummary) {
      return { level: 'error', message: `Page has errors, stopping:\n${errorSummary.textContent.trim()}` }
    }

    if (!stepHandlers[step.type]) {
      return { level: 'error', message: `Unknown step type: ${step.type}` }
    }

    return null
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

    const stop = findStopReason(state, step, stepNumber)
    if (stop) {
      sessionStorage.removeItem(STORAGE_KEY)
      console[stop.level](`${LOG_PREFIX} ${stop.message}`)
      return
    }

    const handler = stepHandlers[step.type]
    console.log(`${LOG_PREFIX} Step ${stepNumber}: ${step.name}`)

    try {
      // Mark step as started before running the handler so the next page load
      // resumes from the following step rather than re-running this one.
      state.lastCompleted = idx
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      const result = handler(step)
      // Async handlers (e.g. mapParcel, which has to fetch the parcel list)
      // settle after this try block, so route their failures to the same place.
      if (result && typeof result.then === 'function') {
        result.catch((err) => failStep(step, err))
      }
    } catch (err) {
      failStep(step, err)
    }
  }

  /**
   * Abandon the run and explain which step broke.
   * @param {JourneyStep} step
   * @param {Error} err
   * @returns {void}
   */
  function failStep(step, err) {
    sessionStorage.removeItem(STORAGE_KEY)
    console.error(`${LOG_PREFIX} Failed on "${step.name}":`, err.message)
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

  // This is a classic script, so it runs while the document is still parsing -
  // before the page's own deferred/module scripts (map wiring, select-actions
  // quantity fields) have attached anything. Wait for them.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => processCurrentPage())
  } else {
    processCurrentPage()
  }
})()

/**
 * @typedef {object} JourneyStep
 * @property {string} name                 Human-readable step name (used in logs).
 * @property {string} type                 Step type - must match a key in `stepHandlers`.
 * @property {string} slug                 URL slug to match against the current page path.
 * @property {string} [section]            Optional section tag for partial runs.
 * @property {string} [fieldName]          Form field name (for steps that touch a single field).
 * @property {string} [value]              Value to set (for input/text/yesNo steps).
 * @property {boolean} [selectAll]         Tick every checkbox (or select every land parcel) instead of just the first.
 * @property {number} [offsetDays]         Days to add to "today" for date-parts steps.
 * @property {string} [linkSlug]           Slug to match against an `<a href>` for clickLink.
 * @property {string} [linkHrefContains]   Substring to match an `<a href>` on instead of `linkSlug`, for links carrying a query string.
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
