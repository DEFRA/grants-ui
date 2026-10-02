import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listApplicationsRoute } from './applications.route.js'
import { listApplicationsFromApi } from '../common/helpers/state/fetch-saved-state-helper.js'
import { getAuthenticatedSbi } from '../common/helpers/auth/get-auth-identifiers.js'

vi.mock('../common/helpers/state/fetch-saved-state-helper.js', () => ({
  listApplicationsFromApi: vi.fn()
}))

vi.mock('../common/helpers/auth/get-auth-identifiers.js', () => ({
  getAuthenticatedSbi: vi.fn(() => 'sbi-1')
}))

describe('listApplicationsRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAuthenticatedSbi.mockReturnValue('sbi-1')
  })

  const makeRequest = () => ({ params: { slug: 'test-grant' } })

  it("lists the sbi's applications for this grant and renders them in the view", async () => {
    const applications = [
      { grantCode: 'test-grant', referenceNumber: 'REF-1', updatedAt: '2026-01-01' },
      { grantCode: 'test-grant', referenceNumber: 'REF-2', updatedAt: '2026-01-02' }
    ]
    listApplicationsFromApi.mockResolvedValue(applications)
    const view = vi.fn()
    const h = { view }

    await listApplicationsRoute.handler(makeRequest(), h)

    expect(listApplicationsFromApi).toHaveBeenCalledWith({ sbi: 'sbi-1', grantCode: 'test-grant' })
    expect(view).toHaveBeenCalledWith('applications', {
      pageTitle: 'Your applications',
      slug: 'test-grant',
      applications
    })
  })

  it('renders with an empty applications list', async () => {
    listApplicationsFromApi.mockResolvedValue([])
    const view = vi.fn()
    const h = { view }

    await listApplicationsRoute.handler(makeRequest(), h)

    expect(view).toHaveBeenCalledWith('applications', {
      pageTitle: 'Your applications',
      slug: 'test-grant',
      applications: []
    })
  })
})
