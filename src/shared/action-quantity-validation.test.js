import {
  QUANTITY_ERRORS,
  getQuantityError,
  isValidQuantity,
  normaliseQuantityInput
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
  const AVAILABLE = 11.22

  it.each([
    ['20', QUANTITY_ERRORS.MORE_THAN_AVAILABLE(AVAILABLE)],
    ['0', QUANTITY_ERRORS.NOT_GREATER_THAN_ZERO],
    ['-11', QUANTITY_ERRORS.NEGATIVE],
    ['11.22001', QUANTITY_ERRORS.TOO_MANY_DECIMAL_PLACES],
    ['as', QUANTITY_ERRORS.NOT_A_NUMBER]
  ])('reports %j as %j', (raw, expected) => {
    expect(getQuantityError(raw, AVAILABLE)).toBe(expected)
  })

  it.each([['11.2200'], ['11.22'], ['10'], ['.5'], ['0.5'], ['0.0001']])('accepts %j', (raw) => {
    expect(getQuantityError(raw, AVAILABLE)).toBeNull()
  })

  it.each([['1e5'], ['14.211.442121'], ['0x10'], ['Infinity'], ['5 ha'], ['']])('rejects %j as not a number', (raw) => {
    expect(getQuantityError(raw, AVAILABLE)).toBe(QUANTITY_ERRORS.NOT_A_NUMBER)
  })

  it('checks the negative rule before the precision rule', () => {
    expect(getQuantityError('-11.22001', AVAILABLE)).toBe(QUANTITY_ERRORS.NEGATIVE)
  })

  it('checks the precision rule before the available-area rule', () => {
    expect(getQuantityError('99.99999', AVAILABLE)).toBe(QUANTITY_ERRORS.TOO_MANY_DECIMAL_PLACES)
  })

  it.each([[undefined], [null]])('accepts any positive quantity when max is %j', (max) => {
    expect(getQuantityError('99999', max)).toBeNull()
  })

  it('rejects an over-available quantity when the ceiling is 0', () => {
    expect(getQuantityError('0.0001', 0)).toBe(QUANTITY_ERRORS.MORE_THAN_AVAILABLE(0))
  })

  it('gives negative input a different message to zero', () => {
    expect(getQuantityError('0', AVAILABLE)).not.toBe(getQuantityError('-1', AVAILABLE))
  })

  it.each(['sqm', 'm2', 'count'])('requires whole numbers for %s without limiting hectares', (unit) => {
    expect(getQuantityError('4', undefined, unit)).toBeNull()
    expect(getQuantityError('4.5', undefined, unit)).toBe(QUANTITY_ERRORS.NOT_WHOLE_NUMBER)
    expect(isValidQuantity('4.5', undefined, unit)).toBe(false)
    expect(getQuantityError('4.5', undefined, 'ha')).toBeNull()
  })

  it.each([
    ['0', 'Value must be greater than 0'],
    ['-11', 'Value must be greater than 0'],
    ['11.22001', QUANTITY_ERRORS.NOT_WHOLE_NUMBER],
    ['as', 'Must be numbers']
  ])('rejects invalid square-metre quantity %j with %s', (raw, expected) => {
    expect(getQuantityError(raw, undefined, 'sqm')).toBe(expected)
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
