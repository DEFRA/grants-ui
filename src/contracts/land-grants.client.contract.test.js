import { PactV3, MatchersV3, SpecificationVersion } from '@pact-foundation/pact'
import { parcelsWithSize, parcelsWithActionsAndSize } from '~/src/server/land-grants/services/land-grants.client.js'
import path from 'path'

const provider = new PactV3({
  dir: path.resolve(process.cwd(), 'src/contracts/pacts'),
  consumer: 'grants-ui',
  provider: 'land-grants-api',
  spec: SpecificationVersion.SPECIFICATION_VERSION_V4
})

describe('fetchParcelsSize', () => {
  const parcelWithSizeExample = { sheetId: 'S38232', parcelId: '1234', size: { value: 23.3424, unit: 'ha' } }
  const EXPECTED_BODY = MatchersV3.like({ parcels: MatchersV3.eachLike(parcelWithSizeExample) })

  it('returns HTTP 200 and a list of parcels', async () => {
    await provider
      .given('has a parcel with ID', { sheetId: 'S38232', parcelId: '1234' })
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

        expect(response.parcels[0]).toEqual(parcelWithSizeExample)
      })
  })
})

describe('parcelsWithActionsAndSize', () => {
  const parcelWithActionsAndSizeExample = {
    parcelId: 'S38234',
    sheetId: '1235',
    size: { value: 23.3424, unit: 'ha' },
    actions: [
      {
        code: 'CMOR1',
        availableArea: { value: 10.5, unit: 'ha' },
        description: 'Assess moorland and produce a written record'
      },
      {
        code: 'UPL1',
        availableArea: { value: 20.75, unit: 'ha' },
        description: 'Moderate livestock grazing on moorland'
      },
      {
        code: 'UPL2',
        availableArea: { value: 15.25, unit: 'ha' },
        description: 'Moderate livestock grazing on moorland'
      }
    ]
  }
  const EXPECTED_BODY = MatchersV3.like({ parcels: MatchersV3.eachLike(parcelWithActionsAndSizeExample) })

  it('returns HTTP 200 and a list of parcels with actions and size', async () => {
    await provider
      .given('has a parcel with ID', { sheetId: 'S38234', parcelId: '1235' })
      .uponReceiving('a request for specific parcels & the "actions" and "size" fields requested')
      .withRequest({
        method: 'POST',
        path: '/parcels',
        headers: { 'Content-Type': 'application/json' },
        body: { parcelIds: ['S38234-1235'], fields: ['actions', 'size'] }
      })
      .willRespondWith({ status: 200, headers: { 'Content-Type': 'application/json' }, body: EXPECTED_BODY })
      .executeTest(async (mockserver) => {
        const response = await parcelsWithActionsAndSize(['S38234-1235'], mockserver.url)

        expect(response.parcels[0]).toEqual(parcelWithActionsAndSizeExample)
      })
  })
})
