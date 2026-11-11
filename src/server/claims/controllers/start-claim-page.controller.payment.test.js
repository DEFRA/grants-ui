import { vi } from 'vitest'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import StartClaimPageController from './start-claim-page.controller.js'
import { getAvailableClaimEntitlements } from '~/src/server/common/services/grant-application/grant-application.service.js'
import { postToLandGrantsApi } from '~/src/server/land-grants/services/land-grants.client.js'

vi.mock('~/src/server/common/services/grant-application/grant-application.service.js', () => ({
  getAvailableClaimEntitlements: vi.fn()
}))

vi.mock('~/src/server/land-grants/services/land-grants.client.js', async (importOriginal) => ({
  ...(await importOriginal()),
  postToLandGrantsApi: vi.fn()
}))

describe('WMP claim payment request', () => {
  it.each([
    { totalHectares: 45.5, originalTotalHectares: 50 },
    { totalHectares: 55.1234, originalTotalHectares: 50 },
    { totalHectares: 50, originalTotalHectares: 50 }
  ])('sends both areas when viewing the claimable payment: %o', async ({ totalHectares, originalTotalHectares }) => {
    vi.mocked(getAvailableClaimEntitlements).mockResolvedValueOnce({
      availableClaims: [
        {
          entitlementId: 'entitlement-123',
          data: {
            totalHectares: { value: totalHectares, decimalPlaces: 4, minValue: 0.5, maxValue: null },
            originalTotalHectares: { value: originalTotalHectares, decimalPlaces: 4, minValue: null, maxValue: null },
            actionCode: { value: 'PA3' },
            actionVersion: { value: '1.2.3' }
          }
        }
      ]
    })
    vi.mocked(postToLandGrantsApi).mockResolvedValueOnce({
      message: 'success',
      payment: { agreementTotalPence: 300000 }
    })
    QuestionPageController.prototype.getViewModel = vi.fn().mockReturnValue({
      components: [{ type: 'Html', model: { content: '{{ (totalClaimAmountPence / 100) | formatCurrency }}' } }]
    })
    const controller = new StartClaimPageController(
      { def: { metadata: { pageConfig: { '/claim': { paymentStrategy: 'woodland-claim' } } } } },
      { title: 'Review your WMP claim', path: '/claim' }
    )
    controller.setState = vi.fn().mockResolvedValue(undefined)
    const request = {
      method: 'GET',
      params: { slug: 'woodland' },
      auth: { credentials: { token: 'defra-id-token', sbi: '123456789', crn: '1234567890' } }
    }
    const context = { state: { $$__referenceNumber: 'WMP-A1B2-C3D4' } }
    const h = { view: vi.fn() }

    await controller.makeGetRouteHandler()(request, context, h)

    expect(postToLandGrantsApi).toHaveBeenCalledExactlyOnceWith(
      '/api/v1/wmp/payments/calculate-by-total-area',
      {
        totalAreaHa: totalHectares,
        originalTotalAreaHa: originalTotalHectares,
        applicationId: 'WMP-A1B2-C3D4',
        sbi: '123456789',
        crn: '1234567890'
      },
      expect.any(String),
      { defraIdToken: 'defra-id-token', sbi: '123456789' }
    )
    expect(h.view).toHaveBeenCalledWith(
      'start-claim',
      expect.objectContaining({
        totalEligibleArea: totalHectares,
        totalClaimAmountPence: 300000,
        components: [{ type: 'Html', model: { content: '£3,000.00' } }]
      })
    )
    expect(controller.setState).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        claims: [
          expect.objectContaining({
            totalEligibleArea: totalHectares,
            totalClaimAmountPence: 300000
          })
        ]
      })
    )
  })
})
