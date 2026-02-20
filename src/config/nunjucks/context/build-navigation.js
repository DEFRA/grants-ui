/**
 * @param {Partial<Request> | null | undefined} request
 */
export function buildNavigation(request) {
  return [
    {
      text: 'Home',
      url: '/',
      isActive: request?.path === '/'
    }
  ]
}

/**
 * @import { Request } from '@hapi/hapi'
 */
