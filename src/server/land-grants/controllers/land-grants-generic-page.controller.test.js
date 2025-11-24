import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import LandGrantsGenericPageController from './land-grants-generic-page.controller.js'

describe('LandGrantsGenericPageController', () => {
  let mockH

  beforeEach(() => {
    mockH = {
      view: vi.fn().mockReturnThis(),
      response: vi.fn().mockReturnThis()
    }
  })

  afterEach(vi.clearAllMocks)

  test('should return the correct view and no back link for a page', () => {
    const mockRequest = {
      params: {
        path: 'terms-and-conditions'
      }
    }

    const mockContext = {}

    const controller = new LandGrantsGenericPageController()
    const handler = controller.makeGetRouteHandler()
    handler(mockRequest, mockContext, mockH)
    expect(mockH.view).toHaveBeenCalledWith('terms-and-conditions', expect.objectContaining({ backLink: null }))
  })

  test('should raise an error if the path is not valid', async () => {
    const mockRequest = {
      params: {
        path: 'fake-path'
      }
    }
    const controller = new LandGrantsGenericPageController()
    const handler = controller.makeGetRouteHandler()
    await expect(handler(mockRequest, {}, mockH)).rejects.toThrow('Unexpected path: fake-path')
  })
})
