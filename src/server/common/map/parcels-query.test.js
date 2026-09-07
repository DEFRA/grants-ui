import { describe, expect, it } from 'vitest'
import { parcelsQuery } from './parcels-query.js'

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
