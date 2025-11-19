import { formatAreaUnit } from './format-area-unit'

describe('formatAreaUnit', () => {
  it('should returen the abbreviateion if it cannot be found in the lookup', () => {
    expect(formatAreaUnit('cm')).toEqual('cm')
  })

  it('should return the full unit name if it is found in the lookup', () => {
    expect(formatAreaUnit('ha')).toEqual('hectares')
  })
})
