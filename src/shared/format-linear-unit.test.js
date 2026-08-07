import { formatLinearUnit } from './format-linear-unit'

describe('formatLinearUnit', () => {
  it('should return the abbreviation if it cannot be found in the lookup', () => {
    expect(formatLinearUnit('ha')).toEqual('ha')
  })

  it('should return the full unit name if it is found in the lookup', () => {
    expect(formatLinearUnit('m')).toEqual('metres')
    expect(formatLinearUnit('km')).toEqual('kilometres')
  })

  it('should be case-insensitive and trim whitespace', () => {
    expect(formatLinearUnit(' KM ')).toEqual('kilometres')
  })
})
