import { loadTasklistConfig, validateTasklistConfig } from './config-loader.js'
import { readFile } from 'fs/promises'
import { parse } from 'yaml'
import {
  createMockTasklistConfig,
  createValidTasklistConfig,
  createTasklistConfigWithoutRoot,
  createTasklistConfigMissingField,
  createSectionConfig,
  createSubsectionConfig
} from './test-helpers.js'

jest.mock('fs/promises')
jest.mock('yaml')

describe('config-loader', () => {
  const mockTasklistId = 'test-tasklist'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('loadTasklistConfig', () => {
    it('should load and parse valid YAML config', async () => {
      const mockYamlContent = `
tasklist:
  id: test-tasklist
  title: Test Tasklist
  sections: []
`
      const mockParsedConfig = createMockTasklistConfig()

      readFile.mockResolvedValue(mockYamlContent)
      parse.mockReturnValue(mockParsedConfig)

      const result = await loadTasklistConfig(mockTasklistId)

      expect(readFile).toHaveBeenCalledWith(
        expect.stringContaining('test-tasklist-tasklist.yaml'),
        'utf8'
      )
      expect(parse).toHaveBeenCalledWith(mockYamlContent)
      expect(result).toEqual(mockParsedConfig)
    })

    it('should construct correct file path', async () => {
      const mockConfig = createMockTasklistConfig({ id: 'test' })
      readFile.mockResolvedValue('content')
      parse.mockReturnValue(mockConfig)

      await loadTasklistConfig('adding-value')

      expect(readFile).toHaveBeenCalledWith(
        expect.stringContaining('adding-value-tasklist.yaml'),
        'utf8'
      )
    })

    it('should throw error when file cannot be read', async () => {
      const fileError = new Error('File not found')
      readFile.mockRejectedValue(fileError)

      await expect(loadTasklistConfig(mockTasklistId)).rejects.toThrow(
        `Failed to load tasklist config for 'test-tasklist': File not found`
      )
    })

    it('should throw error when YAML parsing fails', async () => {
      const parseError = new Error('Invalid YAML')
      readFile.mockResolvedValue('invalid yaml content')
      parse.mockImplementation(() => {
        throw parseError
      })

      await expect(loadTasklistConfig(mockTasklistId)).rejects.toThrow(
        `Failed to load tasklist config for 'test-tasklist': Invalid YAML`
      )
    })

    it('should handle empty tasklist ID', async () => {
      const mockConfig = createMockTasklistConfig({ id: 'empty' })
      readFile.mockResolvedValue('content')
      parse.mockReturnValue(mockConfig)

      await loadTasklistConfig('')

      expect(readFile).toHaveBeenCalledWith(
        expect.stringContaining('-tasklist.yaml'),
        'utf8'
      )
    })
  })

  describe('validateTasklistConfig', () => {
    let validConfig

    beforeEach(() => {
      validConfig = createValidTasklistConfig()
    })

    it('should return true for valid config', () => {
      const result = validateTasklistConfig(validConfig)
      expect(result).toBe(true)
    })

    it('should throw error when tasklist root element is missing', () => {
      const invalidConfig = createTasklistConfigWithoutRoot()

      expect(() => validateTasklistConfig(invalidConfig)).toThrow(
        'Missing tasklist root element in config'
      )
    })

    it('should throw error when tasklist id is missing', () => {
      const invalidConfig = createTasklistConfigMissingField('id')

      expect(() => validateTasklistConfig(invalidConfig)).toThrow(
        'Tasklist config must have an id'
      )
    })

    it('should throw error when tasklist title is missing', () => {
      const invalidConfig = createTasklistConfigMissingField('title')

      expect(() => validateTasklistConfig(invalidConfig)).toThrow(
        'Tasklist config must have a title'
      )
    })

    it('should throw error when sections are missing', () => {
      const invalidConfig = createTasklistConfigMissingField('sections', {
        id: 'test-tasklist',
        title: 'Test Tasklist'
      })

      expect(() => validateTasklistConfig(invalidConfig)).toThrow(
        'Tasklist config must have sections array'
      )
    })

    it('should throw error when sections is not an array', () => {
      const invalidConfig = {
        tasklist: {
          id: 'test-tasklist',
          title: 'Test Tasklist',
          sections: 'not an array'
        }
      }

      expect(() => validateTasklistConfig(invalidConfig)).toThrow(
        'Tasklist config must have sections array'
      )
    })

    it('should throw error when section id is missing', () => {
      const invalidConfig = createValidTasklistConfig({
        sections: [createSectionConfig({ id: undefined })]
      })

      expect(() => validateTasklistConfig(invalidConfig)).toThrow(
        'Section at index 0 must have an id'
      )
    })

    it('should throw error when section title is missing', () => {
      const invalidConfig = createValidTasklistConfig({
        sections: [createSectionConfig({ title: undefined })]
      })

      expect(() => validateTasklistConfig(invalidConfig)).toThrow(
        "Section 'section1' must have a title"
      )
    })

    it('should throw error when section subsections are missing', () => {
      const invalidConfig = createValidTasklistConfig({
        sections: [createSectionConfig({ subsections: undefined })]
      })

      expect(() => validateTasklistConfig(invalidConfig)).toThrow(
        "Section 'section1' must have subsections array"
      )
    })

    it('should throw error when section subsections is not an array', () => {
      const invalidConfig = createValidTasklistConfig({
        sections: [createSectionConfig({ subsections: 'not an array' })]
      })

      expect(() => validateTasklistConfig(invalidConfig)).toThrow(
        "Section 'section1' must have subsections array"
      )
    })

    it('should throw error when subsection id is missing', () => {
      const invalidConfig = createValidTasklistConfig({
        sections: [
          createSectionConfig({
            subsections: [createSubsectionConfig({ id: undefined })]
          })
        ]
      })

      expect(() => validateTasklistConfig(invalidConfig)).toThrow(
        "Subsection at index 0 in section 'section1' must have an id"
      )
    })

    it('should throw error when subsection title is missing', () => {
      const invalidConfig = createValidTasklistConfig({
        sections: [
          createSectionConfig({
            subsections: [createSubsectionConfig({ title: undefined })]
          })
        ]
      })

      expect(() => validateTasklistConfig(invalidConfig)).toThrow(
        "Subsection 'subsection1' must have a title"
      )
    })

    it('should validate multiple sections and subsections', () => {
      const multiSectionConfig = createValidTasklistConfig({
        sections: [
          createSectionConfig({
            subsections: [
              createSubsectionConfig(),
              createSubsectionConfig({
                id: 'subsection2',
                title: 'Subsection 2'
              })
            ]
          }),
          createSectionConfig({
            id: 'section2',
            title: 'Section 2',
            subsections: [
              createSubsectionConfig({
                id: 'subsection3',
                title: 'Subsection 3'
              })
            ]
          })
        ]
      })

      const result = validateTasklistConfig(multiSectionConfig)
      expect(result).toBe(true)
    })

    it('should handle empty sections array', () => {
      const emptyConfig = createValidTasklistConfig({ sections: [] })

      const result = validateTasklistConfig(emptyConfig)
      expect(result).toBe(true)
    })

    it('should handle empty subsections array', () => {
      const emptySubsectionsConfig = createValidTasklistConfig({
        sections: [createSectionConfig()]
      })

      const result = validateTasklistConfig(emptySubsectionsConfig)
      expect(result).toBe(true)
    })

    it('should provide detailed error messages with indices', () => {
      const invalidConfig = createValidTasklistConfig({
        sections: [
          createSectionConfig({
            subsections: [
              createSubsectionConfig(),
              createSubsectionConfig({ id: 'subsection2', title: undefined })
            ]
          })
        ]
      })

      expect(() => validateTasklistConfig(invalidConfig)).toThrow(
        "Subsection 'subsection2' must have a title"
      )
    })

    it('should provide error message with section index when section id is missing', () => {
      const invalidConfig = createValidTasklistConfig({
        sections: [
          createSectionConfig(),
          createSectionConfig({ id: undefined, title: 'Section 2' })
        ]
      })

      expect(() => validateTasklistConfig(invalidConfig)).toThrow(
        'Section at index 1 must have an id'
      )
    })

    it('should provide error message with subsection index when subsection id is missing', () => {
      const invalidConfig = createValidTasklistConfig({
        sections: [
          createSectionConfig({
            subsections: [
              createSubsectionConfig(),
              createSubsectionConfig({ id: undefined, title: 'Subsection 2' })
            ]
          })
        ]
      })

      expect(() => validateTasklistConfig(invalidConfig)).toThrow(
        "Subsection at index 1 in section 'section1' must have an id"
      )
    })
  })

  describe('integration tests', () => {
    it('should load and validate a complete config successfully', async () => {
      const completeYamlContent = `
tasklist:
  id: adding-value
  title: Adding Value Grant Application
  closingDate: "31 December 2024"
  helpText: "Complete all sections to submit your application"
  sections:
    - id: section1
      title: "Eligibility and business details"
      subsections:
        - id: who-is-applying
          title: "Who is applying"
        - id: applicant-details
          title: "Applicant details"
    - id: section2
      title: "Project details"
      subsections:
        - id: project-summary
          title: "Project summary"
        - id: business-details
          title: "Business details"
`

      const expectedConfig = createValidTasklistConfig({
        id: 'adding-value',
        title: 'Adding Value Grant Application',
        closingDate: '31 December 2024',
        helpText: 'Complete all sections to submit your application',
        sections: [
          createSectionConfig({
            id: 'section1',
            title: 'Eligibility and business details',
            subsections: [
              createSubsectionConfig({
                id: 'who-is-applying',
                title: 'Who is applying'
              }),
              createSubsectionConfig({
                id: 'applicant-details',
                title: 'Applicant details'
              })
            ]
          }),
          createSectionConfig({
            id: 'section2',
            title: 'Project details',
            subsections: [
              createSubsectionConfig({
                id: 'project-summary',
                title: 'Project summary'
              }),
              createSubsectionConfig({
                id: 'business-details',
                title: 'Business details'
              })
            ]
          })
        ]
      })

      readFile.mockResolvedValue(completeYamlContent)
      parse.mockReturnValue(expectedConfig)

      const loadedConfig = await loadTasklistConfig('adding-value')
      const isValid = validateTasklistConfig(loadedConfig)

      expect(loadedConfig).toEqual(expectedConfig)
      expect(isValid).toBe(true)
    })

    it('should handle loading and validation errors in sequence', async () => {
      readFile.mockRejectedValue(new Error('File not found'))

      await expect(loadTasklistConfig('nonexistent')).rejects.toThrow(
        "Failed to load tasklist config for 'nonexistent': File not found"
      )

      const invalidYaml = 'invalid: yaml: content:'
      const invalidConfig = createTasklistConfigWithoutRoot({
        invalid: 'config'
      })

      readFile.mockResolvedValue(invalidYaml)
      parse.mockReturnValue(invalidConfig)

      const loadedInvalidConfig = await loadTasklistConfig('invalid')

      expect(() => validateTasklistConfig(loadedInvalidConfig)).toThrow(
        'Missing tasklist root element in config'
      )
    })
  })
})
