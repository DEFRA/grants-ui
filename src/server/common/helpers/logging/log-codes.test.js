import { LogCodes, validateLogCodes } from './log-codes.js'

describe('LogCodes', () => {
  describe('AUTH log codes', () => {
    it('should have valid SIGN_IN_ATTEMPT log code', () => {
      const logCode = LogCodes.AUTH.SIGN_IN_ATTEMPT
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc({ userId: 'test' })).toBe(
        'User sign-in attempt for user=test'
      )
    })

    it('should have valid SIGN_IN_SUCCESS log code', () => {
      const logCode = LogCodes.AUTH.SIGN_IN_SUCCESS
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ userId: 'test', organisationId: 'org' })
      ).toBe('User sign-in successful for user=test, organisation=org')
    })

    it('should have valid SIGN_IN_FAILURE log code', () => {
      const logCode = LogCodes.AUTH.SIGN_IN_FAILURE
      expect(logCode.level).toBe('error')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ userId: 'test', error: 'Invalid credentials' })
      ).toBe('User sign-in failed for user=test. Error: Invalid credentials')
    })

    it('should have valid SIGN_OUT log code', () => {
      const logCode = LogCodes.AUTH.SIGN_OUT
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ userId: 'test', sessionId: 'session123' })
      ).toBe('User sign-out for user=test, session=session123')
    })

    it('should have valid TOKEN_VERIFICATION_SUCCESS log code', () => {
      const logCode = LogCodes.AUTH.TOKEN_VERIFICATION_SUCCESS
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ userId: 'test', organisationId: 'org' })
      ).toBe('Token verification successful for user=test, organisation=org')
    })

    it('should have valid TOKEN_VERIFICATION_FAILURE log code', () => {
      const logCode = LogCodes.AUTH.TOKEN_VERIFICATION_FAILURE
      expect(logCode.level).toBe('error')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ userId: 'test', error: 'Invalid token' })
      ).toBe('Token verification failed for user=test. Error: Invalid token')
    })

    it('should have valid SESSION_EXPIRED log code', () => {
      const logCode = LogCodes.AUTH.SESSION_EXPIRED
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ userId: 'test', sessionId: 'session123' })
      ).toBe('Session expired for user=test, session=session123')
    })

    it('should have valid UNAUTHORIZED_ACCESS log code', () => {
      const logCode = LogCodes.AUTH.UNAUTHORIZED_ACCESS
      expect(logCode.level).toBe('error')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc({ path: '/admin', userId: 'test' })).toBe(
        'Unauthorized access attempt to path=/admin from user=test'
      )
    })
  })

  describe('FORMS log codes', () => {
    it('should have valid FORM_LOAD log code', () => {
      const logCode = LogCodes.FORMS.FORM_LOAD
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ formName: 'declaration', userId: 'test' })
      ).toBe('Form loaded: declaration for user=test')
    })

    it('should have valid FORM_VALIDATION_ERROR log code', () => {
      const logCode = LogCodes.FORMS.FORM_VALIDATION_ERROR
      expect(logCode.level).toBe('error')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({
          formName: 'declaration',
          error: 'Required field missing'
        })
      ).toBe('Form validation error in declaration: Required field missing')
    })

    it('should have valid FORM_SUBMIT log code', () => {
      const logCode = LogCodes.FORMS.FORM_SUBMIT
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ formName: 'declaration', userId: 'test' })
      ).toBe('Form submitted: declaration by user=test')
    })

    it('should have valid FORM_VALIDATION_SUCCESS log code', () => {
      const logCode = LogCodes.FORMS.FORM_VALIDATION_SUCCESS
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc({ formName: 'declaration' })).toBe(
        'Form validation successful for declaration'
      )
    })

    it('should have valid FORM_PROCESSING_ERROR log code', () => {
      const logCode = LogCodes.FORMS.FORM_PROCESSING_ERROR
      expect(logCode.level).toBe('error')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({
          formName: 'declaration',
          error: 'Processing failed'
        })
      ).toBe('Form processing error for declaration: Processing failed')
    })

    it('should have valid FORM_SAVE log code', () => {
      const logCode = LogCodes.FORMS.FORM_SAVE
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ formName: 'declaration', userId: 'test' })
      ).toBe('Form saved: declaration for user=test')
    })
  })

  describe('SUBMISSION log codes', () => {
    it('should have valid SUBMISSION_STARTED log code', () => {
      const logCode = LogCodes.SUBMISSION.SUBMISSION_STARTED
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ grantType: 'adding-value', userId: 'test' })
      ).toBe('Grant submission started for grantType=adding-value, user=test')
    })

    it('should have valid SUBMISSION_SUCCESS log code', () => {
      const logCode = LogCodes.SUBMISSION.SUBMISSION_SUCCESS
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({
          grantType: 'adding-value',
          referenceNumber: 'REF123'
        })
      ).toBe(
        'Grant submission successful for grantType=adding-value, referenceNumber=REF123'
      )
    })

    it('should have valid SUBMISSION_FAILURE log code', () => {
      const logCode = LogCodes.SUBMISSION.SUBMISSION_FAILURE
      expect(logCode.level).toBe('error')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({
          grantType: 'adding-value',
          userId: 'test',
          error: 'Network error'
        })
      ).toBe(
        'Grant submission failed for grantType=adding-value, user=test. Error: Network error'
      )
    })

    it('should have valid SUBMISSION_VALIDATION_ERROR log code', () => {
      const logCode = LogCodes.SUBMISSION.SUBMISSION_VALIDATION_ERROR
      expect(logCode.level).toBe('error')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({
          grantType: 'adding-value',
          error: 'Invalid data'
        })
      ).toBe(
        'Submission validation error for grantType=adding-value: Invalid data'
      )
    })

    it('should have valid SUBMISSION_PAYLOAD_LOG log code', () => {
      const logCode = LogCodes.SUBMISSION.SUBMISSION_PAYLOAD_LOG
      expect(logCode.level).toBe('debug')
      expect(typeof logCode.messageFunc).toBe('function')
      const payload = { test: 'data' }
      const result = logCode.messageFunc({ grantType: 'adding-value', payload })
      expect(result).toContain('Submission payload for grantType=adding-value:')
      expect(result).toContain('"test": "data"')
    })
  })

  describe('DECLARATION log codes', () => {
    it('should have valid DECLARATION_LOAD log code', () => {
      const logCode = LogCodes.DECLARATION.DECLARATION_LOAD
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ userId: 'test', grantType: 'adding-value' })
      ).toBe('Declaration page loaded for user=test, grantType=adding-value')
    })

    it('should have valid DECLARATION_ACCEPTED log code', () => {
      const logCode = LogCodes.DECLARATION.DECLARATION_ACCEPTED
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ userId: 'test', grantType: 'adding-value' })
      ).toBe('Declaration accepted by user=test, grantType=adding-value')
    })

    it('should have valid DECLARATION_ERROR log code', () => {
      const logCode = LogCodes.DECLARATION.DECLARATION_ERROR
      expect(logCode.level).toBe('error')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ userId: 'test', error: 'Processing failed' })
      ).toBe('Declaration processing error for user=test: Processing failed')
    })
  })

  describe('CONFIRMATION log codes', () => {
    it('should have valid CONFIRMATION_LOAD log code', () => {
      const logCode = LogCodes.CONFIRMATION.CONFIRMATION_LOAD
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ userId: 'test', grantType: 'adding-value' })
      ).toBe('Confirmation page loaded for user=test, grantType=adding-value')
    })

    it('should have valid CONFIRMATION_SUCCESS log code', () => {
      const logCode = LogCodes.CONFIRMATION.CONFIRMATION_SUCCESS
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ userId: 'test', referenceNumber: 'REF123' })
      ).toBe(
        'Confirmation processed successfully for user=test, referenceNumber=REF123'
      )
    })

    it('should have valid CONFIRMATION_ERROR log code', () => {
      const logCode = LogCodes.CONFIRMATION.CONFIRMATION_ERROR
      expect(logCode.level).toBe('error')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ userId: 'test', error: 'Processing failed' })
      ).toBe('Confirmation processing error for user=test: Processing failed')
    })
  })

  describe('TASKLIST log codes', () => {
    it('should have valid TASKLIST_LOAD log code', () => {
      const logCode = LogCodes.TASKLIST.TASKLIST_LOAD
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ userId: 'test', grantType: 'adding-value' })
      ).toBe('Task list loaded for user=test, grantType=adding-value')
    })

    it('should have valid TASK_COMPLETED log code', () => {
      const logCode = LogCodes.TASKLIST.TASK_COMPLETED
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ taskName: 'declaration', userId: 'test' })
      ).toBe('Task completed: declaration for user=test')
    })

    it('should have valid TASK_ERROR log code', () => {
      const logCode = LogCodes.TASKLIST.TASK_ERROR
      expect(logCode.level).toBe('error')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({
          taskName: 'declaration',
          error: 'Processing failed'
        })
      ).toBe('Task processing error for declaration: Processing failed')
    })
  })

  describe('LAND_GRANTS log codes', () => {
    it('should have valid LAND_GRANT_APPLICATION_STARTED log code', () => {
      const logCode = LogCodes.LAND_GRANTS.LAND_GRANT_APPLICATION_STARTED
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc({ userId: 'test' })).toBe(
        'Land grant application started for user=test'
      )
    })

    it('should have valid LAND_GRANT_APPLICATION_SUBMITTED log code', () => {
      const logCode = LogCodes.LAND_GRANTS.LAND_GRANT_APPLICATION_SUBMITTED
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ userId: 'test', referenceNumber: 'REF123' })
      ).toBe(
        'Land grant application submitted for user=test, referenceNumber=REF123'
      )
    })

    it('should have valid LAND_GRANT_ERROR log code', () => {
      const logCode = LogCodes.LAND_GRANTS.LAND_GRANT_ERROR
      expect(logCode.level).toBe('error')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ userId: 'test', error: 'Processing failed' })
      ).toBe('Land grant processing error for user=test: Processing failed')
    })
  })

  describe('AGREEMENTS log codes', () => {
    it('should have valid AGREEMENT_LOAD log code', () => {
      const logCode = LogCodes.AGREEMENTS.AGREEMENT_LOAD
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ userId: 'test', agreementType: 'terms' })
      ).toBe('Agreement loaded for user=test, agreementType=terms')
    })

    it('should have valid AGREEMENT_ACCEPTED log code', () => {
      const logCode = LogCodes.AGREEMENTS.AGREEMENT_ACCEPTED
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ userId: 'test', agreementType: 'terms' })
      ).toBe('Agreement accepted by user=test, agreementType=terms')
    })

    it('should have valid AGREEMENT_ERROR log code', () => {
      const logCode = LogCodes.AGREEMENTS.AGREEMENT_ERROR
      expect(logCode.level).toBe('error')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ userId: 'test', error: 'Processing failed' })
      ).toBe('Agreement processing error for user=test: Processing failed')
    })
  })

  describe('SYSTEM log codes', () => {
    it('should have valid SERVER_ERROR log code', () => {
      const logCode = LogCodes.SYSTEM.SERVER_ERROR
      expect(logCode.level).toBe('error')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc({ error: 'Database connection failed' })).toBe(
        'Server error occurred: Database connection failed'
      )
    })

    it('should have valid SYSTEM_STARTUP log code', () => {
      const logCode = LogCodes.SYSTEM.SYSTEM_STARTUP
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc({ port: 3000 })).toBe(
        'System startup completed on port=3000'
      )
    })

    it('should have valid EXTERNAL_API_CALL log code', () => {
      const logCode = LogCodes.SYSTEM.EXTERNAL_API_CALL
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({ endpoint: '/api/grants', userId: 'test' })
      ).toBe('External API call to /api/grants for user=test')
    })

    it('should have valid SYSTEM_SHUTDOWN log code', () => {
      const logCode = LogCodes.SYSTEM.SYSTEM_SHUTDOWN
      expect(logCode.level).toBe('info')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc({})).toBe('System shutdown initiated')
    })

    it('should have valid EXTERNAL_API_ERROR log code', () => {
      const logCode = LogCodes.SYSTEM.EXTERNAL_API_ERROR
      expect(logCode.level).toBe('error')
      expect(typeof logCode.messageFunc).toBe('function')
      expect(
        logCode.messageFunc({
          endpoint: '/api/grants',
          error: 'Connection failed'
        })
      ).toBe('External API error for /api/grants: Connection failed')
    })
  })

  describe('validateLogCodes', () => {
    it('should validate all log codes without throwing', () => {
      expect(() => validateLogCodes(LogCodes)).not.toThrow()
    })

    it('should throw error for invalid log code structure', () => {
      const invalidLogCodes = {
        TEST: {
          INVALID: {
            level: 'invalid',
            messageFunc: () => 'test'
          }
        }
      }
      expect(() => validateLogCodes(invalidLogCodes)).toThrow()
    })

    it('should throw error for missing messageFunc', () => {
      const invalidLogCodes = {
        TEST: {
          INVALID: {
            level: 'info'
          }
        }
      }
      expect(() => validateLogCodes(invalidLogCodes)).toThrow()
    })

    it('should throw error for missing level', () => {
      const invalidLogCodes = {
        TEST: {
          INVALID: {
            messageFunc: () => 'test'
          }
        }
      }
      expect(() => validateLogCodes(invalidLogCodes)).toThrow()
    })

    it('should throw error for null values', () => {
      const invalidLogCodes = {
        TEST: {
          INVALID: null
        }
      }
      expect(() => validateLogCodes(invalidLogCodes)).toThrow()
    })

    it('should throw error for invalid nested structure', () => {
      const invalidLogCodes = {
        TEST: {
          NESTED: {
            INVALID: 'not an object'
          }
        }
      }
      expect(() => validateLogCodes(invalidLogCodes)).toThrow()
    })

    it('should throw error for array values', () => {
      const invalidLogCodes = {
        TEST: {
          INVALID: ['not', 'an', 'object']
        }
      }
      expect(() => validateLogCodes(invalidLogCodes)).toThrow()
    })

    it('should throw error for function values', () => {
      const invalidLogCodes = {
        TEST: {
          INVALID: () => {
            return 'test'
          }
        }
      }
      expect(() => validateLogCodes(invalidLogCodes)).toThrow()
    })

    it('should throw error for nested validation failure', () => {
      const invalidLogCodes = {
        TEST: {
          CATEGORY: {
            INVALID: {
              level: 'info'
              // missing messageFunc
            }
          }
        }
      }
      expect(() => validateLogCodes(invalidLogCodes)).toThrow(
        'Invalid log code definition for "INVALID"'
      )
    })
  })

  describe('Unknown user handling', () => {
    it('should handle unknown users in AUTH log codes', () => {
      const logCode = LogCodes.AUTH.SIGN_IN_ATTEMPT
      expect(logCode.messageFunc({})).toBe(
        'User sign-in attempt for user=unknown'
      )
    })

    it('should handle unknown users in FORMS log codes', () => {
      const logCode = LogCodes.FORMS.FORM_LOAD
      expect(logCode.messageFunc({ formName: 'test' })).toBe(
        'Form loaded: test for user=unknown'
      )
    })

    it('should handle unknown users in SYSTEM log codes', () => {
      const logCode = LogCodes.SYSTEM.EXTERNAL_API_CALL
      expect(logCode.messageFunc({ endpoint: '/api/test' })).toBe(
        'External API call to /api/test for user=unknown'
      )
    })
  })
})
