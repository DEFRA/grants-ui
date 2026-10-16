import { requiresWholeNumber, UNIT_COUNT, UNIT_HECTARES, UNIT_SQUARE_METRES } from './unit-types.js'
import {
  getQuantityError,
  isValidQuantity,
  normaliseQuantityInput,
  QUANTITY_ERRORS
} from './action-quantity-validation.js'

describe('normaliseQuantityInput', () => {
  it.each([
    ['.5', '0.5'],
    ['.0001', '0.0001'],
    ['  .5  ', '0.5'],
    ['-.5', '-0.5'],
    ['0.5', '0.5'],
    ['  11.22  ', '11.22'],
    ['11', '11'],
    ['abc', 'abc'],
    ['', ''],
    [null, ''],
    [undefined, ''],
    [11.22, '11.22']
  ])('normalises %j to %j', (raw, expected) => {
    expect(normaliseQuantityInput(raw)).toBe(expected)
  })
})

describe('getQuantityError', () => {
  const HECTARES = QUANTITY_ERRORS[UNIT_HECTARES]
  const SQUARE_METRES = QUANTITY_ERRORS[UNIT_SQUARE_METRES]
  const PONDS = QUANTITY_ERRORS[UNIT_COUNT]

  it.each([
    [UNIT_HECTARES, 'Enter number of hectares, up to 4 decimal places – for example, 12.3456'],
    [UNIT_SQUARE_METRES, 'Enter number of square metres, rounded down to the nearest whole number – for example, 234'],
    [UNIT_COUNT, 'Enter number of ponds – for example, 2']
  ])('uses the content-designed invalid message for %s', (unit, expected) => {
    expect(getQuantityError('', undefined, unit)).toBe(expected)
  })

  it.each([
    [UNIT_HECTARES, 'Enter a number that is not higher than the available hectares'],
    [UNIT_SQUARE_METRES, 'Enter a number that is not higher than the available square metres']
  ])('uses the content-designed more-than-available message for %s', (unit, expected) => {
    expect(getQuantityError('201', 200, unit)).toBe(expected)
  })

  describe.each([
    [UNIT_SQUARE_METRES, SQUARE_METRES],
    [UNIT_COUNT, PONDS]
  ])('whole-number quantities in %s', (unit, errors) => {
    it.each([
      '0',
      '-11',
      '1.2',
      '11.22001',
      '4.0000000000000001',
      'as',
      '1e2',
      '9007199254740992',
      '99999999999999999999',
      ''
    ])('rejects %j', (raw) => {
      expect(getQuantityError(raw, undefined, unit)).toBe(errors.INVALID)
      expect(isValidQuantity(raw, undefined, unit)).toBe(false)
    })

    it.each(['1', '4', ' 12 ', '99999', '4.00000', '9007199254740991'])(
      'accepts %j without a parcel-area limit',
      (raw) => {
        expect(getQuantityError(raw, undefined, unit)).toBeNull()
        expect(isValidQuantity(raw, undefined, unit)).toBe(true)
      }
    )

    it('checks the whole-number rule before the available-area rule', () => {
      expect(getQuantityError('300.5', 200, unit)).toBe(errors.INVALID)
    })
  })

  const AVAILABLE = 11.22

  it.each(['0', '-11', '11.22001', '-11.22001', 'as', '1e5', '14.211.442121', '0x10', 'Infinity', '5 ha', ''])(
    'rejects hectares quantity %j',
    (raw) => {
      expect(getQuantityError(raw, AVAILABLE, UNIT_HECTARES)).toBe(HECTARES.INVALID)
    }
  )

  it.each([['11.2200'], ['11.22'], ['10'], ['.5'], ['0.5'], ['0.0001']])('accepts %j', (raw) => {
    expect(getQuantityError(raw, AVAILABLE)).toBeNull()
  })

  it('reports a quantity above the available area', () => {
    expect(getQuantityError('20', AVAILABLE)).toBe(HECTARES.MORE_THAN_AVAILABLE)
  })

  it('checks the precision rule before the available-area rule', () => {
    expect(getQuantityError('99.99999', AVAILABLE)).toBe(HECTARES.INVALID)
  })

  it.each([[undefined], [null]])('accepts any positive quantity when max is %j', (max) => {
    expect(getQuantityError('99999', max)).toBeNull()
  })

  it('rejects an over-available quantity when the ceiling is 0', () => {
    expect(getQuantityError('0.0001', 0)).toBe(HECTARES.MORE_THAN_AVAILABLE)
  })

  it('does not require whole numbers for hectares', () => {
    expect(getQuantityError('4.5', undefined, UNIT_HECTARES)).toBeNull()
  })

  it.each([undefined, null, 'm2', ' SQM ', 'SQM'])('treats unit %j as hectares', (unit) => {
    expect(requiresWholeNumber(unit)).toBe(false)
    expect(getQuantityError('11.22001', undefined, unit)).toBe(HECTARES.INVALID)
  })
})

describe('isValidQuantity', () => {
  it.each([
    ['11.22', 11.22, true],
    ['.5', 11.22, true],
    ['20', 11.22, false],
    ['0', 11.22, false],
    ['as', 11.22, false],
    ['', 11.22, false],
    ['   ', 11.22, false],
    [undefined, 11.22, false],
    ['99999', undefined, true]
  ])('reads %j against max %j as %j', (raw, max, expected) => {
    expect(isValidQuantity(raw, max)).toBe(expected)
  })
})
