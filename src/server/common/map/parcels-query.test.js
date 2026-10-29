import { describe, expect, it } from 'vitest'
import { parcelsQuery, parcelSearchQuery, parcelBboxParams } from './parcels-query.js'

describe('parcelsQuery', () => {
  it.each([
    ['defaults an omitted list', {}, []],
    ['coerces one action to a list', { enabledLandActions: 'CLIG3' }, ['CLIG3']],
    ['keeps multiple actions as a list', { enabledLandActions: ['CLIG3', 'CSAM3'] }, ['CLIG3', 'CSAM3']]
  ])('%s', (_name, query, expected) => {
    const { value, error } = parcelsQuery.query.validate(query)

    expect(error).toBeUndefined()
    expect(value.enabledLandActions).toEqual(expected)
  })

  it('rejects an empty action code', () => {
    const { error } = parcelsQuery.query.validate({ enabledLandActions: '' })

    expect(error).toBeDefined()
  })
})

describe('parcelSearchQuery', () => {
  it.each([
    ['a plain reference', 'SD7946 0155'],
    ['a hyphenated reference', 'sd7946-0155'],
    ['the plugin-sanitised characters', 'SD79, 46.'],
    ['a long run of typed junk', 'ABC123812371287312832131312312313123123']
  ])('accepts %s', (_name, q) => {
    const { error } = parcelSearchQuery.query.validate({ q })

    expect(error).toBeUndefined()
  })

  it('truncates a query over the length limit rather than rejecting it', () => {
    const { value, error } = parcelSearchQuery.query.validate({ q: 'S'.repeat(101) })

    expect(error).toBeUndefined()
    expect(value.q).toHaveLength(100)
  })

  it('trims the query', () => {
    const { value } = parcelSearchQuery.query.validate({ q: '  SD79  ' })

    expect(value.q).toBe('SD79')
  })

  it.each([
    ['a missing query', {}],
    ['a blank query', { q: '   ' }],
    ['markup', { q: '<b>SD</b>' }]
  ])('rejects %s', (_name, query) => {
    const { error } = parcelSearchQuery.query.validate(query)

    expect(error).toBeDefined()
  })
})

describe('parcelBboxParams', () => {
  it('accepts a compound parcel id', () => {
    expect(parcelBboxParams.params.validate({ parcelId: 'SD7946-0155' }).error).toBeUndefined()
  })

  it.each(['SD7946', 'SD7946 0155', '../etc'])('rejects %s', (parcelId) => {
    expect(parcelBboxParams.params.validate({ parcelId }).error).toBeDefined()
  })
})
