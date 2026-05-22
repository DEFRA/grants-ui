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
 * @typedef {object} SetupControllerMocksOptions
 * @property {string} [proceed] Value resolved by the mocked `proceed` method.
 * @property {string} [nextPath] Value returned by the mocked `getNextPath` method.
 */

/**
 * @import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
 */
