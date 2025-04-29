import { getValidToken } from '~/src/server/common/helpers/entra/token-manager.js'
import { fetchParcelDataForBusiness } from '~/src/server/common/services/consolidated-view.service.js'

jest.mock('~/src/server/common/helpers/entra/token-manager.js', () => ({
  getValidToken: jest.fn()
}))

/**
 * @type {jest.Mock}
 */
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('fetchParcelDataForBusiness', () => {
  const mockSbi = 123456789
  const mockCrn = 987654321
  const mockToken = 'mock-token-123'

  /**
   * @type {object}
   */
  const mockSuccessResponse = {
    data: {
      business: {
        sbi: mockSbi,
        organisationId: 'ORG123',
        customer: {
          firstName: 'John',
          lastName: 'Doe',
          role: 'Owner'
        }
      }
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockReset()
    getValidToken.mockResolvedValue(mockToken)
  })

  it('should fetch business details successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse)
    })

    const result = await fetchParcelDataForBusiness(mockSbi, mockCrn)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(result).toEqual(mockSuccessResponse)

    const [[, calledOptions]] = mockFetch.mock.calls
    expect(calledOptions.headers.Authorization).toBe(`Bearer ${mockToken}`)
  })

  it('should throw an error when fetch response is not ok', async () => {
    const errorText = 'Error response from API'
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve(errorText)
    })

    await expect(fetchParcelDataForBusiness(mockSbi, mockCrn)).rejects.toThrow(
      'Failed to fetch business data: 404 Not Found'
    )
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should include error details in thrown error', async () => {
    const errorText = 'Error response from API'
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: errorText,
      text: () => Promise.resolve(errorText)
    })

    const error = await fetchParcelDataForBusiness(mockSbi, mockCrn).catch(
      (e) => e
    )
    expect(error.status).toBe(500)
    expect(error.responseBody).toBe(
      `Failed to fetch business data: 500 ${errorText}`
    )
  })

  it('should handle network errors during fetch', async () => {
    const networkError = new Error('Network error')
    mockFetch.mockRejectedValueOnce(networkError)

    await expect(fetchParcelDataForBusiness(mockSbi, mockCrn)).rejects.toThrow(
      'Network error'
    )
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should include correct GraphQL query with SBI and CRN', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse)
    })

    await fetchParcelDataForBusiness(mockSbi, mockCrn)

    const [[, calledOptions]] = mockFetch.mock.calls
    const body = JSON.parse(calledOptions.body)

    expect(calledOptions.method).toBe('POST')
    expect(calledOptions.headers['Content-Type']).toBe('application/json')
    expect(calledOptions.headers.Authorization).toBe(`Bearer ${mockToken}`)
    expect(body.query).toContain(`business(sbi: "${mockSbi}")`)
    expect(body.query).toContain(`customer(crn: "${mockCrn}")`)
  })
})
