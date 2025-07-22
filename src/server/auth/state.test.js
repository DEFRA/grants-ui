import crypto from 'crypto'
import { createState, validateState } from './state.js'

jest.mock('crypto', () => ({
  randomUUID: jest.fn()
}))

describe('State Management Functions', () => {
  let mockRequest

  beforeEach(() => {
    jest.clearAllMocks()

    mockRequest = {
      yar: {
        set: jest.fn(),
        get: jest.fn(),
        clear: jest.fn()
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

    it('should throw an error when stored state is missing', () => {
      mockRequest.yar.get.mockReturnValue(null)

      expect(() => {
        validateState(mockRequest, 'some-state')
      }).toThrow('Invalid state, possible CSRF attack')
    })
  })
})
