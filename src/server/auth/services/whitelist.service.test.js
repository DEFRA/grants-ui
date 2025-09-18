import { vi } from 'vitest'
import { WhitelistService, WhitelistServiceFactory, whitelistService } from './whitelist.service.js'
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
  BASIC: '12345,67890,11111',
  WITH_SPACES: '  12345,   67890,  11111  ',
  MULTIPLE_SPACES: '12345,  67890,   11111',
  SINGLE: '12345',
  NUMERIC: '12345,67890',
  CRN_VALUES: '1101009926,1101010029',
  SBI_VALUES: '105123456,105654321'
}

const TEST_WHITELIST_ARRAYS = {
  BASIC: ['12345', '67890', '11111'],
  CRN_VALUES: ['1101009926', '1101010029'],
  SBI_VALUES: ['105123456', '105654321'],
  EMPTY: []
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

describe('WhitelistServiceFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    WhitelistServiceFactory.clearCache()
    delete process.env[TEST_ENV_VARS.CRN_WHITELIST]
    delete process.env[TEST_ENV_VARS.SBI_WHITELIST]
  })

  afterEach(() => {
    delete process.env[TEST_ENV_VARS.CRN_WHITELIST]
    delete process.env[TEST_ENV_VARS.SBI_WHITELIST]
  })

  describe('getService', () => {
    it('should create service with empty whitelists when no env vars configured', () => {
      const grantDefinition = { metadata: {} }
      const service = WhitelistServiceFactory.getService(grantDefinition)

      expect(service.crnWhitelist).toEqual([])
      expect(service.sbiWhitelist).toEqual([])
    })

    it('should create service with parsed whitelists from env vars', () => {
      process.env[TEST_ENV_VARS.CRN_WHITELIST] = TEST_WHITELIST_VALUES.CRN_VALUES
      process.env[TEST_ENV_VARS.SBI_WHITELIST] = TEST_WHITELIST_VALUES.SBI_VALUES

      const grantDefinition = {
        metadata: {
          whitelistCrnEnvVar: TEST_ENV_VARS.CRN_WHITELIST,
          whitelistSbiEnvVar: TEST_ENV_VARS.SBI_WHITELIST
        }
      }

      const service = WhitelistServiceFactory.getService(grantDefinition)

      expect(service.crnWhitelist).toEqual(TEST_WHITELIST_ARRAYS.CRN_VALUES)
      expect(service.sbiWhitelist).toEqual(TEST_WHITELIST_ARRAYS.SBI_VALUES)
    })

    it('should cache and reuse service instances', () => {
      const grantDefinition = { metadata: {} }
      const service1 = WhitelistServiceFactory.getService(grantDefinition)
      const service2 = WhitelistServiceFactory.getService(grantDefinition)

      expect(service1).toBe(service2)
    })

    it('should handle whitespace and empty values in env vars', () => {
      process.env[TEST_ENV_VARS.CRN_WHITELIST] = TEST_WHITELIST_VALUES.WITH_SPACES

      const grantDefinition = {
        metadata: {
          whitelistCrnEnvVar: TEST_ENV_VARS.CRN_WHITELIST
        }
      }

      const service = WhitelistServiceFactory.getService(grantDefinition)

      expect(service.crnWhitelist).toEqual(TEST_WHITELIST_ARRAYS.BASIC)
    })
  })

  describe('_parseWhitelist', () => {
    it.each([
      [undefined, [], 'undefined input'],
      ['', [], 'empty string'],
      ['   ', [], 'whitespace only']
    ])('should return empty array for %s', (input, expected, description) => {
      expect(WhitelistServiceFactory._parseWhitelist(input)).toEqual(expected)
    })

    it('should parse comma-separated values', () => {
      expect(WhitelistServiceFactory._parseWhitelist('a,b,c')).toEqual(['a', 'b', 'c'])
    })

    it('should handle spaces around commas and trim values', () => {
      expect(WhitelistServiceFactory._parseWhitelist('  a,   b,  c  ')).toEqual(['a', 'b', 'c'])
    })
  })
})

describe('WhitelistService', () => {
  let service

  beforeEach(() => {
    service = new WhitelistService()
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with empty arrays by default', () => {
      const defaultService = new WhitelistService()
      expect(defaultService.crnWhitelist).toEqual([])
      expect(defaultService.sbiWhitelist).toEqual([])
    })

    it('should initialize with provided whitelist arrays', () => {
      const serviceWithWhitelists = new WhitelistService(
        TEST_WHITELIST_ARRAYS.CRN_VALUES,
        TEST_WHITELIST_ARRAYS.SBI_VALUES
      )
      expect(serviceWithWhitelists.crnWhitelist).toEqual(TEST_WHITELIST_ARRAYS.CRN_VALUES)
      expect(serviceWithWhitelists.sbiWhitelist).toEqual(TEST_WHITELIST_ARRAYS.SBI_VALUES)
    })
  })

  describe('isWhitelisted', () => {
    it.each([
      [undefined, 'undefined'],
      [null, 'null'],
      ['', 'empty string'],
      [undefined, 'no envVarName provided']
    ])('should return true when envVarName is %s (%s)', (envVar) => {
      expect(service.isWhitelisted(TEST_VALUES.CONTACT_ID, envVar)).toBe(true)
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

    it.each([
      ['12345', true, 'value is in whitelist'],
      ['67890', true, 'value is in whitelist'],
      ['11111', true, 'value is in whitelist'],
      ['99999', false, 'value is not in whitelist'],
      ['1234', false, 'value is not in whitelist']
    ])('should return %s when %s (%s)', (value, expected, description) => {
      process.env[TEST_ENV_VARS.WHITELIST] = TEST_WHITELIST_VALUES.BASIC
      expect(service.isWhitelisted(value, TEST_ENV_VARS.WHITELIST)).toBe(expected)
    })

    it.each([
      [TEST_VALUES.NUMERIC_CRN, true, 'numeric CRN in whitelist'],
      [TEST_VALUES.NUMERIC_SBI, true, 'numeric SBI in whitelist'],
      [99999, false, 'numeric value not in whitelist']
    ])('should return %s when %s', (value, expected, description) => {
      process.env[TEST_ENV_VARS.WHITELIST] = TEST_WHITELIST_VALUES.NUMERIC
      expect(service.isWhitelisted(value, TEST_ENV_VARS.WHITELIST)).toBe(expected)
    })

    it('should handle single value in whitelist', () => {
      process.env[TEST_ENV_VARS.WHITELIST] = TEST_WHITELIST_VALUES.SINGLE
      expect(service.isWhitelisted('12345', TEST_ENV_VARS.WHITELIST)).toBe(true)
      expect(service.isWhitelisted('67890', TEST_ENV_VARS.WHITELIST)).toBe(false)
    })
  })

  describe('isCrnWhitelisted', () => {
    it.each([
      [[], TEST_VALUES.CRN_1, true, 'CRN whitelist is empty'],
      [TEST_WHITELIST_ARRAYS.CRN_VALUES, TEST_VALUES.CRN_1, true, 'CRN is in whitelist'],
      [TEST_WHITELIST_ARRAYS.CRN_VALUES, TEST_VALUES.CRN_2, true, 'CRN is in whitelist'],
      [TEST_WHITELIST_ARRAYS.CRN_VALUES, TEST_VALUES.CRN_INVALID, false, 'CRN is not in whitelist']
    ])('should return %s when %s', (crnWhitelist, crn, expected, description) => {
      const serviceWithWhitelist = new WhitelistService(crnWhitelist, [])
      expect(serviceWithWhitelist.isCrnWhitelisted(crn)).toBe(expected)
    })

    it('should handle numeric CRN values by converting to string', () => {
      const serviceWithCrnWhitelist = new WhitelistService(['12345'], [])
      expect(serviceWithCrnWhitelist.isCrnWhitelisted(12345)).toBe(true)
    })
  })

  describe('isSbiWhitelisted', () => {
    it.each([
      [[], TEST_VALUES.SBI_1, true, 'SBI whitelist is empty'],
      [TEST_WHITELIST_ARRAYS.SBI_VALUES, TEST_VALUES.SBI_1, true, 'SBI is in whitelist'],
      [TEST_WHITELIST_ARRAYS.SBI_VALUES, TEST_VALUES.SBI_2, true, 'SBI is in whitelist'],
      [TEST_WHITELIST_ARRAYS.SBI_VALUES, TEST_VALUES.SBI_INVALID, false, 'SBI is not in whitelist']
    ])('should return %s when %s', (sbiWhitelist, sbi, expected, description) => {
      const serviceWithWhitelist = new WhitelistService([], sbiWhitelist)
      expect(serviceWithWhitelist.isSbiWhitelisted(sbi)).toBe(expected)
    })

    it('should handle numeric SBI values by converting to string', () => {
      const serviceWithSbiWhitelist = new WhitelistService([], ['67890'])
      expect(serviceWithSbiWhitelist.isSbiWhitelisted(67890)).toBe(true)
    })
  })

  describe('validateGrantAccess', () => {
    it('should return all true when no validation configured (empty whitelists)', () => {
      const serviceWithNoValidation = new WhitelistService([], [])
      const result = serviceWithNoValidation.validateGrantAccess(TEST_VALUES.CRN_1, TEST_VALUES.SBI_1)

      expect(result).toEqual({
        crnPassesValidation: true,
        sbiPassesValidation: true,
        hasCrnValidation: false,
        hasSbiValidation: false,
        overallAccess: true
      })
    })

    it('should validate CRN when CRN whitelist is configured', () => {
      const serviceWithCrnValidation = new WhitelistService(TEST_WHITELIST_ARRAYS.CRN_VALUES, [])

      const validResult = serviceWithCrnValidation.validateGrantAccess(TEST_VALUES.CRN_1, TEST_VALUES.SBI_1)
      expect(validResult).toEqual({
        crnPassesValidation: true,
        sbiPassesValidation: true,
        hasCrnValidation: true,
        hasSbiValidation: false,
        overallAccess: true
      })

      const invalidResult = serviceWithCrnValidation.validateGrantAccess(TEST_VALUES.CRN_INVALID, TEST_VALUES.SBI_1)
      expect(invalidResult).toEqual({
        crnPassesValidation: false,
        sbiPassesValidation: true,
        hasCrnValidation: true,
        hasSbiValidation: false,
        overallAccess: false
      })
    })

    it('should validate SBI when SBI whitelist is configured', () => {
      const serviceWithSbiValidation = new WhitelistService([], TEST_WHITELIST_ARRAYS.SBI_VALUES)

      const validResult = serviceWithSbiValidation.validateGrantAccess(TEST_VALUES.CRN_1, TEST_VALUES.SBI_1)
      expect(validResult).toEqual({
        crnPassesValidation: true,
        sbiPassesValidation: true,
        hasCrnValidation: false,
        hasSbiValidation: true,
        overallAccess: true
      })

      const invalidResult = serviceWithSbiValidation.validateGrantAccess(TEST_VALUES.CRN_1, TEST_VALUES.SBI_INVALID)
      expect(invalidResult).toEqual({
        crnPassesValidation: true,
        sbiPassesValidation: false,
        hasCrnValidation: false,
        hasSbiValidation: true,
        overallAccess: false
      })
    })

    it.each([
      [
        'both valid',
        TEST_VALUES.CRN_1,
        TEST_VALUES.SBI_1,
        { crnPassesValidation: true, sbiPassesValidation: true, overallAccess: true }
      ],
      [
        'CRN valid, SBI invalid',
        TEST_VALUES.CRN_1,
        TEST_VALUES.SBI_INVALID,
        { crnPassesValidation: true, sbiPassesValidation: false, overallAccess: false }
      ],
      [
        'CRN invalid, SBI valid',
        TEST_VALUES.CRN_INVALID,
        TEST_VALUES.SBI_1,
        { crnPassesValidation: false, sbiPassesValidation: true, overallAccess: false }
      ],
      [
        'both invalid',
        TEST_VALUES.CRN_INVALID,
        TEST_VALUES.SBI_INVALID,
        { crnPassesValidation: false, sbiPassesValidation: false, overallAccess: false }
      ]
    ])('should validate both CRN and SBI when %s', (description, crn, sbi, expectedPartial) => {
      const serviceWithBothValidation = new WhitelistService(
        TEST_WHITELIST_ARRAYS.CRN_VALUES,
        TEST_WHITELIST_ARRAYS.SBI_VALUES
      )
      const result = serviceWithBothValidation.validateGrantAccess(crn, sbi)

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
      const serviceWithBothValidation = new WhitelistService(
        TEST_WHITELIST_ARRAYS.CRN_VALUES,
        TEST_WHITELIST_ARRAYS.SBI_VALUES
      )
      const result = serviceWithBothValidation.validateGrantAccess(crn, sbi)

      expect(result).toEqual({
        crnPassesValidation: false,
        sbiPassesValidation: false,
        hasCrnValidation: true,
        hasSbiValidation: true,
        overallAccess: false
      })
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
      const validationType = 'Both CRN and SBI whitelist validation passed'

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
      expect(log).toHaveBeenCalledTimes(0)
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

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(whitelistService).toBeInstanceOf(WhitelistService)
    })

    it('should export the WhitelistService class', () => {
      expect(WhitelistService).toBeDefined()
      expect(typeof WhitelistService).toBe('function')
    })

    it('should export the WhitelistServiceFactory class', () => {
      expect(WhitelistServiceFactory).toBeDefined()
      expect(typeof WhitelistServiceFactory).toBe('function')
    })
  })
})
