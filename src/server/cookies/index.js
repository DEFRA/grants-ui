import Joi from 'joi'
import { cookiesController, cookiesPostController } from './cookies.controller.js'
import { COOKIE_PAGE_URL, MAX_RETURN_URL_LENGTH } from './constants.js'

/**
 * Sets up the routes for the cookies page.
 * These routes are registered in src/server/router.js.
 * The cookie page URL is configurable via the COOKIE_POLICY_URL environment variable.
 */

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const cookies = {
  plugin: {
    name: 'cookies',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: COOKIE_PAGE_URL,
          options: {
            auth: false
          },
          ...cookiesController
        },
        {
          method: 'POST',
          path: COOKIE_PAGE_URL,
          options: {
            auth: false,
            validate: {
              payload: Joi.object({
                analytics: Joi.boolean().required(),
                async: Joi.boolean().default(false),
                crumb: Joi.string().allow('').optional(),
                returnUrl: Joi.string().allow('').max(MAX_RETURN_URL_LENGTH).optional()
              }),
              options: { abortEarly: false },
              failAction: 'ignore'
            }
          },
          ...cookiesPostController
        }
      ])
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
