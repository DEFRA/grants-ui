import { PactV3, MatchersV3, SpecificationVersion } from '@pact-foundation/pact'
import { parcelsWithSize } from '../server/land-grants/services/land-grants.client.js'
import path from 'path'

const provider = new PactV3({
  dir: path.resolve(process.cwd(), 'src/contracts/pacts'),
  consumer: 'grants-ui',
  provider: 'land-grants-api',
  spec: SpecificationVersion.SPECIFICATION_VERSION_V4
})

const parcelExample = { sheetId: 'S382', parcelId: '1234', size: { value: 23.3424, unit: 'ha' } }
const EXPECTED_BODY = MatchersV3.like({ parcels: MatchersV3.eachLike(parcelExample) })

describe('fetchParcelsSize', () => {
  it('returns HTTP 200 and a list of parcels', async () => {
    await provider
      .given('has a parcel with ID', { sheetId: 'S382', parcelId: '1234' })
      .uponReceiving('a request for specific parcels & the "size" field requested')
      .withRequest({
        method: 'POST',
        path: '/parcels',
        headers: { 'Content-Type': 'application/json' },
        body: { parcelIds: ['S38232-1234'], fields: ['size'] }
      })
      .willRespondWith({ status: 200, headers: { 'Content-Type': 'application/json' }, body: EXPECTED_BODY })
      .executeTest(async (mockserver) => {
        const response = await parcelsWithSize(['S38232-1234'], mockserver.url)

        expect(response.parcels[0]).toEqual(parcelExample)
      })
  })
})
