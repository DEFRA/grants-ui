import { fetchParcelDataForBusiness } from '~/src/server/common/services/consolidated-view.service.js'

/**
 * @type {jest.Mock}
 */
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('fetchParcelDataForBusiness', () => {
  const mockSbi = 123456789
  const mockCrn = 987654321

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
  })

  it('should fetch business details successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse)
    })

    const result = await fetchParcelDataForBusiness(mockSbi, mockCrn)

    expect(mockFetch).toHaveBeenCalledTimes(1)

    expect(result).toEqual(mockSuccessResponse)
  })

  it('should throw an error when fetch response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    })

    await expect(fetchParcelDataForBusiness(mockSbi, mockCrn)).rejects.toThrow()

    expect(mockFetch).toHaveBeenCalledTimes(1)
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

    expect(body.query).toContain(`business(sbi: "${mockSbi}")`)
    expect(body.query).toContain(`customer(crn: "${mockCrn}")`)
  })
})
