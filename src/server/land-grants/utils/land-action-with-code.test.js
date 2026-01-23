import { landActionWithCode } from './land-action-with-code.js'

describe('landActionWithCode', () => {
  it('should format land action with code', () => {
    const result = landActionWithCode('My secret code is', '07123456789')
    expect(result).toBe('My secret code is: 07123456789')
  })

  it('should raise an error if no code is provided', () => {
    expect(() => landActionWithCode('My secret code is')).toThrow('Missing land action code for "My secret code is"')
  })

  it('should raise an error if no description is provided', () => {
    expect(() => landActionWithCode(null, 'CMOR1')).toThrow('Missing land action description for "CMOR1"')
  })
})
