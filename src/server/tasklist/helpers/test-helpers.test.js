import {
  createMockTasklistConfig,
  createMockConditionEvaluatorData,
  createMockHapiServer,
  createMockHapiRequest,
  createMockHapiResponseToolkit,
  createComplexTasklistConfig,
  createValidTasklistConfig,
  createTasklistConfigWithoutRoot,
  createTasklistConfigMissingField,
  createSectionConfig,
  createSubsectionConfig
} from './test-helpers.js'

const TEST_TASKLIST_ID = 'test-tasklist'
const TEST_TASKLIST_TITLE = 'Test Tasklist'
const TEST_CACHE_DATA = { testData: 'value' }
const EMPTY_SECTIONS = []
const GRANT_APPLICANT_TYPE = 'applying-A1'
const TOTAL_COSTS_DEFAULT = 50000
const EXAMPLE_TASKLIST_ID = 'example'
const EXAMPLE_TASKLIST_TITLE = 'Example Tasklist'
const EXAMPLE_CLOSING_DATE = '2024-12-31'
const EXAMPLE_HELP_TEXT = 'Complete all sections to submit your application'
const SECTION1_ID = 'section1'
const SECTION1_TITLE = 'Section 1'
const SUBSECTION1_ID = 'subsection1'
const SUBSECTION1_TITLE = 'Subsection 1'
const SUBSECTION2_ID = 'subsection2'
const SUBSECTION2_TITLE = 'Subsection 2'
const SUBSECTION1_HREF = '/subsection1'
const CUSTOM_ID = 'custom-id'
const CUSTOM_TITLE = 'Custom Title'
const CUSTOM_SESSION_ID = 'custom-session-id'
const CUSTOM_VALID_TASKLIST_ID = 'custom-valid-tasklist'
const CUSTOM_HELP_TEXT = 'Custom help text'
const ADDITIONAL_HELP_TEXT = 'Additional help'
const CUSTOM_SECTION_ID = 'custom-section'
const CUSTOM_SECTION_TITLE = 'Custom Section'
const CUSTOM_SUBSECTION_ID = 'custom-subsection'
const CUSTOM_SUBSECTION_TITLE = 'Custom Subsection'
const CUSTOM_HREF = '/custom'
const SUB1_ID = 'sub1'
const TEST_CONTENT = { id: 'test', title: 'Test' }

const SUBSECTION1_CONFIG = {
  id: SUBSECTION1_ID,
  title: SUBSECTION1_TITLE,
  href: SUBSECTION1_HREF
}

const SUBSECTION2_CONFIG = {
  id: SUBSECTION2_ID,
  title: SUBSECTION2_TITLE,
  dependsOn: [SUBSECTION1_ID]
}

const TEST_CONDITION_CONFIG = {
  type: 'conditional',
  rules: [
    {
      if: { field: 'test.field', equals: true },
      then: 'not_yet_started'
    }
  ],
  default: 'cannot_start_yet'
}

const STATUS_RULES_CONFIG = {
  type: 'allComplete',
  dependsOn: [SUBSECTION1_ID, SUBSECTION2_ID]
}

const SECTION1_CONFIG = {
  id: SECTION1_ID,
  title: SECTION1_TITLE,
  subsections: [
    {
      id: SUBSECTION1_ID,
      title: SUBSECTION1_TITLE
    },
    {
      id: SUBSECTION2_ID,
      title: SUBSECTION2_TITLE
    }
  ]
}

describe('createMockTasklistConfig', () => {
  it('should create a basic tasklist config with defaults', () => {
    const config = createMockTasklistConfig()

    expect(config).toEqual({
      tasklist: {
        id: TEST_TASKLIST_ID,
        title: TEST_TASKLIST_TITLE,
        sections: EMPTY_SECTIONS
      }
    })
  })

  it('should accept overrides', () => {
    const overrides = {
      id: CUSTOM_ID,
      title: CUSTOM_TITLE,
      sections: [{ id: SECTION1_ID }]
    }
    const config = createMockTasklistConfig(overrides)

    expect(config.tasklist).toEqual({
      id: CUSTOM_ID,
      title: CUSTOM_TITLE,
      sections: [{ id: SECTION1_ID }]
    })
  })
})
describe('createMockConditionEvaluatorData', () => {
  it('should replace nested objects with overrides (shallow merge)', () => {
    const overrides = {
      facilities: { isBuildingFruitStorage: true }
    }
    const data = createMockConditionEvaluatorData(overrides)

    expect(data.facilities).toEqual({
      isBuildingFruitStorage: true
    })
    expect(data['who-is-applying'].grantApplicantType).toBe(GRANT_APPLICANT_TYPE)
    expect(data.costs.totalCosts).toBe(TOTAL_COSTS_DEFAULT)
  })
})

describe('createMockHapiServer', () => {
  it('should have working mock functions', async () => {
    const server = createMockHapiServer()

    const cacheResult = await server.app.cacheTemp.get()
    expect(cacheResult).toEqual(TEST_CACHE_DATA)
    expect(server.app.cacheTemp.get).toHaveBeenCalled()
  })
})

describe('createMockHapiRequest', () => {
  it('should accept overrides', () => {
    const overrides = {
      yar: { id: CUSTOM_SESSION_ID }
    }
    const request = createMockHapiRequest(overrides)

    expect(request.yar.id).toBe(CUSTOM_SESSION_ID)
    expect(request.log).toEqual(expect.any(Function))
  })
})

describe('createMockHapiResponseToolkit', () => {
  it('should create a mock hapi response toolkit', () => {
    const h = createMockHapiResponseToolkit()

    expect(h.view).toEqual(expect.any(Function))
  })
})

describe('createComplexTasklistConfig', () => {
  it('should create a complex tasklist configuration', () => {
    const config = createComplexTasklistConfig()

    expect(config.tasklist).toBeDefined()
    expect(config.tasklist.id).toBe(EXAMPLE_TASKLIST_ID)
    expect(config.tasklist.title).toBe(EXAMPLE_TASKLIST_TITLE)
    expect(config.tasklist.closingDate).toBe(EXAMPLE_CLOSING_DATE)
    expect(config.tasklist.helpText).toBe(EXAMPLE_HELP_TEXT)
  })

  it.each([
    {
      property: 'subsections structure',
      verify: (config) => {
        const section1 = config.tasklist.sections[0]
        expect(section1.subsections).toHaveLength(2)
        expect(section1.subsections[0]).toEqual(SUBSECTION1_CONFIG)
        expect(section1.subsections[1]).toEqual(SUBSECTION2_CONFIG)
      }
    },
    {
      property: 'conditions configuration',
      verify: (config) => {
        expect(config.tasklist.conditions).toBeDefined()
        expect(config.tasklist.conditions.testCondition).toEqual(TEST_CONDITION_CONFIG)
      }
    },
    {
      property: 'statusRules configuration',
      verify: (config) => {
        expect(config.tasklist.statusRules).toBeDefined()
        expect(config.tasklist.statusRules.computed1).toEqual(STATUS_RULES_CONFIG)
      }
    }
  ])('should have correct $property', ({ verify }) => {
    const config = createComplexTasklistConfig()
    verify(config)
  })
})

describe('createValidTasklistConfig', () => {
  it('should create a valid tasklist config with defaults', () => {
    const config = createValidTasklistConfig()

    expect(config.tasklist).toEqual({
      id: TEST_TASKLIST_ID,
      title: TEST_TASKLIST_TITLE,
      sections: [SECTION1_CONFIG]
    })
  })

  it('should accept overrides', () => {
    const overrides = {
      id: CUSTOM_VALID_TASKLIST_ID,
      helpText: CUSTOM_HELP_TEXT
    }
    const config = createValidTasklistConfig(overrides)

    expect(config.tasklist.id).toBe(CUSTOM_VALID_TASKLIST_ID)
    expect(config.tasklist.helpText).toBe(CUSTOM_HELP_TEXT)
    expect(config.tasklist.title).toBe(TEST_TASKLIST_TITLE)
  })
})

describe('createTasklistConfigWithoutRoot', () => {
  it.each([
    {
      content: TEST_CONTENT,
      description: 'with content',
      expected: TEST_CONTENT
    },
    {
      content: undefined,
      description: 'with no content',
      expected: {}
    }
  ])('should return content directly without tasklist root $description', ({ content, expected }) => {
    const result = createTasklistConfigWithoutRoot(content)

    expect(result).toEqual(expected)
    expect(result).not.toHaveProperty('tasklist')
  })
})

describe('createTasklistConfigMissingField', () => {
  it.each([
    {
      field: 'id',
      expectedPresent: { title: TEST_TASKLIST_TITLE, sections: EMPTY_SECTIONS }
    },
    {
      field: 'title',
      expectedPresent: { id: TEST_TASKLIST_ID, sections: EMPTY_SECTIONS }
    },
    {
      field: 'sections',
      expectedPresent: { id: TEST_TASKLIST_ID, title: TEST_TASKLIST_TITLE }
    }
  ])('should create config with missing $field field', ({ field, expectedPresent }) => {
    const config = createTasklistConfigMissingField(field)

    expect(config.tasklist).not.toHaveProperty(field)
    Object.entries(expectedPresent).forEach(([key, value]) => {
      expect(config.tasklist[key]).toEqual(value)
    })
  })

  it('should accept overrides', () => {
    const overrides = { helpText: ADDITIONAL_HELP_TEXT }
    const config = createTasklistConfigMissingField('id', overrides)

    expect(config.tasklist).not.toHaveProperty('id')
    expect(config.tasklist.helpText).toBe(ADDITIONAL_HELP_TEXT)
  })
})

describe('createSectionConfig', () => {
  it('should create a section config with defaults', () => {
    const section = createSectionConfig()

    expect(section).toEqual({
      id: SECTION1_ID,
      title: SECTION1_TITLE,
      subsections: EMPTY_SECTIONS
    })
  })

  it('should accept overrides', () => {
    const overrides = {
      id: CUSTOM_SECTION_ID,
      title: CUSTOM_SECTION_TITLE,
      subsections: [{ id: SUB1_ID }]
    }
    const section = createSectionConfig(overrides)

    expect(section).toEqual({
      id: CUSTOM_SECTION_ID,
      title: CUSTOM_SECTION_TITLE,
      subsections: [{ id: SUB1_ID }]
    })
  })
})

describe('createSubsectionConfig', () => {
  it('should create a subsection config with defaults', () => {
    const subsection = createSubsectionConfig()

    expect(subsection).toEqual({
      id: SUBSECTION1_ID,
      title: SUBSECTION1_TITLE
    })
  })

  it('should accept overrides', () => {
    const overrides = {
      id: CUSTOM_SUBSECTION_ID,
      title: CUSTOM_SUBSECTION_TITLE,
      href: CUSTOM_HREF,
      dependsOn: ['other-subsection']
    }
    const subsection = createSubsectionConfig(overrides)

    expect(subsection).toEqual({
      id: CUSTOM_SUBSECTION_ID,
      title: CUSTOM_SUBSECTION_TITLE,
      href: CUSTOM_HREF,
      dependsOn: ['other-subsection']
    })
  })
})
