import { buildParcelList } from './parcel-list.view-model.js'

describe('buildParcelList', () => {
  const parcel = (sheetId, parcelId, value = 1.5, actions = []) => ({ sheetId, parcelId, area: { value }, actions })

  it('sorts parcel references numerically, without changing the API array', () => {
    const parcels = [parcel('SO3757', '3187'), parcel('SO3757', '3184'), parcel('SO3758', '0001')]
    expect(buildParcelList(parcels, {}).parcels.map((p) => p.reference)).toEqual([
      'SO3757 3184',
      'SO3757 3187',
      'SO3758 0001'
    ])
    expect(parcels[0].parcelId).toBe('3187')
  })

  it('marks added parcels without calculating action counts or requirements', () => {
    const actions = [
      { code: 'A', availability: { value: 1 }, sssiConsentRequired: true },
      { code: 'B', availability: { value: 0 } },
      { code: 'OTHER', availability: { value: 1 }, heferRequired: true }
    ]
    const {
      parcels: [result]
    } = buildParcelList([parcel('SO3757', '3184', 38.7654, actions)], {
      landParcels: { 'SO3757-3184': { actionsObj: { A: { value: 1 } } } }
    })
    expect(result).toMatchObject({
      reference: 'SO3757 3184',
      area: '38.7654 ha',
      actionCount: undefined,
      added: true
    })
    expect(result).not.toHaveProperty('notice')
  })

  it('distinguishes missing area from zero and does not tag parcels without saved actions', () => {
    const { parcels: results } = buildParcelList([parcel('SO3757', '3184', null), parcel('SO3757', '3185', 0)], {
      selectedParcelId: 'SO3757-3184',
      landParcels: { 'SO3757-3184': { actionsObj: {} } }
    })
    expect(results.map((p) => [p.area, p.added])).toEqual([
      ['Not available', false],
      ['0.0000 ha', false]
    ])
  })

  it('totals the known areas to the same precision as each parcel', () => {
    expect(buildParcelList([parcel('SO3757', '3184', 1.25), parcel('SO3757', '3185', null)], {}).totalArea).toBe(
      '1.2500'
    )
    expect(buildParcelList([], {})).toEqual({ parcels: [], totalArea: '0.0000' })
  })
})
