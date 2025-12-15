import { describe, it, expect } from 'vitest'
import { processDisplayFields, processSections } from './display-field-processor.js'

describe('processDisplayFields', () => {
  const mockRequest = {
    auth: {
      credentials: {
        sbi: '123456789',
        crn: '1234567890'
      }
    }
  }

  const mockMappedData = {
    customer: {
      name: {
        first: 'John',
        middle: 'William',
        last: 'Smith'
      }
    },
    business: {
      name: 'Smith Farms Ltd',
      address: {
        line1: '123 Farm Road',
        city: 'Manchester',
        postalCode: 'M1 1AA'
      },
      phone: {
        mobile: '07123456789'
      },
      email: {
        address: 'john@smithfarms.com'
      },
      type: {
        type: 'Limited Company'
      },
      vat: 'GB123456789'
    },
    countyParishHoldings: '12/345/6789'
  }

  describe('basic field processing', () => {
    it.each([
      [
        'simple text field',
        [{ label: 'Business name', sourcePath: 'business.name' }],
        { key: { text: 'Business name' }, value: { text: 'Smith Farms Ltd' } }
      ],
      [
        'fullName format',
        [{ label: 'Name', sourcePath: 'customer.name', format: 'fullName' }],
        { key: { text: 'Name' }, value: { text: 'John William Smith' } }
      ],
      [
        'address format',
        [{ label: 'Address', sourcePath: 'business.address', format: 'address' }],
        { key: { text: 'Address' }, value: { html: '123 Farm Road<br/>Manchester<br/>M1 1AA' } }
      ]
    ])('should process %s', (_description, config, expected) => {
      const result = processDisplayFields(config, mockMappedData, mockRequest)

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]).toEqual(expected)
    })

    it('should process contactDetails format with multiple sourcePaths', () => {
      const config = [
        {
          label: 'Contact details',
          sourcePaths: ['business.phone.mobile', 'business.email.address'],
          format: 'contactDetails'
        }
      ]

      const result = processDisplayFields(config, mockMappedData, mockRequest)

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].key).toEqual({ text: 'Contact details' })
      expect(result.rows[0].value.html).toContain('john@smithfarms.com')
    })
  })

  describe('sourceType handling', () => {
    it('should resolve from credentials when sourceType is "credentials"', () => {
      const config = [{ label: 'SBI number', sourcePath: 'sbi', sourceType: 'credentials' }]

      const result = processDisplayFields(config, mockMappedData, mockRequest)

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]).toEqual({
        key: { text: 'SBI number' },
        value: { text: '123456789' }
      })
    })

    it('should default to data source when sourceType not specified', () => {
      const config = [{ label: 'Business name', sourcePath: 'business.name' }]

      const result = processDisplayFields(config, mockMappedData, mockRequest)

      expect(result.rows[0].value).toEqual({ text: 'Smith Farms Ltd' })
    })
  })

  describe('empty value handling', () => {
    it('should filter out empty values by default', () => {
      const config = [
        { label: 'Business name', sourcePath: 'business.name' },
        { label: 'Missing field', sourcePath: 'nonexistent.path' },
        { label: 'VAT number', sourcePath: 'business.vat' }
      ]

      const result = processDisplayFields(config, mockMappedData, mockRequest)

      expect(result.rows).toHaveLength(2)
      expect(result.rows[0].key.text).toBe('Business name')
      expect(result.rows[1].key.text).toBe('VAT number')
    })

    it('should include empty values when hideIfEmpty is false', () => {
      const config = [{ label: 'Missing field', sourcePath: 'nonexistent.path', hideIfEmpty: false }]

      const result = processDisplayFields(config, mockMappedData, mockRequest)

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]).toEqual({
        key: { text: 'Missing field' },
        value: { text: '' }
      })
    })
  })

  describe('field ordering', () => {
    it('should preserve field order from config', () => {
      const config = [
        { label: 'Name', sourcePath: 'customer.name', format: 'fullName' },
        { label: 'Business name', sourcePath: 'business.name' },
        { label: 'SBI number', sourcePath: 'sbi', sourceType: 'credentials' },
        { label: 'Address', sourcePath: 'business.address', format: 'address' }
      ]

      const result = processDisplayFields(config, mockMappedData, mockRequest)

      expect(result.rows).toHaveLength(4)
      expect(result.rows[0].key.text).toBe('Name')
      expect(result.rows[1].key.text).toBe('Business name')
      expect(result.rows[2].key.text).toBe('SBI number')
      expect(result.rows[3].key.text).toBe('Address')
    })
  })

  describe('edge cases', () => {
    it.each([null, undefined, []])('should return empty rows array for %s config', (config) => {
      const result = processDisplayFields(config, mockMappedData, mockRequest)
      expect(result).toEqual({ rows: [] })
    })

    it('should handle null mapped data gracefully', () => {
      const config = [{ label: 'Business name', sourcePath: 'business.name' }]

      const result = processDisplayFields(config, null, mockRequest)

      expect(result.rows).toHaveLength(0)
    })

    it('should handle missing credentials gracefully', () => {
      const config = [{ label: 'SBI number', sourcePath: 'sbi', sourceType: 'credentials' }]
      const requestWithoutCredentials = { auth: {} }

      const result = processDisplayFields(config, mockMappedData, requestWithoutCredentials)

      expect(result.rows).toHaveLength(0)
    })

    it('should handle null/undefined sourcePath gracefully', () => {
      const config = [{ label: 'Missing path', sourcePath: null }]

      const result = processDisplayFields(config, mockMappedData, mockRequest)

      expect(result.rows).toHaveLength(0)
    })

    it('should handle null/undefined values in sourcePaths array gracefully', () => {
      const config = [
        {
          label: 'Contact details',
          sourcePaths: [null, 'business.email.address'],
          format: 'contactDetails'
        }
      ]

      const result = processDisplayFields(config, mockMappedData, mockRequest)

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].value.html).toContain('john@smithfarms.com')
    })
  })

  describe('full methane config example', () => {
    it('should process complete methane displayFields config', () => {
      const methaneConfig = [
        { label: 'Name', sourcePath: 'customer.name', format: 'fullName' },
        { label: 'Business name', sourcePath: 'business.name' },
        { label: 'SBI number', sourceType: 'credentials', sourcePath: 'sbi' },
        {
          label: 'Contact details',
          sourcePaths: ['business.phone.mobile', 'business.email.address'],
          format: 'contactDetails'
        },
        { label: 'Address', sourcePath: 'business.address', format: 'address' },
        { label: 'Type', sourcePath: 'business.type.type' },
        { label: 'County Parish Holdings', sourcePath: 'countyParishHoldings' },
        { label: 'VAT number', sourcePath: 'business.vat' }
      ]

      const result = processDisplayFields(methaneConfig, mockMappedData, mockRequest)

      expect(result.rows).toHaveLength(8)

      const labels = result.rows.map((row) => row.key.text)
      expect(labels).toEqual([
        'Name',
        'Business name',
        'SBI number',
        'Contact details',
        'Address',
        'Type',
        'County Parish Holdings',
        'VAT number'
      ])
    })
  })
})

describe('processSections', () => {
  const mockRequest = {
    auth: {
      credentials: {
        sbi: '123456789',
        crn: '1234567890'
      }
    }
  }

  const mockMappedData = {
    customer: {
      name: {
        first: 'John',
        middle: 'William',
        last: 'Smith'
      }
    },
    business: {
      name: 'Smith Farms Ltd',
      address: {
        line1: '123 Farm Road',
        city: 'Manchester',
        postalCode: 'M1 1AA'
      },
      phone: {
        mobile: '07123456789'
      },
      email: {
        address: 'john@smithfarms.com'
      },
      type: {
        type: 'Limited Company'
      },
      vat: 'GB123456789'
    },
    countyParishHoldings: '12/345/6789'
  }

  describe('basic section processing', () => {
    it('should process a single section with fields', () => {
      const sectionsConfig = [
        {
          title: 'Applicant details',
          fields: [{ label: 'Applicant name', sourcePath: 'customer.name', format: 'fullName' }]
        }
      ]

      const result = processSections(sectionsConfig, mockMappedData, mockRequest)

      expect(result).toHaveLength(1)
      expect(result[0].title).toEqual({ text: 'Applicant details' })
      expect(result[0].summaryList.rows).toHaveLength(1)
      expect(result[0].summaryList.rows[0].key.text).toBe('Applicant name')
    })

    it('should process multiple sections', () => {
      const sectionsConfig = [
        {
          title: 'Applicant details',
          fields: [{ label: 'Applicant name', sourcePath: 'customer.name', format: 'fullName' }]
        },
        {
          title: 'Organisation details',
          fields: [
            { label: 'Organisation name', sourcePath: 'business.name' },
            { label: 'SBI number', sourceType: 'credentials', sourcePath: 'sbi' }
          ]
        }
      ]

      const result = processSections(sectionsConfig, mockMappedData, mockRequest)

      expect(result).toHaveLength(2)
      expect(result[0].title.text).toBe('Applicant details')
      expect(result[1].title.text).toBe('Organisation details')
      expect(result[1].summaryList.rows).toHaveLength(2)
    })

    it('should include description when provided', () => {
      const sectionsConfig = [
        {
          title: 'Organisation details',
          description: 'If your application is successful, the following organisation will receive the grant.',
          fields: [{ label: 'Organisation name', sourcePath: 'business.name' }]
        }
      ]

      const result = processSections(sectionsConfig, mockMappedData, mockRequest)

      expect(result).toHaveLength(1)
      expect(result[0].description).toBe(
        'If your application is successful, the following organisation will receive the grant.'
      )
    })

    it('should not include description when not provided', () => {
      const sectionsConfig = [
        {
          title: 'Applicant details',
          fields: [{ label: 'Applicant name', sourcePath: 'customer.name', format: 'fullName' }]
        }
      ]

      const result = processSections(sectionsConfig, mockMappedData, mockRequest)

      expect(result[0]).not.toHaveProperty('description')
    })
  })

  describe('empty section handling', () => {
    it('should filter out sections with no visible rows', () => {
      const sectionsConfig = [
        {
          title: 'Empty section',
          fields: [{ label: 'Missing field', sourcePath: 'nonexistent.path' }]
        },
        {
          title: 'Valid section',
          fields: [{ label: 'Business name', sourcePath: 'business.name' }]
        }
      ]

      const result = processSections(sectionsConfig, mockMappedData, mockRequest)

      expect(result).toHaveLength(1)
      expect(result[0].title.text).toBe('Valid section')
    })

    it('should handle sections with empty fields array', () => {
      const sectionsConfig = [
        {
          title: 'Empty fields',
          fields: []
        },
        {
          title: 'Valid section',
          fields: [{ label: 'Business name', sourcePath: 'business.name' }]
        }
      ]

      const result = processSections(sectionsConfig, mockMappedData, mockRequest)

      expect(result).toHaveLength(1)
      expect(result[0].title.text).toBe('Valid section')
    })

    it('should handle sections with missing fields property', () => {
      const sectionsConfig = [
        {
          title: 'No fields property'
        },
        {
          title: 'Valid section',
          fields: [{ label: 'Business name', sourcePath: 'business.name' }]
        }
      ]

      const result = processSections(sectionsConfig, mockMappedData, mockRequest)

      expect(result).toHaveLength(1)
      expect(result[0].title.text).toBe('Valid section')
    })
  })

  describe('edge cases', () => {
    it.each([null, undefined, []])('should return empty array for %s config', (config) => {
      const result = processSections(config, mockMappedData, mockRequest)
      expect(result).toEqual([])
    })

    it('should handle empty sections array', () => {
      const result = processSections([], mockMappedData, mockRequest)
      expect(result).toEqual([])
    })
  })

  describe('full methane sections config example', () => {
    it('should process complete methane displaySections config', () => {
      const methaneSectionsConfig = [
        {
          title: 'Applicant details',
          fields: [{ label: 'Applicant name', sourcePath: 'customer.name', format: 'fullName' }]
        },
        {
          title: 'Organisation details',
          description: 'If your application is successful, the following organisation will receive the grant.',
          fields: [
            { label: 'Organisation name', sourcePath: 'business.name' },
            { label: 'Single Business Identifier (SBI) number', sourceType: 'credentials', sourcePath: 'sbi' },
            { label: 'Organisation email', sourcePath: 'business.email.address' },
            { label: 'Mobile phone number', sourcePath: 'business.phone.mobile' },
            { label: 'Organisation address', sourcePath: 'business.address', format: 'address' },
            { label: 'VAT registration number', sourcePath: 'business.vat' }
          ]
        },
        {
          title: 'County parish holding (CPH) numbers',
          fields: [{ label: 'CPH number', sourcePath: 'countyParishHoldings' }]
        }
      ]

      const result = processSections(methaneSectionsConfig, mockMappedData, mockRequest)

      expect(result).toHaveLength(3)

      const sectionTitles = result.map((section) => section.title.text)
      expect(sectionTitles).toEqual([
        'Applicant details',
        'Organisation details',
        'County parish holding (CPH) numbers'
      ])

      expect(result[0].summaryList.rows).toHaveLength(1)
      expect(result[1].summaryList.rows).toHaveLength(6)
      expect(result[1].description).toBe(
        'If your application is successful, the following organisation will receive the grant.'
      )
      expect(result[2].summaryList.rows).toHaveLength(1)
    })
  })
})
