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
  const LOG_PREFIX = '[journey-runner]'

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

  function inputSelector(name) {
    return `input[name="${name}"]`
  }

  const typeHandlers = {
    submitOnly: function () {
      submitForm()
    },

    yesNo: function (step) {
      const input = document.querySelector(`input[name="${step.fieldName}"][value="${step.value || 'true'}"]`)
      if (!input) {
        throw new Error(`${step.fieldName} radio not found`)
      }
      input.click()
      submitForm()
    },

    radios: function (step) {
      const radio = document.querySelector(inputSelector(step.fieldName))
      if (!radio) {
        throw new Error(`${step.fieldName} radio not found`)
      }
      radio.click()
      submitForm()
    },

    checkboxes: function (step) {
      const all = document.querySelectorAll(inputSelector(step.fieldName))
      if (!all.length) {
        throw new Error(`${step.fieldName} checkbox not found`)
      }
      const toClick = step.selectAll ? Array.from(all) : [all[0]]
      toClick.forEach(function (cb) {
        cb.click()
      })
      submitForm()
    },

    numberField: function (step) {
      const input = document.querySelector(inputSelector(step.fieldName))
      if (!input) {
        throw new Error(`${step.fieldName} input not found`)
      }
      setVal(input, step.value)
      submitForm()
    },

    selectField: function (step) {
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

    multilineText: function (step) {
      const textarea = document.querySelector(`textarea[name="${step.fieldName}"]`)
      if (!textarea) {
        throw new Error(`${step.fieldName} textarea not found`)
      }
      setVal(textarea, step.value)
      submitForm()
    },

    dateParts: function (step) {
      const d = new Date()
      if (step.offsetDays) {
        d.setDate(d.getDate() + step.offsetDays)
      }
      const day = document.querySelector(inputSelector(`${step.fieldName}__day`))
      const month = document.querySelector(inputSelector(`${step.fieldName}__month`))
      const year = document.querySelector(inputSelector(`${step.fieldName}__year`))
      if (!day || !month || !year) {
        throw new Error(`${step.fieldName} date inputs not found`)
      }
      setVal(day, String(d.getDate()))
      setVal(month, String(d.getMonth() + 1))
      setVal(year, String(d.getFullYear()))
      submitForm()
    },

    monthYear: function (step) {
      const d = new Date()
      const month = document.querySelector(inputSelector(`${step.fieldName}__month`))
      const year = document.querySelector(inputSelector(`${step.fieldName}__year`))
      if (!month || !year) {
        throw new Error(`${step.fieldName} month/year inputs not found`)
      }
      setVal(month, String(d.getMonth() + 1))
      setVal(year, String(d.getFullYear()))
      submitForm()
    },

    clickLink: function (step) {
      const link = document.querySelector(`a[href$="/${step.linkSlug}"]`)
      if (!link) {
        throw new Error(`Link to /${step.linkSlug} not found`)
      }
      link.click()
    },

    textFields: function (step) {
      const fields = step.fields
      Object.keys(fields).forEach(function (name) {
        const input = document.querySelector(`input[name="${name}"], textarea[name="${name}"]`)
        if (input) {
          setVal(input, fields[name])
        }
      })
      submitForm()
    }
  }

  function findCurrentStep(afterIndex, section) {
    const path = globalThis.location.pathname
    for (let i = afterIndex + 1; i < steps.length; i++) {
      if (section && steps[i].section !== section) {
        continue
      }
      if (path.endsWith(`/${steps[i].slug}`)) {
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
    const lastCompleted = state.lastCompleted ?? -1
    const idx = findCurrentStep(lastCompleted, state.section)

    if (idx === -1) {
      sessionStorage.removeItem(STORAGE_KEY)
      console.log(`${LOG_PREFIX} Reached ${globalThis.location.pathname} — not a known step, journey complete`)
      return
    }

    const step = steps[idx]
    const stepNumber = idx + 1

    // When running a named section, stop if we've left that section
    if (state.section && step.section !== state.section) {
      sessionStorage.removeItem(STORAGE_KEY)
      console.log(`${LOG_PREFIX} Section "${state.section}" complete — stopping at ${globalThis.location.pathname}`)
      return
    }

    if (stepNumber >= state.stopAt) {
      sessionStorage.removeItem(STORAGE_KEY)
      console.log(`${LOG_PREFIX} Arrived at "${step.name}" (step ${stepNumber}) — stopping here`)
      return
    }

    const errorSummary = document.querySelector('.govuk-error-summary')
    if (errorSummary) {
      sessionStorage.removeItem(STORAGE_KEY)
      console.error(`${LOG_PREFIX} Page has errors, stopping:\n${errorSummary.textContent.trim()}`)
      return
    }

    console.log(`${LOG_PREFIX} Step ${stepNumber}: ${step.name}`)

    const handler = typeHandlers[step.type]
    if (!handler) {
      sessionStorage.removeItem(STORAGE_KEY)
      console.error(`${LOG_PREFIX} Unknown step type: ${step.type}`)
      return
    }

    try {
      state.lastCompleted = idx
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      handler(step)
    } catch (err) {
      sessionStorage.removeItem(STORAGE_KEY)
      console.error(`${LOG_PREFIX} Failed on "${step.name}":`, err.message)
    }
  }

  globalThis.runJourney = function (stopAtPageOrSection) {
    let state
    if (typeof stopAtPageOrSection === 'string') {
      const hasSection = steps.some(function (s) {
        return s.section === stopAtPageOrSection
      })
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

  globalThis.stopJourney = function () {
    sessionStorage.removeItem(STORAGE_KEY)
    console.log(`${LOG_PREFIX} Journey stopped`)
  }

  processCurrentPage()
})()
