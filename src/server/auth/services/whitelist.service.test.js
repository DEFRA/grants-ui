import { vi } from 'vitest'
import { WhitelistService, whitelistService } from './whitelist.service.js'
import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'

vi.mock('~/src/server/common/helpers/logging/log.js')

const TEST_VALUES = {
  CRN_1: '1101009926',
  CRN_2: '1101010029',
  CRN_INVALID: '9999999999',
  SBI_1: '105123456',
  SBI_2: '105654321',
  SBI_INVALID: '999999999',
  CONTACT_ID: '12345',
  NUMERIC_CRN: 12345,
  NUMERIC_SBI: 67890,
  TEST_PATH: '/test-path'
}

const TEST_ENV_VARS = {
  WHITELIST: 'TEST_WHITELIST',
  CRN_WHITELIST: 'CRN_WHITELIST',
  SBI_WHITELIST: 'SBI_WHITELIST',
  NONEXISTENT: 'NONEXISTENT_VAR'
}

const TEST_WHITELIST_VALUES = {
  BASIC: '12345 67890 11111',
  WITH_SPACES: '  12345   67890  11111  ',
  MULTIPLE_SPACES: '12345  67890   11111',
  SINGLE: '12345',
  NUMERIC: '12345 67890',
  CRN_VALUES: '1101009926 1101010029',
  SBI_VALUES: '105123456 105654321'
}

const BASE_VALIDATION_PARAMS = {
  crn: TEST_VALUES.CRN_1,
  sbi: TEST_VALUES.SBI_1,
  path: TEST_VALUES.TEST_PATH
}

const createValidationParams = (overrides = {}) => ({
  ...BASE_VALIDATION_PARAMS,
  ...overrides
})

describe('WhitelistService', () => {
  let service

  beforeEach(() => {
    service = new WhitelistService()
    vi.clearAllMocks()
    delete process.env[TEST_ENV_VARS.WHITELIST]
  })

  afterEach(() => {
    delete process.env[TEST_ENV_VARS.WHITELIST]
  })

  describe('isWhitelisted', () => {
    it.each([
      [undefined, 'undefined'],
      [null, 'null'],
      ['', 'empty string']
    ])('should return true when envVarName is %s (%s)', (envVar) => {
      expect(service.isWhitelisted(TEST_VALUES.CONTACT_ID, envVar)).toBe(true)
    })

    it('should return true when no envVarName is provided', () => {
      expect(service.isWhitelisted(TEST_VALUES.CONTACT_ID)).toBe(true)
    })

    it.each([
      [TEST_ENV_VARS.NONEXISTENT, 'not set'],
      ['', 'empty'],
      ['   ', 'whitespace only']
    ])('should return false when environment variable is %s', (envValue, description) => {
      if (description !== 'not set') {
        process.env[TEST_ENV_VARS.WHITELIST] = envValue
      }
      expect(
        service.isWhitelisted(TEST_VALUES.CONTACT_ID, description === 'not set' ? envValue : TEST_ENV_VARS.WHITELIST)
      ).toBe(false)
      if (description !== 'not set') {
        delete process.env[TEST_ENV_VARS.WHITELIST]
      }
    })

    it('should return true when value is in whitelist', () => {
      process.env[TEST_ENV_VARS.WHITELIST] = TEST_WHITELIST_VALUES.BASIC
      expect(service.isWhitelisted('12345', TEST_ENV_VARS.WHITELIST)).toBe(true)
      expect(service.isWhitelisted('67890', TEST_ENV_VARS.WHITELIST)).toBe(true)
      expect(service.isWhitelisted('11111', TEST_ENV_VARS.WHITELIST)).toBe(true)
    })

    it('should return false when value is not in whitelist', () => {
      process.env[TEST_ENV_VARS.WHITELIST] = TEST_WHITELIST_VALUES.BASIC
      expect(service.isWhitelisted('99999', TEST_ENV_VARS.WHITELIST)).toBe(false)
      expect(service.isWhitelisted('1234', TEST_ENV_VARS.WHITELIST)).toBe(false)
    })

    it('should handle numeric values by converting to string', () => {
      process.env[TEST_ENV_VARS.WHITELIST] = TEST_WHITELIST_VALUES.NUMERIC
      expect(service.isWhitelisted(TEST_VALUES.NUMERIC_CRN, TEST_ENV_VARS.WHITELIST)).toBe(true)
      expect(service.isWhitelisted(TEST_VALUES.NUMERIC_SBI, TEST_ENV_VARS.WHITELIST)).toBe(true)
      expect(service.isWhitelisted(99999, TEST_ENV_VARS.WHITELIST)).toBe(false)
    })

    it('should handle single value in whitelist', () => {
      process.env[TEST_ENV_VARS.WHITELIST] = TEST_WHITELIST_VALUES.SINGLE
      expect(service.isWhitelisted('12345', TEST_ENV_VARS.WHITELIST)).toBe(true)
      expect(service.isWhitelisted('67890', TEST_ENV_VARS.WHITELIST)).toBe(false)
    })
  })

  describe('isCrnWhitelisted', () => {
    it('should return correct result for CRN validation', () => {
      process.env[TEST_ENV_VARS.CRN_WHITELIST] = TEST_WHITELIST_VALUES.CRN_VALUES

      expect(service.isCrnWhitelisted(TEST_VALUES.CRN_1, TEST_ENV_VARS.CRN_WHITELIST)).toBe(true)
      expect(service.isCrnWhitelisted(TEST_VALUES.CRN_INVALID, TEST_ENV_VARS.CRN_WHITELIST)).toBe(false)
    })
  })

  describe('isSbiWhitelisted', () => {
    it('should return correct result for SBI validation', () => {
      process.env[TEST_ENV_VARS.SBI_WHITELIST] = TEST_WHITELIST_VALUES.SBI_VALUES

      expect(service.isSbiWhitelisted(TEST_VALUES.SBI_1, TEST_ENV_VARS.SBI_WHITELIST)).toBe(true)
      expect(service.isSbiWhitelisted(TEST_VALUES.SBI_INVALID, TEST_ENV_VARS.SBI_WHITELIST)).toBe(false)
    })
  })

  describe('_logWhitelistEvent', () => {
    it('should log with correct parameters without validationType', () => {
      const logCode = LogCodes.AUTH.WHITELIST_ACCESS_GRANTED

      service._logWhitelistEvent(logCode, TEST_VALUES.CRN_1, TEST_VALUES.SBI_1, TEST_VALUES.TEST_PATH)

      expect(log).toHaveBeenCalledWith(logCode, {
        userId: TEST_VALUES.CRN_1,
        path: TEST_VALUES.TEST_PATH,
        sbi: TEST_VALUES.SBI_1
      })
    })

    it('should log with correct parameters including validationType', () => {
      const logCode = LogCodes.AUTH.WHITELIST_ACCESS_GRANTED
      const validationType = 'CRN validation passed'

      service._logWhitelistEvent(logCode, TEST_VALUES.CRN_1, TEST_VALUES.SBI_1, TEST_VALUES.TEST_PATH, validationType)

      expect(log).toHaveBeenCalledWith(logCode, {
        userId: TEST_VALUES.CRN_1,
        path: TEST_VALUES.TEST_PATH,
        sbi: TEST_VALUES.SBI_1,
        validationType
      })
    })
  })

  describe('logWhitelistValidation', () => {
    it('should log access granted when both CRN and SBI validation pass (scenario 15)', () => {
      const params = createValidationParams({
        crnPassesValidation: true,
        sbiPassesValidation: true,
        hasCrnValidation: true,
        hasSbiValidation: true
      })

      service.logWhitelistValidation(params)

      expect(log).toHaveBeenCalledWith(LogCodes.AUTH.WHITELIST_ACCESS_GRANTED, {
        userId: TEST_VALUES.CRN_1,
        path: TEST_VALUES.TEST_PATH,
        sbi: TEST_VALUES.SBI_1,
        validationType: 'Both CRN and SBI whitelist validation passed'
      })
    })

    it('should log access denied when both validations fail (scenario 12)', () => {
      const params = createValidationParams({
        crnPassesValidation: false,
        sbiPassesValidation: false,
        hasCrnValidation: true,
        hasSbiValidation: true
      })

      service.logWhitelistValidation(params)

      expect(log).toHaveBeenCalledWith(LogCodes.AUTH.WHITELIST_ACCESS_DENIED_BOTH, {
        userId: TEST_VALUES.CRN_1,
        path: TEST_VALUES.TEST_PATH,
        sbi: TEST_VALUES.SBI_1
      })
    })

    it('should log access denied when CRN passes but SBI fails (scenario 14)', () => {
      const params = createValidationParams({
        crnPassesValidation: true,
        sbiPassesValidation: false,
        hasCrnValidation: true,
        hasSbiValidation: true
      })

      service.logWhitelistValidation(params)

      expect(log).toHaveBeenCalledWith(LogCodes.AUTH.WHITELIST_ACCESS_DENIED_CRN_PASSED, {
        userId: TEST_VALUES.CRN_1,
        path: TEST_VALUES.TEST_PATH,
        sbi: TEST_VALUES.SBI_1
      })
    })

    it('should log access denied when SBI passes but CRN fails (scenario 13)', () => {
      const params = createValidationParams({
        crnPassesValidation: false,
        sbiPassesValidation: true,
        hasCrnValidation: true,
        hasSbiValidation: true
      })

      service.logWhitelistValidation(params)

      expect(log).toHaveBeenCalledWith(LogCodes.AUTH.WHITELIST_ACCESS_DENIED_SBI_PASSED, {
        userId: TEST_VALUES.CRN_1,
        path: TEST_VALUES.TEST_PATH,
        sbi: TEST_VALUES.SBI_1
      })
    })

    it.each([
      [
        'only CRN validation is configured and passes (scenario 10)',
        {
          crnPassesValidation: true,
          sbiPassesValidation: false,
          hasCrnValidation: true,
          hasSbiValidation: false
        },
        {
          userId: TEST_VALUES.CRN_1,
          path: TEST_VALUES.TEST_PATH,
          sbi: 'N/A',
          validationType: 'CRN whitelist validation passed (no SBI validation configured)'
        }
      ],
      [
        'only SBI validation is configured and passes (scenario 5)',
        {
          crnPassesValidation: false,
          sbiPassesValidation: true,
          hasCrnValidation: false,
          hasSbiValidation: true
        },
        {
          userId: 'N/A',
          path: TEST_VALUES.TEST_PATH,
          sbi: TEST_VALUES.SBI_1,
          validationType: 'SBI whitelist validation passed (no CRN validation configured)'
        }
      ]
    ])('should log access granted when %s', (description, validationOverrides, expectedLogParams) => {
      const params = createValidationParams(validationOverrides)

      service.logWhitelistValidation(params)

      expect(log).toHaveBeenCalledWith(LogCodes.AUTH.WHITELIST_ACCESS_GRANTED, expectedLogParams)
    })

    it('should not log anything for unhandled scenarios', () => {
      const params = createValidationParams({
        crnPassesValidation: false,
        sbiPassesValidation: false,
        hasCrnValidation: false,
        hasSbiValidation: false
      })

      service.logWhitelistValidation(params)

      expect(log).not.toHaveBeenCalled()
    })

    it('should calculate correct scenario keys', () => {
      service.logWhitelistValidation(
        createValidationParams({
          hasCrnValidation: true,
          hasSbiValidation: true,
          crnPassesValidation: true,
          sbiPassesValidation: true
        })
      )

      expect(log).toHaveBeenCalledWith(LogCodes.AUTH.WHITELIST_ACCESS_GRANTED, expect.any(Object))
    })
  })

  describe('validateGrantAccess', () => {
    const createGrantDefinition = (crnEnvVar = null, sbiEnvVar = null) => ({
      metadata: {
        ...(crnEnvVar && { whitelistCrnEnvVar: crnEnvVar }),
        ...(sbiEnvVar && { whitelistSbiEnvVar: sbiEnvVar })
      }
    })

    beforeEach(() => {
      process.env[TEST_ENV_VARS.CRN_WHITELIST] = TEST_WHITELIST_VALUES.CRN_VALUES
      process.env[TEST_ENV_VARS.SBI_WHITELIST] = TEST_WHITELIST_VALUES.SBI_VALUES
    })

    afterEach(() => {
      delete process.env[TEST_ENV_VARS.CRN_WHITELIST]
      delete process.env[TEST_ENV_VARS.SBI_WHITELIST]
    })

    it.each([
      [
        'no validation configured (null definition)',
        null,
        TEST_VALUES.CRN_1,
        TEST_VALUES.SBI_1,
        {
          crnPassesValidation: true,
          sbiPassesValidation: true,
          hasCrnValidation: false,
          hasSbiValidation: false,
          overallAccess: true
        }
      ],
      [
        'no validation configured (empty metadata)',
        {},
        TEST_VALUES.CRN_1,
        TEST_VALUES.SBI_1,
        {
          crnPassesValidation: true,
          sbiPassesValidation: true,
          hasCrnValidation: false,
          hasSbiValidation: false,
          overallAccess: true
        }
      ]
    ])('should return all true when %s', (description, definition, crn, sbi, expected) => {
      const result = service.validateGrantAccess(crn, sbi, definition)
      expect(result).toEqual(expected)
    })

    it.each([
      [
        'CRN validation with valid CRN',
        createGrantDefinition(TEST_ENV_VARS.CRN_WHITELIST),
        TEST_VALUES.CRN_1,
        TEST_VALUES.SBI_1,
        {
          crnPassesValidation: true,
          sbiPassesValidation: true,
          hasCrnValidation: true,
          hasSbiValidation: false,
          overallAccess: true
        }
      ],
      [
        'CRN validation with invalid CRN',
        createGrantDefinition(TEST_ENV_VARS.CRN_WHITELIST),
        TEST_VALUES.CRN_INVALID,
        TEST_VALUES.SBI_1,
        {
          crnPassesValidation: false,
          sbiPassesValidation: true,
          hasCrnValidation: true,
          hasSbiValidation: false,
          overallAccess: false
        }
      ],
      [
        'SBI validation with valid SBI',
        createGrantDefinition(null, TEST_ENV_VARS.SBI_WHITELIST),
        TEST_VALUES.CRN_1,
        TEST_VALUES.SBI_1,
        {
          crnPassesValidation: true,
          sbiPassesValidation: true,
          hasCrnValidation: false,
          hasSbiValidation: true,
          overallAccess: true
        }
      ],
      [
        'SBI validation with invalid SBI',
        createGrantDefinition(null, TEST_ENV_VARS.SBI_WHITELIST),
        TEST_VALUES.CRN_1,
        TEST_VALUES.SBI_INVALID,
        {
          crnPassesValidation: true,
          sbiPassesValidation: false,
          hasCrnValidation: false,
          hasSbiValidation: true,
          overallAccess: false
        }
      ]
    ])('should handle %s', (description, definition, crn, sbi, expected) => {
      const result = service.validateGrantAccess(crn, sbi, definition)
      expect(result).toEqual(expected)
    })

    it.each([
      [
        'both valid',
        TEST_VALUES.CRN_1,
        TEST_VALUES.SBI_1,
        { crnPassesValidation: true, sbiPassesValidation: true, overallAccess: true }
      ],
      [
        'invalid CRN, valid SBI',
        TEST_VALUES.CRN_INVALID,
        TEST_VALUES.SBI_1,
        { crnPassesValidation: false, sbiPassesValidation: true, overallAccess: false }
      ],
      [
        'valid CRN, invalid SBI',
        TEST_VALUES.CRN_1,
        TEST_VALUES.SBI_INVALID,
        { crnPassesValidation: true, sbiPassesValidation: false, overallAccess: false }
      ],
      [
        'both invalid',
        TEST_VALUES.CRN_INVALID,
        TEST_VALUES.SBI_INVALID,
        { crnPassesValidation: false, sbiPassesValidation: false, overallAccess: false }
      ]
    ])('should validate both CRN and SBI when %s', (description, crn, sbi, expectedPartial) => {
      const definition = createGrantDefinition(TEST_ENV_VARS.CRN_WHITELIST, TEST_ENV_VARS.SBI_WHITELIST)
      const result = service.validateGrantAccess(crn, sbi, definition)

      expect(result).toEqual({
        ...expectedPartial,
        hasCrnValidation: true,
        hasSbiValidation: true
      })
    })

    it.each([
      ['null', null, null],
      ['undefined', undefined, undefined]
    ])('should handle %s CRN and SBI values', (description, crn, sbi) => {
      const definition = createGrantDefinition(TEST_ENV_VARS.CRN_WHITELIST, TEST_ENV_VARS.SBI_WHITELIST)
      const result = service.validateGrantAccess(crn, sbi, definition)

      expect(result).toEqual({
        crnPassesValidation: false,
        sbiPassesValidation: false,
        hasCrnValidation: true,
        hasSbiValidation: true,
        overallAccess: false
      })
    })
  })

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(whitelistService).toBeInstanceOf(WhitelistService)
    })

    it('should export the WhitelistService class', () => {
      expect(WhitelistService).toBeDefined()
      expect(typeof WhitelistService).toBe('function')
    })
  })
})
