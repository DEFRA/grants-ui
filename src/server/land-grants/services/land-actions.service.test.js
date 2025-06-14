import { config } from '~/src/config/config.js'
import {
  calculateApplicationPayment,
  fetchAvailableActionsForParcel,
  validateLandActions
} from '~/src/server/land-grants/services/land-actions.service.js'

const landGrantsApi = config.get('landGrants.grantsServiceApiEndpoint')

/**
 * @type {jest.Mock}
 */
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('fetchAvailableActionsForParcel', () => {
  const parcelId = '9238'
  const sheetId = 'SX0679'

  /**
   * @type {object}
   */
  const mockSuccessResponse = {
    message: 'success',
    parcels: [
      {
        parcelId: '9238',
        sheetId: 'SX0679',
        size: {
          unit: 'ha',
          value: 477
        },
        actions: [
          {
            code: 'BND1',
            description: 'BND1: Maintain dry stone walls'
          }
        ]
      }
    ]
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockReset()
  })

  it('should fetch land actions successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse)
    })

    const result = await fetchAvailableActionsForParcel(parcelId, sheetId)
    expect(mockFetch).toHaveBeenCalledWith(
      `${landGrantsApi}/parcels`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          parcelIds: ['SX0679-9238'],
          fields: ['actions', 'actions.availableArea']
        })
      })
    )

    expect(result).toEqual(mockSuccessResponse.parcels[0])
  })

  it('should throw an error when fetch response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    })

    await expect(
      fetchAvailableActionsForParcel(parcelId, sheetId)
    ).rejects.toThrow()

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should handle network errors during fetch', async () => {
    const networkError = new Error('Network error')
    mockFetch.mockRejectedValueOnce(networkError)

    await expect(
      fetchAvailableActionsForParcel(parcelId, sheetId)
    ).rejects.toThrow('Network error')

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

describe('calculateApplicationPayment', () => {
  const sheetId = 'SX0679'
  const parcelId = '9238'
  const actionsObj = {
    BND1: { value: 10 },
    UP2: { value: 5 }
  }

  /**
   * @type {object}
   */
  const mockSuccessResponse = {
    payment: {
      total: 1250.75
    }
  }

  const expectedPayload = {
    landActions: [
      {
        sheetId,
        parcelId,
        sbi: 117235001,
        actions: [
          { code: 'BND1', quantity: 10 },
          { code: 'UP2', quantity: 5 }
        ]
      }
    ]
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockReset()
  })

  it('should calculate payment successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse)
    })

    const result = await calculateApplicationPayment(
      sheetId,
      parcelId,
      actionsObj
    )

    expect(mockFetch).toHaveBeenCalledWith(
      `${landGrantsApi}/payments/calculate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(expectedPayload)
      }
    )

    expect(result).toEqual({
      ...mockSuccessResponse,
      paymentTotal: '£1,250.75'
    })
  })

  it('should handle null payment amount correctly', async () => {
    const nullPaymentResponse = {
      errorMessage: 'Error calculating payment. Please try again later.',
      payment: {
        total: null
      }
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(nullPaymentResponse)
    })

    const result = await calculateApplicationPayment(
      sheetId,
      parcelId,
      actionsObj
    )

    expect(result).toEqual({
      ...nullPaymentResponse,
      paymentTotal: null
    })
  })

  it('should throw an error when fetch response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request'
    })

    await expect(
      calculateApplicationPayment(sheetId, parcelId, actionsObj)
    ).rejects.toThrow('Bad Request')

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should handle network errors during fetch', async () => {
    const networkError = new Error('Network error')
    mockFetch.mockRejectedValueOnce(networkError)

    await expect(
      calculateApplicationPayment(sheetId, parcelId, actionsObj)
    ).rejects.toThrow('Network error')

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should use empty actions array when no actionsObj is provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ payment: { total: 0 } })
    })

    await calculateApplicationPayment(sheetId, parcelId)

    const expectedEmptyPayload = {
      landActions: [
        {
          sheetId,
          parcelId,
          sbi: 117235001,
          actions: []
        }
      ]
    }

    expect(mockFetch).toHaveBeenCalledWith(
      `${landGrantsApi}/payments/calculate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(expectedEmptyPayload)
      }
    )
  })

  it('should format the payment total with GBP currency', async () => {
    const paymentResponse = {
      payment: {
        total: 10500.5
      }
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(paymentResponse)
    })

    const result = await calculateApplicationPayment(
      sheetId,
      parcelId,
      actionsObj
    )

    expect(result.paymentTotal).toBe('£10,500.50')
  })
})

describe('validateLandActions', () => {
  const sheetId = 'SX0679'
  const parcelId = '9238'
  const actionsObj = {
    BND1: { value: 10 },
    UP2: { value: 5 }
  }

  /**
   * @type {object}
   */
  const mockSuccessResponse = {
    valid: true,
    errorMessages: []
  }

  const expectedPayload = {
    landActions: [
      {
        sheetId,
        parcelId,
        sbi: 117235001,
        actions: [
          { code: 'BND1', quantity: 10 },
          { code: 'UP2', quantity: 5 }
        ]
      }
    ]
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockReset()
  })

  it('should validate land actions successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse)
    })

    const result = await validateLandActions(sheetId, parcelId, actionsObj)

    expect(mockFetch).toHaveBeenCalledWith(
      `${landGrantsApi}/actions/validate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(expectedPayload)
      }
    )

    expect(result).toEqual(mockSuccessResponse)
  })

  it('should handle validation errors correctly', async () => {
    const validationErrorResponse = {
      valid: false,
      errorMessages: [
        {
          code: 'BND1',
          message: 'Area exceeds available area for action'
        }
      ]
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(validationErrorResponse)
    })

    const result = await validateLandActions(sheetId, parcelId, actionsObj)

    expect(result).toEqual(validationErrorResponse)
  })

  it('should throw an error when fetch response is not ok', async () => {
    const errorText = JSON.stringify({ message: 'Bad Request' })

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValueOnce(errorText),
      statusText: 'Bad Request'
    })

    await expect(
      validateLandActions(sheetId, parcelId, actionsObj)
    ).rejects.toThrow('Bad Request')

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should handle network errors during fetch', async () => {
    const networkError = new Error('Network error')
    mockFetch.mockRejectedValueOnce(networkError)

    await expect(
      validateLandActions(sheetId, parcelId, actionsObj)
    ).rejects.toThrow('Network error')

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should use empty actions array when no actionsObj is provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ valid: true, errorMessages: [] })
    })

    await validateLandActions(sheetId, parcelId)

    const expectedEmptyPayload = {
      landActions: [
        {
          sheetId,
          parcelId,
          sbi: 117235001,
          actions: []
        }
      ]
    }

    expect(mockFetch).toHaveBeenCalledWith(
      `${landGrantsApi}/actions/validate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(expectedEmptyPayload)
      }
    )
  })
})
