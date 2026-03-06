// @ts-nocheck
/* eslint-disable no-console */
/* global sessionStorage */
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

  function setVal(el, value) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')
    if (setter?.set) {
      setter.set.call(el, value)
    } else {
      el.value = value
    }
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function submitForm() {
    const form = document.querySelector('form[method="post"], form.form')
    if (!form) {
      throw new Error('No form found on page')
    }
    const button = form.querySelector('button.govuk-button:not(.govuk-button--secondary)')
    if (!button) {
      throw new Error('No submit button found')
    }
    button.click()
  }

  const typeHandlers = {
    submitOnly: function () {
      submitForm()
    },

    yesNo: function (step) {
      const input = document.querySelector(
        'input[name="' + step.fieldName + '"][value="' + (step.value || 'true') + '"]'
      )
      if (!input) {
        throw new Error(step.fieldName + ' radio not found')
      }
      input.click()
      submitForm()
    },

    radios: function (step) {
      const radio = document.querySelector('input[name="' + step.fieldName + '"]')
      if (!radio) {
        throw new Error(step.fieldName + ' radio not found')
      }
      radio.click()
      submitForm()
    },

    checkboxes: function (step) {
      const checkbox = document.querySelector('input[name="' + step.fieldName + '"]')
      if (!checkbox) {
        throw new Error(step.fieldName + ' checkbox not found')
      }
      checkbox.click()
      submitForm()
    },

    numberField: function (step) {
      const input = document.querySelector('input[name="' + step.fieldName + '"]')
      if (!input) {
        throw new Error(step.fieldName + ' input not found')
      }
      setVal(input, step.value)
      submitForm()
    },

    selectField: function (step) {
      const select = document.querySelector('select[name="' + step.fieldName + '"]')
      if (!select) {
        throw new Error(step.fieldName + ' select not found')
      }
      const option = select.querySelector('option[value]:not([value=""])')
      if (!option) {
        throw new Error(step.fieldName + ' has no options')
      }
      select.value = option.value
      select.dispatchEvent(new Event('change', { bubbles: true }))
      submitForm()
    },

    multilineText: function (step) {
      const textarea = document.querySelector('textarea[name="' + step.fieldName + '"]')
      if (!textarea) {
        throw new Error(step.fieldName + ' textarea not found')
      }
      setVal(textarea, step.value)
      submitForm()
    },

    dateParts: function (step) {
      const d = new Date()
      if (step.offsetDays) {
        d.setDate(d.getDate() + step.offsetDays)
      }
      const day = document.querySelector('input[name="' + step.fieldName + '__day"]')
      const month = document.querySelector('input[name="' + step.fieldName + '__month"]')
      const year = document.querySelector('input[name="' + step.fieldName + '__year"]')
      if (!day || !month || !year) {
        throw new Error(step.fieldName + ' date inputs not found')
      }
      setVal(day, String(d.getDate()))
      setVal(month, String(d.getMonth() + 1))
      setVal(year, String(d.getFullYear()))
      submitForm()
    },

    monthYear: function (step) {
      const d = new Date()
      const month = document.querySelector('input[name="' + step.fieldName + '__month"]')
      const year = document.querySelector('input[name="' + step.fieldName + '__year"]')
      if (!month || !year) {
        throw new Error(step.fieldName + ' month/year inputs not found')
      }
      setVal(month, String(d.getMonth() + 1))
      setVal(year, String(d.getFullYear()))
      submitForm()
    },

    clickLink: function (step) {
      const link = document.querySelector('a[href$="/' + step.linkSlug + '"]')
      if (!link) {
        throw new Error('Link to /' + step.linkSlug + ' not found')
      }
      link.click()
    },

    textFields: function (step) {
      const fields = step.fields
      Object.keys(fields).forEach(function (name) {
        const input = document.querySelector('input[name="' + name + '"], textarea[name="' + name + '"]')
        if (input) {
          setVal(input, fields[name])
        }
      })
      submitForm()
    }
  }

  function findCurrentStep() {
    const path = globalThis.location.pathname
    for (let i = 0; i < steps.length; i++) {
      if (path.endsWith('/' + steps[i].slug)) {
        return i
      }
    }
    return -1
  }

  function processCurrentPage() {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return
    }

    const state = JSON.parse(raw)
    const idx = findCurrentStep()

    if (idx === -1) {
      sessionStorage.removeItem(STORAGE_KEY)
      console.log('[journey-runner] Reached ' + globalThis.location.pathname + ' — not a known step, journey complete')
      return
    }

    const stepNumber = idx + 1

    if (stepNumber >= state.stopAt) {
      sessionStorage.removeItem(STORAGE_KEY)
      console.log('[journey-runner] Arrived at "' + steps[idx].name + '" (step ' + stepNumber + ') — stopping here')
      return
    }

    const errorSummary = document.querySelector('.govuk-error-summary')
    if (errorSummary) {
      sessionStorage.removeItem(STORAGE_KEY)
      console.error('[journey-runner] Page has errors, stopping:\n' + errorSummary.textContent.trim())
      return
    }

    const step = steps[idx]
    console.log('[journey-runner] Step ' + stepNumber + ': ' + step.name)

    const handler = typeHandlers[step.type]
    if (!handler) {
      sessionStorage.removeItem(STORAGE_KEY)
      console.error('[journey-runner] Unknown step type: ' + step.type)
      return
    }

    try {
      handler(step)
    } catch (err) {
      sessionStorage.removeItem(STORAGE_KEY)
      console.error('[journey-runner] Failed on "' + step.name + '":', err.message)
    }
  }

  globalThis.runJourney = function (stopAtPage) {
    const totalPages = stopAtPage || steps.length
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ stopAt: totalPages }))
    console.log('[journey-runner] Starting journey, will stop at step ' + totalPages)
    processCurrentPage()
  }

  globalThis.stopJourney = function () {
    sessionStorage.removeItem(STORAGE_KEY)
    console.log('[journey-runner] Journey stopped')
  }

  processCurrentPage()
})()
