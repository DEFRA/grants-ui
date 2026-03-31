import { resolveApplicant } from './resolve-applicant.js'

vi.mock('~/src/server/common/services/consolidated-view/consolidated-view.service.js', () => ({
  fetchBusinessAndCustomerInformation: vi.fn()
}))

vi.mock('~/src/server/common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__/logger-mocks.js')
  return mockLogHelper()
})

const { fetchBusinessAndCustomerInformation } =
  await import('~/src/server/common/services/consolidated-view/consolidated-view.service.js')

const logContext = { grantType: 'test-grant', referenceNumber: 'REF123' }
const mockRequest = { auth: { credentials: { sbi: '123', crn: 'crn123' } } }

describe('resolveApplicant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns existing applicant from state when customer is present', async () => {
    const state = { applicant: { customer: { name: { first: 'Jo', last: 'Smith' } } } }

    const result = await resolveApplicant(state, mockRequest, logContext)

    expect(result).toBe(state.applicant)
    expect(fetchBusinessAndCustomerInformation).not.toHaveBeenCalled()
  })

  test('returns existing applicant from state when business name is present', async () => {
    const state = { applicant: { business: { name: 'Test Farm' } } }

    const result = await resolveApplicant(state, mockRequest, logContext)

    expect(result).toBe(state.applicant)
    expect(fetchBusinessAndCustomerInformation).not.toHaveBeenCalled()
  })

  test('fetches from API when applicant is missing from state', async () => {
    const apiData = { customer: { name: { first: 'Jo', last: 'Smith' } }, business: { name: 'Farm' } }
    fetchBusinessAndCustomerInformation.mockResolvedValue(apiData)

    const result = await resolveApplicant({}, mockRequest, logContext)

    expect(fetchBusinessAndCustomerInformation).toHaveBeenCalledWith(mockRequest)
    expect(result).toBe(apiData)
  })

  test('returns undefined and logs when API call fails', async () => {
    fetchBusinessAndCustomerInformation.mockRejectedValue(new Error('API down'))

    const result = await resolveApplicant({}, mockRequest, logContext)

    expect(result).toBeUndefined()
  })
})
