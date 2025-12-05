import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parse } from 'yaml'
import { buildGraphQLQuery, mapResponse } from './index.js'

const loadYaml = (filename) => parse(readFileSync(resolve(import.meta.dirname, '__fixtures__', filename), 'utf8'))

const simpleConfig = loadYaml('simple-query.yaml')
const fullConfig = loadYaml('full-query.yaml')

const createMockRequest = (crn, sbi) => ({
  auth: {
    credentials: { crn, sbi }
  }
})

const createMockApiResponse = (businessInfo, countyParishHoldings, customerInfo) => ({
  data: {
    business: {
      info: businessInfo,
      countyParishHoldings
    },
    customer: {
      info: customerInfo
    }
  }
})

describe('Details Page Utilities', () => {
  describe('buildGraphQLQuery', () => {
    it('should build a GraphQL query from YAML config', () => {
      const result = buildGraphQLQuery(
        simpleConfig.metadata.detailsPage.query,
        createMockRequest('CRN123456', '106284736')
      )

      const expectedQuery = `query Business {
  customer(crn: "CRN123456") {
    info {
      name {
        first
        last
      }
    }
  }
  business(sbi: "106284736") {
    info {
      name
      reference
    }
  }
}`

      expect(result).toBe(expectedQuery)
    })

    it('should produce query matching fetchBusinessAndCPH', () => {
      const result = buildGraphQLQuery(fullConfig.metadata.detailsPage.query, createMockRequest('CRN123', '123456789'))

      const expectedQuery = `query Business {
  customer(crn: "CRN123") {
    info {
      name {
        title
        first
        middle
        last
      }
    }
  }
  business(sbi: "123456789") {
    info {
      reference
      email {
        address
      }
      phone {
        mobile
      }
      name
      address {
        line1
        line2
        line3
        line4
        line5
        street
        city
        postalCode
      }
      vat
      type {
        code
        type
      }
    }
    countyParishHoldings {
      cphNumber
    }
  }
}`

      expect(result).toBe(expectedQuery)
    })
  })

  describe('mapResponse', () => {
    it('should map API response using simple path-to-key mappings', () => {
      const apiResponse = createMockApiResponse(
        {
          name: 'Test Farm',
          reference: 'REF123',
          email: { address: 'test@example.com' },
          phone: { mobile: '07123456789' },
          address: { line1: '123 Farm Road', city: 'Farmville', postalCode: 'FA1 1RM' },
          vat: 'GB123456789',
          type: { code: 'LTD', type: 'Limited Company' }
        },
        [{ cphNumber: '12/345/6789' }, { cphNumber: '98/765/4321' }],
        { name: { first: 'John', middle: 'A', last: 'Farmer' } }
      )

      const result = mapResponse(fullConfig.metadata.detailsPage.responseMapping, apiResponse)

      expect(result).toEqual({
        business: apiResponse.data.business.info,
        countyParishHoldings: '12/345/6789',
        customer: apiResponse.data.customer.info
      })
    })

    it('should handle missing paths gracefully', () => {
      const responseMapping = {
        business: 'data.business.info',
        customer: 'data.customer.info',
        missingField: 'data.nonexistent.path'
      }

      const apiResponse = {
        data: {
          business: { info: { name: 'Test' } }
        }
      }

      const result = mapResponse(responseMapping, apiResponse)

      expect(result).toEqual({
        business: { name: 'Test' },
        customer: undefined,
        missingField: undefined
      })
    })

    it('should handle array index notation', () => {
      const responseMapping = {
        firstItem: 'items[0].name',
        secondItem: 'items[1].name'
      }

      const apiResponse = {
        items: [{ name: 'First' }, { name: 'Second' }, { name: 'Third' }]
      }

      const result = mapResponse(responseMapping, apiResponse)

      expect(result).toEqual({
        firstItem: 'First',
        secondItem: 'Second'
      })
    })
  })

  describe('integration: YAML config produces correct output', () => {
    it('should produce the same result as fetchBusinessAndCPH formatResponse', () => {
      const apiResponse = createMockApiResponse(
        {
          name: 'Smith Family Farm',
          reference: 'SBI123456789',
          email: { address: 'smith@farm.co.uk' },
          phone: { mobile: '07700900000' },
          address: { line1: 'The Farmhouse', line2: 'Farm Lane', city: 'Rural Town', postalCode: 'RT1 2AB' },
          vat: 'GB987654321',
          type: { code: 'SOLE', type: 'Sole Trader' }
        },
        [{ cphNumber: '50/123/4567' }],
        { name: { title: 'Mr', first: 'James', middle: '', last: 'Smith' } }
      )

      const result = mapResponse(fullConfig.metadata.detailsPage.responseMapping, apiResponse)

      expect(result).toEqual({
        business: apiResponse.data.business.info,
        countyParishHoldings: '50/123/4567',
        customer: apiResponse.data.customer.info
      })
    })
  })
})
