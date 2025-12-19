import { vi } from 'vitest'
import {
  demoDetailsHandler,
  demoDetailsPostHandler,
  buildViewModel,
  buildIncorrectDetailsViewModel,
  generateFallbackViewModel,
  loadDisplaySectionsConfig
} from './demo-details.handler.js'
import { processSections } from '../../common/services/details-page/index.js'
import { buildDemoMappedData, buildDemoRequest } from '../helpers/index.js'
import { generateFormNotFoundResponse, getAllForms } from '../utils/index.js'
import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'
import { log } from '../../common/helpers/logging/log.js'

const mockDemoMappedData = {
  customer: {
    name: { first: 'John', middle: 'William', last: 'Smith' }
  },
  business: {
    name: 'Demo Test Farm Ltd',
    address: { line1: '123 Farm Road', city: 'Manchester', postalCode: 'M1 1AA' },
    phone: { mobile: '07123456789' },
    email: { address: 'demo@testfarm.com' }
  }
}

const mockDemoRequest = {
  auth: {
    credentials: { sbi: '999888777', crn: '1234567890' }
  }
}

const mockDisplaySections = [
  {
    title: 'Applicant details',
    fields: [{ label: 'Applicant name', sourcePath: 'customer.name', format: 'fullName' }]
  },
  {
    title: 'Organisation details',
    fields: [{ label: 'Organisation name', sourcePath: 'business.name' }]
  }
]

const mockForm = {
  id: 'test-form-id',
  slug: 'test-form',
  title: 'Test Form',
  metadata: {
    detailsPage: {
      displaySections: mockDisplaySections
    }
  }
}

const mockFormWithoutConfig = {
  id: 'test-form-no-config',
  slug: 'test-form-no-config',
  title: 'Test Form Without Config'
}

vi.mock('../../common/services/details-page/index.js')
vi.mock('../helpers/index.js')
vi.mock('../utils/index.js')
vi.mock('../../common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

describe('demo-details.handler', () => {
  let mockRequest
  let mockH

  beforeEach(() => {
    vi.clearAllMocks()

    mockRequest = mockHapiRequest({
      params: { slug: 'test-form' }
    })
    mockH = mockHapiResponseToolkit()

    buildDemoMappedData.mockReturnValue(mockDemoMappedData)
    buildDemoRequest.mockReturnValue(mockDemoRequest)
    getAllForms.mockReturnValue([mockForm])
  })

  describe('buildViewModel', () => {
    test('should build view model with correct structure', () => {
      const sections = [{ title: { text: 'Test Section' }, summaryList: { rows: [] } }]

      const result = buildViewModel(sections, mockForm, 'test-form')

      expect(result).toEqual({
        pageTitle: 'Check your details are correct',
        sections,
        serviceName: 'Test Form',
        serviceUrl: '/test-form',
        breadcrumbs: [],
        isDevelopmentMode: true,
        formTitle: 'Test Form',
        formSlug: 'test-form',
        auth: {
          name: 'Dev Mode User',
          organisationName: 'Dev Mode Organisation',
          organisationId: '999999999'
        }
      })
    })

    test('should use fallback serviceName when form has no title', () => {
      const sections = []
      const formWithoutTitle = { id: 'test-id', slug: 'test-form' }

      const result = buildViewModel(sections, formWithoutTitle, 'test-form')

      expect(result.serviceName).toBe('Check your details')
    })

    test('should use fallback serviceUrl when slug is empty', () => {
      const sections = []

      const result = buildViewModel(sections, mockForm, '')

      expect(result.serviceUrl).toBe('/')
    })
  })

  describe('generateFallbackViewModel', () => {
    test('should return fallback view model with error message', () => {
      const result = generateFallbackViewModel(new Error('Test error'))

      expect(result.sections[0].title.text).toBe('Error')
      expect(result.sections[0].summaryList.rows[0].key.text).toBe('Error')
      expect(result.sections[0].summaryList.rows[0].value.html).toContain('Test error')
      expect(result.isDevelopmentMode).toBe(true)
    })
  })

  describe('loadDisplaySectionsConfig', () => {
    test('should return displaySections from form config', () => {
      const result = loadDisplaySectionsConfig(mockForm)

      expect(result).toEqual({ displaySections: mockDisplaySections })
    })

    const nullConfigCases = [
      { name: 'form has no metadata', form: mockFormWithoutConfig },
      { name: 'form has no detailsPage config', form: { ...mockFormWithoutConfig, metadata: {} } },
      { name: 'form is undefined', form: undefined }
    ]

    test.each(nullConfigCases)('should return null when $name', ({ form }) => {
      expect(loadDisplaySectionsConfig(form)).toEqual({ displaySections: null })
    })
  })

  describe('demoDetailsHandler', () => {
    test('should render demo details page with display sections from form config', async () => {
      const mockSections = [
        {
          title: { text: 'Applicant details' },
          summaryList: { rows: [{ key: { text: 'Applicant name' }, value: { text: 'John Smith' } }] }
        }
      ]
      processSections.mockReturnValue(mockSections)

      await demoDetailsHandler(mockRequest, mockH)

      expect(getAllForms).toHaveBeenCalled()
      expect(processSections).toHaveBeenCalledWith(mockDisplaySections, mockDemoMappedData, mockDemoRequest)
      expect(mockH.view).toHaveBeenCalledWith(
        'check-details',
        expect.objectContaining({
          sections: mockSections,
          isDevelopmentMode: true
        })
      )
    })

    test('should return no config message when form has no displaySections', async () => {
      getAllForms.mockReturnValue([mockFormWithoutConfig])
      mockRequest = mockHapiRequest({
        params: { slug: 'test-form-no-config' }
      })

      await demoDetailsHandler(mockRequest, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'check-details',
        expect.objectContaining({
          sections: expect.arrayContaining([
            expect.objectContaining({
              title: { text: 'No Configuration Found' }
            })
          ]),
          isDevelopmentMode: true
        })
      )
      expect(processSections).not.toHaveBeenCalled()
    })

    test('should return form not found response when form does not exist', async () => {
      getAllForms.mockReturnValue([])
      generateFormNotFoundResponse.mockReturnValue('not-found-response')

      const result = await demoDetailsHandler(mockRequest, mockH)

      expect(generateFormNotFoundResponse).toHaveBeenCalledWith('test-form', mockH)
      expect(result).toBe('not-found-response')
    })

    test('should handle errors gracefully with fallback content', async () => {
      getAllForms.mockImplementation(() => {
        throw new Error('Handler error')
      })

      await demoDetailsHandler(mockRequest, mockH)

      expect(vi.mocked(log)).toHaveBeenCalled()
      expect(mockH.view).toHaveBeenCalledWith(
        'check-details',
        expect.objectContaining({
          sections: expect.arrayContaining([
            expect.objectContaining({
              title: { text: 'Error' },
              summaryList: expect.objectContaining({
                rows: expect.arrayContaining([expect.objectContaining({ key: { text: 'Error' } })])
              })
            })
          ])
        })
      )
    })
  })

  describe('buildIncorrectDetailsViewModel', () => {
    test('should build view model with correct structure', () => {
      const result = buildIncorrectDetailsViewModel(mockForm, 'test-form')

      expect(result).toEqual({
        serviceName: 'Test Form',
        serviceUrl: '/test-form',
        continueUrl: '/test-form',
        isDevelopmentMode: true
      })
    })

    test('should use fallback serviceName when form has no title', () => {
      const formWithoutTitle = { id: 'test-id', slug: 'test-form' }

      const result = buildIncorrectDetailsViewModel(formWithoutTitle, 'test-form')

      expect(result.serviceName).toBe('Check your details')
    })

    test('should use fallback serviceUrl and continueUrl when slug is empty', () => {
      const result = buildIncorrectDetailsViewModel(mockForm, '')

      expect(result.serviceUrl).toBe('/')
      expect(result.continueUrl).toBe('/')
    })
  })

  describe('demoDetailsPostHandler', () => {
    test('should continue with journey when user selects "Yes"', async () => {
      mockRequest = mockHapiRequest({
        params: { slug: 'test-form' },
        payload: { detailsCorrect: 'true' }
      })

      await demoDetailsPostHandler(mockRequest, mockH)

      expect(mockH.redirect).toHaveBeenCalledWith('/test-form')
    })

    test('should show incorrect details page when user selects "No"', async () => {
      mockRequest = mockHapiRequest({
        params: { slug: 'test-form' },
        payload: { detailsCorrect: 'false' }
      })

      await demoDetailsPostHandler(mockRequest, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'incorrect-details',
        expect.objectContaining({
          serviceName: 'Test Form',
          serviceUrl: '/test-form',
          continueUrl: '/test-form',
          isDevelopmentMode: true
        })
      )
    })

    test('should show validation error when no option is selected', async () => {
      mockRequest = mockHapiRequest({
        params: { slug: 'test-form' },
        payload: {}
      })
      processSections.mockReturnValue([])

      await demoDetailsPostHandler(mockRequest, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'check-details',
        expect.objectContaining({
          errors: [
            {
              text: 'Select yes if your details are correct',
              href: '#detailsCorrect'
            }
          ]
        })
      )
    })

    test('should return form not found response when form does not exist', async () => {
      getAllForms.mockReturnValue([])
      generateFormNotFoundResponse.mockReturnValue('not-found-response')

      const result = await demoDetailsPostHandler(mockRequest, mockH)

      expect(generateFormNotFoundResponse).toHaveBeenCalledWith('test-form', mockH)
      expect(result).toBe('not-found-response')
    })

    test('should handle null payload gracefully', async () => {
      mockRequest = mockHapiRequest({
        params: { slug: 'test-form' },
        payload: null
      })
      processSections.mockReturnValue([])

      await demoDetailsPostHandler(mockRequest, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'check-details',
        expect.objectContaining({
          errors: [
            {
              text: 'Select yes if your details are correct',
              href: '#detailsCorrect'
            }
          ]
        })
      )
    })

    test('should use empty sections array when form has no displaySections config during validation', async () => {
      getAllForms.mockReturnValue([mockFormWithoutConfig])
      mockRequest = mockHapiRequest({
        params: { slug: 'test-form-no-config' },
        payload: {}
      })

      await demoDetailsPostHandler(mockRequest, mockH)

      expect(processSections).not.toHaveBeenCalled()
      expect(mockH.view).toHaveBeenCalledWith(
        'check-details',
        expect.objectContaining({
          sections: [],
          errors: expect.any(Array)
        })
      )
    })
  })
})
