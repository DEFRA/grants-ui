import { getValidToken } from '~/src/server/common/helpers/token-manager.js'
import { fetchBusinessDetails } from '~/src/server/consolidated-view/services/consolidated-view.js'

/**
 * @type {object}
 */
jest.mock('~/src/server/common/helpers/token-manager.js', () => ({
  /**
   * @type {jest.Mock<Promise<string>>}
   */
  getValidToken: jest.fn()
}))

/**
 * @type {jest.Mock}
 */
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('fetchBusinessDetails', () => {
  const mockSbi = 123456789
  const mockCrn = 987654321
  const mockToken = 'mock-jwt-token'

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

    /**
     * @type {jest.Mock}
     */
    const typedMock = /** @type {jest.Mock} */ (getValidToken)
    typedMock.mockResolvedValue(mockToken)
  })

  it('should fetch business details successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse)
    })

    const result = await fetchBusinessDetails(mockSbi, mockCrn)

    expect(getValidToken).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    expect(result).toEqual(mockSuccessResponse)
  })

  it('should throw an error when fetch response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    })

    await expect(fetchBusinessDetails(mockSbi, mockCrn)).rejects.toThrow()

    expect(getValidToken).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should handle network errors during fetch', async () => {
    const networkError = new Error('Network error')
    mockFetch.mockRejectedValueOnce(networkError)

    await expect(fetchBusinessDetails(mockSbi, mockCrn)).rejects.toThrow(
      'Network error'
    )

    expect(getValidToken).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should handle token retrieval errors', async () => {
    const tokenError = new Error('Token error')
    /**
     * @type {jest.Mock}
     */
    const typedMock = /** @type {jest.Mock} */ (getValidToken)
    typedMock.mockRejectedValueOnce(tokenError)

    await expect(fetchBusinessDetails(mockSbi, mockCrn)).rejects.toThrow(
      'Token error'
    )

    expect(getValidToken).toHaveBeenCalledTimes(1)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should include correct GraphQL query with SBI and CRN', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse)
    })

    await fetchBusinessDetails(mockSbi, mockCrn)

    const [[, calledOptions]] = mockFetch.mock.calls
    const body = JSON.parse(calledOptions.body)

    expect(calledOptions.method).toBe('POST')
    expect(calledOptions.headers['Content-Type']).toBe('application/json')
    expect(calledOptions.headers.Authorization).toBe(`Bearer ${mockToken}`)

    expect(body.query).toContain(`business(sbi: "${mockSbi}")`)
    expect(body.query).toContain(`customer(crn: "${mockCrn}")`)
  })
})
