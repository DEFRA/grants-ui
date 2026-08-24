import { vi } from 'vitest'

/**
 * Replace a controller's interaction methods with vitest spies for tests.
 * @param {QuestionPageController} controller
 * @param {SetupControllerMocksOptions} [options]
 * @returns {void}
 */
export const setupControllerMocks = (controller, { proceed = 'redirected', nextPath = '/next-path' } = {}) => {
  controller.proceed = vi.fn().mockResolvedValue(proceed)
  controller.getNextPath = vi.fn().mockReturnValue(nextPath)
  controller.setState = vi.fn()
  controller.getState = vi.fn().mockResolvedValue({})
}

/**
 * Route handlers render `viewName` so a test can assert on what h.view was given.
 * @param {string} viewName
 * @returns {{ QuestionPageController: new (model?: object, pageDef?: object) => object }}
 */
export const makeQuestionPageControllerMock = (viewName) => ({
  QuestionPageController: class {
    constructor(model, pageDef) {
      this.model = model
      this.pageDef = pageDef
    }

    getViewModel(_request, _context) {}

    getHref(path) {
      return `/${this.model.basePath}/${path}`.replace(/\/{2,}/g, '/')
    }

    makeGetRouteHandler() {
      return async (request, context, h) => h.view(viewName, this.getViewModel(request, context))
    }

    makePostRouteHandler() {
      return async (request, context, h) => h.view(viewName, this.getViewModel(request, context))
    }
  }
})

/**
 * @typedef {object} SetupControllerMocksOptions
 * @property {string} [proceed] Value resolved by the mocked `proceed` method.
 * @property {string} [nextPath] Value returned by the mocked `getNextPath` method.
 */

/**
 * @import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
 */
