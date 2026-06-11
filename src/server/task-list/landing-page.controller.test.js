import { describe, expect, it, vi } from 'vitest'
import LandingPageController from './landing-page.controller.js'

vi.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js', () => {
  return {
    QuestionPageController: class QuestionPageController {
      model
      pageDef
      next

      constructor(model, pageDef) {
        this.model = model
        this.pageDef = pageDef
        this.next = pageDef.next ?? []
      }

      // Mimics the V2 base behaviour. A distinct sentinel lets us assert when
      // the controller defers to the base forward walk instead of using its
      // own `next` links.
      getNextPath() {
        return '/base-next'
      }

      // Mimics the inherited start-path resolution.
      getStartPath() {
        return '/start'
      }

      // Mimics the base view model, including the form-wide submit button text
      // injected from metadata.options.submitButtonText.
      getViewModel() {
        return { pageTitle: 'Application reopened', submitButtonText: 'Save and continue' }
      }
    }
  }
})

const buildController = (next, conditions = {}) => {
  const model = { conditions }
  const pageDef = { path: '/reopened', next }
  return new LandingPageController(model, pageDef)
}

// During real navigation (after POST/Continue) the engine has already built
// `context.paths`, so it is non-empty.
const navContext = (overrides = {}) => ({ evaluationState: {}, paths: ['/start'], ...overrides })

describe('LandingPageController', () => {
  it('should set allowSaveAndExit to false', () => {
    const controller = buildController([{ path: '/summary' }])
    expect(controller.allowSaveAndExit).toBe(false)
  })

  it('should resolve the next path from the page definition next links', () => {
    const controller = buildController([{ path: '/summary' }])
    expect(controller.getNextPath(navContext())).toBe('/summary')
  })

  it('should take the first link without a condition', () => {
    const controller = buildController([{ path: '/first' }, { path: '/second' }])
    expect(controller.getNextPath(navContext())).toBe('/first')
  })

  it('should defer to the base forward walk while the context is being built (paths empty)', () => {
    // While the engine walks pages from start to the requested page,
    // `context.paths` is still empty. Diverting backwards here would create an
    // infinite walk loop when two pages share this controller, so the
    // controller must NOT use its `next` links and instead defer to the base.
    const controller = buildController([{ path: '/summary' }])
    expect(controller.getNextPath({ evaluationState: {}, paths: [] })).toBe('/base-next')
  })

  it('should honour conditions and pick the first matching link', () => {
    const conditions = {
      condA: { fn: () => false },
      condB: { fn: () => true }
    }
    const controller = buildController(
      [
        { path: '/a', condition: 'condA' },
        { path: '/b', condition: 'condB' }
      ],
      conditions
    )
    expect(controller.getNextPath(navContext())).toBe('/b')
  })

  it('should not return a back link', () => {
    const controller = buildController([{ path: '/summary' }])
    expect(controller.getBackLink()).toBeUndefined()
  })

  it('should always use "Continue" for the submit button, ignoring metadata submitButtonText', () => {
    const controller = buildController([{ path: '/summary' }])
    const viewModel = controller.getViewModel({}, navContext())
    expect(viewModel.submitButtonText).toBe('Continue')
    // other base view model values are preserved
    expect(viewModel.pageTitle).toBe('Application reopened')
  })

  it('should fall back to the start page when no link matches', () => {
    const conditions = { condA: { fn: () => false } }
    const controller = buildController([{ path: '/a', condition: 'condA' }], conditions)
    expect(controller.getNextPath(navContext())).toBe('/start')
  })

  it('should fall back to the start page when there are no links', () => {
    const controller = buildController([])
    expect(controller.getNextPath(navContext())).toBe('/start')
  })
})
