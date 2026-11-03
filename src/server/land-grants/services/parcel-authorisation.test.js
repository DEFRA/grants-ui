import { vi } from 'vitest'
import { getAuthorisedParcel } from './parcel-authorisation.js'
import { fetchAuthorisedParcelIds } from '~/src/server/land-grants/services/parcel-cache.js'

vi.mock('~/src/server/land-grants/services/parcel-cache.js', () => ({
  fetchAuthorisedParcelIds: vi.fn()
}))

const makeRequest = (parcelId = 'SD7946-0155') => ({ params: { parcelId }, auth: { credentials: { sbi: '1' } } })

describe('getAuthorisedParcel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('splits the compound id when the user holds the parcel', async () => {
    vi.mocked(fetchAuthorisedParcelIds).mockResolvedValue(['SD7946-0155', 'SD7846-4509'])
    const request = makeRequest()

    const parcel = await getAuthorisedParcel(/** @type {any} */ (request))

    expect(parcel).toEqual({ formRequest: request, sheetId: 'SD7946', parcelId: '0155' })
  })

  it.each([
    ['the parcel is not in the holding', ['SD7846-4509']],
    ['the holding is empty', []],
    ['the lookup failed', null]
  ])('returns null when %s', async (_name, authorisedParcelIds) => {
    vi.mocked(fetchAuthorisedParcelIds).mockResolvedValue(authorisedParcelIds)

    expect(await getAuthorisedParcel(/** @type {any} */ (makeRequest()))).toBeNull()
  })
})
