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

export const mockFormsCacheServiceWithError = (error = new Error('Cache service error')) => ({
  getFormsCacheService: () => ({
    getConfirmationState: vi.fn().mockRejectedValue(error),
    setConfirmationState: vi.fn().mockRejectedValue(error),
    clearState: vi.fn().mockRejectedValue(error)
  })
})

export const mockFormsCacheServiceNotConfirmed = () => ({
  getFormsCacheService: () => ({
    getConfirmationState: vi.fn().mockResolvedValue({ confirmed: false }),
    setConfirmationState: vi.fn(),
    clearState: vi.fn()
  })
})

export const mockSbiStateWithError = (error = new Error('SBI state error')) => ({
  sbiStore: {
    get: vi.fn().mockImplementation(() => {
      throw error
    }),
    set: vi.fn().mockImplementation(() => {
      throw error
    })
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

export const mockGrantApplicationData = (customData = {}) => ({
  sbi: '123456789',
  businessName: 'Test Farm Ltd',
  email: 'test@farm.com',
  phone: '01234567890',
  status: 'submitted',
  submissionDate: '2024-01-01',
  ...customData
})

export const mockTasklistData = (customData = {}) => ({
  pageHeading: 'Test Tasklist',
  closingDate: '2024-12-31',
  helpText: 'Complete all sections to submit your application',
  sections: [
    {
      sectionHeading: 'Section 1',
      subsections: [
        {
          subsectionHeading: 'Subsection 1',
          status: 'completed',
          link: '/section1/subsection1'
        }
      ]
    }
  ],
  ...customData
})
