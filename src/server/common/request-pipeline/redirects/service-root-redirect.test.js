import { beforeEach, describe, expect, it, vi } from 'vitest'
import { serviceRootRedirect } from './service-root-redirect.js'
import { getFormsCacheService } from '../../helpers/forms-cache/forms-cache.js'
import { mockHapiResponseToolkit } from '~/src/__mocks__'

vi.mock('../../helpers/forms-cache/forms-cache.js', () => ({
  getFormsCacheService: vi.fn()
}))

describe('serviceRootRedirect', () => {
  let request
  let h
  let getState

  beforeEach(() => {
    vi.clearAllMocks()

    getState = vi.fn().mockResolvedValue({ businessDetailsUpToDate: true })
    getFormsCacheService.mockReturnValue({ getState })

    h = mockHapiResponseToolkit()

    request = {
      method: 'get',
      params: { slug: 'woodland' },
      route: { path: '/{slug}' },
      response: { isBoom: false, statusCode: 302 },
      server: {},
      app: {
        model: {
          def: {
            startPage: '/check-details',
            metadata: {
              grantRedirectRules: {
                preSubmission: [{ toPath: '/tasks' }]
              }
            }
          }
        }
      }
    }
  })

  it.each([undefined, 'CLEARED'])(
    'redirects an in-progress %s application from the service root to the preSubmission path',
    async (applicationStatus) => {
      getState.mockResolvedValue({ applicationStatus, businessDetailsUpToDate: true })

      const result = await serviceRootRedirect(request, h)

      expect(h.redirect).toHaveBeenCalledWith('/woodland/tasks')
      expect(result).not.toBe(h.continue)
    }
  )

  it.each([
    {
      desc: 'the request is not a GET',
      setup: () => {
        request.method = 'post'
      }
    },
    {
      desc: 'the route is not the slug root',
      setup: () => {
        request.route.path = '/{slug}/{path}'
      }
    },
    {
      desc: 'there is no slug',
      setup: () => {
        request.params = {}
      }
    },
    {
      desc: 'the response is not a redirect',
      setup: () => {
        request.response = { isBoom: false, statusCode: 200 }
      }
    },
    {
      desc: 'the response is a Boom error',
      setup: () => {
        request.response = { isBoom: true, statusCode: 302 }
      }
    },
    {
      desc: 'the start page is not check-details',
      setup: () => {
        request.app.model.def.startPage = '/start'
      }
    },
    {
      desc: 'the grant has no preSubmission rule',
      setup: () => {
        request.app.model.def.metadata.grantRedirectRules = {}
      }
    },
    {
      desc: 'there is no meaningful state',
      setup: () => {
        getState.mockResolvedValue({ $$__referenceNumber: 'WMP-ABC-DEF' })
      }
    },
    {
      desc: 'state cannot be read',
      setup: () => {
        getState.mockRejectedValue(new Error('redis is down'))
      }
    },
    {
      // The ext runs on every response, including routes the forms engine never loaded a model for.
      desc: 'no form model was loaded',
      setup: () => {
        request.app = {}
      }
    },
    {
      desc: 'the request has no route',
      setup: () => {
        request.route = undefined
      }
    }
  ])('continues when $desc', async ({ setup }) => {
    setup()

    const result = await serviceRootRedirect(request, h)

    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it.each(['SUBMITTED', 'REOPENED', 'PURGED'])('continues for a %s application', async (applicationStatus) => {
    getState.mockResolvedValue({ applicationStatus, businessDetailsUpToDate: true })

    const result = await serviceRootRedirect(request, h)

    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  describe('pre-submission requirement gate', () => {
    beforeEach(() => {
      request.params.slug = 'grasslands'
      request.app.model.def.metadata.grantRedirectRules.preSubmission = [
        {
          toPath: '/summary',
          requiresAnyItemWithNonEmptyKey: { collection: 'landParcels', key: 'actionsObj' },
          incompleteToPath: '/select-land-parcel'
        }
      ]
    })

    it('redirects to the check-answers page when at least one parcel has actions', async () => {
      getState.mockResolvedValue({
        applicationStatus: 'CLEARED',
        landParcels: { 'SD1234-5678': { size: 1, actionsObj: { CSAM3: { value: '1', unit: 'ha' } } } }
      })

      const result = await serviceRootRedirect(request, h)

      expect(h.redirect).toHaveBeenCalledWith('/grasslands/summary')
      expect(result).not.toBe(h.continue)
    })

    it('redirects a returning applicant with a selected parcel but no actions to the select-land-parcel page', async () => {
      getState.mockResolvedValue({
        applicationStatus: 'CLEARED',
        selectedParcelId: 'SD1234-5678',
        selectedParcelIds: ['SD1234-5678'],
        selectedParcelsDisplay: 'SD1234-5678',
        landParcels: {}
      })

      const result = await serviceRootRedirect(request, h)

      expect(h.redirect).toHaveBeenCalledWith('/grasslands/select-land-parcel')
      expect(result).not.toBe(h.continue)
    })

    it('redirects to the check-answers page when at least one of several parcels has actions', async () => {
      getState.mockResolvedValue({
        applicationStatus: 'CLEARED',
        landParcels: {
          'SD1234-5678': { size: 1, actionsObj: { CSAM3: { value: '1', unit: 'ha' } } },
          'SD1234-9999': { size: 1, actionsObj: {} }
        }
      })

      const result = await serviceRootRedirect(request, h)

      expect(h.redirect).toHaveBeenCalledWith('/grasslands/summary')
      expect(result).not.toBe(h.continue)
    })

    it('continues when the gate is unmet and no incompleteToPath is configured', async () => {
      request.app.model.def.metadata.grantRedirectRules.preSubmission = [
        {
          toPath: '/summary',
          requiresAnyItemWithNonEmptyKey: { collection: 'landParcels', key: 'actionsObj' }
        }
      ]
      getState.mockResolvedValue({
        applicationStatus: 'CLEARED',
        selectedParcelId: 'SD1234-5678',
        landParcels: {}
      })

      const result = await serviceRootRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
    })
  })
})
