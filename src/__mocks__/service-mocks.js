import { vi } from 'vitest'

export const mockFormsCacheService = (customMethods = {}) => ({
  getFormsCacheService: () => ({
    getConfirmationState: vi.fn().mockResolvedValue({ confirmed: true }),
    setConfirmationState: vi.fn(),
    clearState: vi.fn(),
    ...customMethods
  })
})

export const mockSbiState = (customMethods = {}) => ({
  sbiStore: {
    get: vi.fn(),
    set: vi.fn(),
    ...customMethods
  }
})

export const mockSbiStateWithValue = (value = 'test-sbi-value') => ({
  sbiStore: {
    get: vi.fn(() => value),
    set: vi.fn()
  }
})

export const mockLandParcelData = (customData = {}) => ({
  'parcel-1': {
    actionsObj: {
      'action-1': {
        description: 'Test Action 1',
        value: '10',
        unit: 'hectares'
      },
      'action-2': {
        description: 'Test Action 2',
        value: '5',
        unit: 'hectares'
      }
    }
  },
  'parcel-2': {
    actionsObj: {
      'action-3': {
        description: 'Test Action 3',
        value: '15',
        unit: 'hectares'
      }
    }
  },
  ...customData
})
