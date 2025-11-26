import { vi } from 'vitest'
import crypto from 'crypto'
import { createState, validateState } from './state.js'
import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'

vi.mock('crypto', () => ({
  default: {
    randomUUID: vi.fn()
  },
  randomUUID: vi.fn()
}))
vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn()
}))

describe('State Management Functions', () => {
  let mockRequest

  beforeEach(() => {
    vi.clearAllMocks()

    mockRequest = {
      yar: {
        set: vi.fn(),
        get: vi.fn(),
        clear: vi.fn()
      },
      path: '/test/callback', // validateState logs this too
      info: {
        remoteAddress: '127.0.0.1' // 💥 THIS FIXES THE ISSUE
      }
    }

    crypto.randomUUID.mockReturnValue('test-uuid-123')
  })

  describe('createState', () => {
    it('should generate a state value using crypto.randomUUID', () => {
      const state = createState(mockRequest)

      expect(crypto.randomUUID).toHaveBeenCalledTimes(1)

      const expectedState = Buffer.from(JSON.stringify({ id: 'test-uuid-123' })).toString('base64')
      expect(state).toBe(expectedState)
    })

    it('should store the state in the session', () => {
      const state = createState(mockRequest)

      expect(mockRequest.yar.set).toHaveBeenCalledWith('state', state)
    })

    it('should return the base64 encoded state', () => {
      const state = createState(mockRequest)

      expect(() => Buffer.from(state, 'base64').toString()).not.toThrow()

      const decoded = JSON.parse(Buffer.from(state, 'base64').toString())
      expect(decoded).toEqual({ id: 'test-uuid-123' })
    })
  })

  describe('validateState', () => {
    it('should retrieve and clear the stored state', () => {
      const testState = 'test-state'
      mockRequest.yar.get.mockReturnValue(testState)

      validateState(mockRequest, testState)

      expect(mockRequest.yar.get).toHaveBeenCalledWith('state')
      expect(mockRequest.yar.clear).toHaveBeenCalledWith('state')
    })

    it('should throw an error when states do not match', () => {
      mockRequest.yar.get.mockReturnValue('stored-state')

      expect(() => {
        validateState(mockRequest, 'different-state')
      }).toThrow('Invalid state, possible CSRF attack')
    })

    it('logs INVALID_STATE on mismatch', () => {
      const request = {
        yar: { get: () => 'stored', set: () => {}, clear: () => {} },
        path: '/callback',
        info: { remoteAddress: '1.2.3.4' }
      }

      expect(() => validateState(request, 'different')).toThrow('Invalid state')

      expect(log).toHaveBeenCalledWith(
        LogCodes.AUTH.INVALID_STATE,
        expect.objectContaining({
          reason: 'State mismatch during OAuth callback',
          storedStatePresent: true,
          path: '/callback'
        }),
        request
      )
    })

    it('should throw an error when stored state is missing', () => {
      mockRequest.yar.get.mockReturnValue(null)

      expect(() => {
        validateState(mockRequest, 'some-state')
      }).toThrow('Invalid state, possible CSRF attack')
    })
  })
})
