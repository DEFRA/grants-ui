import { PactV3, MatchersV3, SpecificationVersion } from '@pact-foundation/pact'
import { createLandGrantsApiClient } from './land-grants-api.client.js'
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
      .given('I have a list of parcels')
      .uponReceiving('a request for specific parcels & the "size" field requested')
      .withRequest({
        method: 'POST',
        path: '/parcels',
        headers: { 'Content-Type': 'application/json' },
        body: { parcelIds: ['S382-1234'], fields: ['size'] }
      })
      .willRespondWith({ status: 200, headers: { 'Content-Type': 'application/json' }, body: EXPECTED_BODY })
      .executeTest(async (mockserver) => {
        const client = createLandGrantsApiClient(mockserver.url)
        const response = await client.parcelsWithSize(['S382-1234'])

        expect(response.parcels[0]).toEqual(parcelExample)
      })
  })
})
