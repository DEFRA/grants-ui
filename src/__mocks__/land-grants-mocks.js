/**
 * Shared fixtures for the land-grants controller tests. The two-parcel response
 * is what fetchParcels() resolves to; tests needing a single parcel take the
 * first entry rather than redeclaring it.
 */
export const mockParcelsResponse = [
  {
    parcelId: '0155',
    sheetId: 'SD7946',
    area: { unit: 'ha', value: 4.0383 }
  },
  {
    parcelId: '4509',
    sheetId: 'SD7846',
    area: { unit: 'sqm', value: 0.0633 }
  }
]

export const mockUserContext = { defraIdToken: 'defra-id-access-token', sbi: '106284736' }
