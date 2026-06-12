// @ts-nocheck
import { vi } from 'vitest'
import MapSubmissionPageController from './map-submission-page.controller.js'
import { setupControllerMocks } from '~/src/__mocks__/controller-mocks.js'

vi.mock('~/src/server/task-list/task-list.helper.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, withTaskContext: (Base) => Base }
})

vi.mock('~/src/server/common/helpers/form-slug-helper.js', () => ({
  getConfirmationPath: vi.fn().mockReturnValue('/example-grant/confirmation')
}))

function makeController() {
  const controller = new MapSubmissionPageController({}, { config: {} })
  setupControllerMocks(controller)
  return controller
}

function makeRequest() {
  return { path: '/submit', query: {} }
}

function makeContext() {
  return { state: {} }
}

function makeH() {
  return { redirect: vi.fn().mockReturnValue('redirect-response') }
}

describe('MapSubmissionPageController', () => {
  it('redirects to the confirmation path on POST', async () => {
    const controller = makeController()
    const request = makeRequest()
    const context = makeContext()
    const h = makeH()

    const handler = controller.makePostRouteHandler()
    const result = await handler(request, context, h)

    expect(h.redirect).toHaveBeenCalledWith('/example-grant/confirmation')
    expect(result).toBe('redirect-response')
  })
})
