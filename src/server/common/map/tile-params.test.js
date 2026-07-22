import { osTileParams, parcelTileParams } from './tile-params.js'

describe.each([
  ['osTileParams', osTileParams],
  ['parcelTileParams', parcelTileParams]
])('%s', (_name, schema) => {
  const validate = (params) => schema.params.validate(params).error

  it('accepts an in-range tile coordinate', () => {
    expect(validate({ z: 12, x: 100, y: 200 })).toBeUndefined()
  })

  it('accepts the OS zoom bounds', () => {
    expect(validate({ z: 7, x: 0, y: 0 })).toBeUndefined()
    expect(validate({ z: 20, x: 0, y: 0 })).toBeUndefined()
  })

  it.each([
    ['z below the min zoom', { z: 6, x: 0, y: 0 }],
    ['z above the max zoom', { z: 21, x: 0, y: 0 }],
    ['a scripted out-of-range z', { z: 9999, x: 0, y: 0 }],
    ['a non-integer z', { z: 1.5, x: 0, y: 0 }],
    ['a non-numeric z', { z: 'abc', x: 0, y: 0 }],
    ['a negative x', { z: 12, x: -1, y: 0 }],
    ['a negative y', { z: 12, x: 0, y: -1 }],
    ['x equal to 2^z', { z: 12, x: 2 ** 12, y: 0 }],
    ['y equal to 2^z', { z: 12, x: 0, y: 2 ** 12 }]
  ])('rejects %s', (_desc, params) => {
    expect(validate(params)).toBeDefined()
  })

  it('accepts the largest valid x/y at a given zoom', () => {
    expect(validate({ z: 12, x: 2 ** 12 - 1, y: 2 ** 12 - 1 })).toBeUndefined()
  })
})
