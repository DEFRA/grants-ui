import jest, { fn as jestMockFn } from 'jest-mock'

const mockFn = typeof jest !== 'undefined' ? jest.fn : jestMockFn

export const createMockTasklistConfig = (overrides = {}) => ({
  tasklist: {
    id: 'test-tasklist',
    title: 'Test Tasklist',
    sections: [],
    ...overrides
  }
})

export const createMockConditionEvaluatorData = (overrides = {}) => ({
  facilities: {
    isBuildingSmallerAbattoir: true,
    isBuildingFruitStorage: false,
    isProvidingServicesToOtherFarmers: true,
    isProvidingFruitStorage: false
  },
  'who-is-applying': {
    grantApplicantType: 'applying-A1'
  },
  costs: { totalCosts: 50000 },
  ...overrides
})

export const createMockHapiServer = () => ({
  route: mockFn(),
  app: {
    cacheTemp: {
      get: mockFn().mockResolvedValue({ testData: 'value' })
    }
  }
})

export const createMockHapiRequest = (overrides = {}) => ({
  yar: {
    id: 'test-session-id',
    get: mockFn().mockReturnValue(['visited1', 'visited2'])
  },
  log: mockFn(),
  logger: {
    warn: mockFn(),
    error: mockFn(),
    info: mockFn(),
    debug: mockFn()
  },
  ...overrides
})

export const createMockHapiResponseToolkit = () => ({
  view: mockFn().mockReturnValue('rendered-view')
})

export const createComplexTasklistConfig = () => ({
  tasklist: {
    id: 'example',
    title: 'Example Tasklist',
    closingDate: '2024-12-31',
    helpText: 'Complete all sections to submit your application',
    sections: [
      {
        id: 'section1',
        title: 'Section 1',
        subsections: [
          {
            id: 'subsection1',
            title: 'Subsection 1',
            href: '/subsection1'
          },
          {
            id: 'subsection2',
            title: 'Subsection 2',
            dependsOn: ['subsection1']
          }
        ]
      },
      {
        id: 'section2',
        title: 'Section 2',
        subsections: [
          {
            id: 'subsection3',
            title: 'Subsection 3',
            required: false
          }
        ]
      }
    ],
    conditions: {
      testCondition: {
        type: 'conditional',
        rules: [
          {
            if: { field: 'test.field', equals: true },
            then: 'not_yet_started'
          }
        ],
        default: 'cannot_start_yet'
      }
    },
    statusRules: {
      computed1: {
        type: 'allComplete',
        dependsOn: ['subsection1', 'subsection2']
      }
    }
  }
})

export const createValidTasklistConfig = (overrides = {}) => ({
  tasklist: {
    id: 'test-tasklist',
    title: 'Test Tasklist',
    sections: [
      {
        id: 'section1',
        title: 'Section 1',
        subsections: [
          {
            id: 'subsection1',
            title: 'Subsection 1'
          },
          {
            id: 'subsection2',
            title: 'Subsection 2'
          }
        ]
      }
    ],
    ...overrides
  }
})

export const createTasklistConfigWithoutRoot = (content = {}) => content

export const createTasklistConfigMissingField = (
  missingField,
  overrides = {}
) => {
  const baseConfig = {
    id: 'test-tasklist',
    title: 'Test Tasklist',
    sections: []
  }

  delete baseConfig[missingField]

  return {
    tasklist: {
      ...baseConfig,
      ...overrides
    }
  }
}

export const createSectionConfig = (overrides = {}) => ({
  id: 'section1',
  title: 'Section 1',
  subsections: [],
  ...overrides
})

export const createSubsectionConfig = (overrides = {}) => ({
  id: 'subsection1',
  title: 'Subsection 1',
  ...overrides
})
