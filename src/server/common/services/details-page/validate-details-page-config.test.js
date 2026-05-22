import { describe, it, expect } from 'vitest'
import { validateDetailsPageConfig } from './validate-details-page-config.js'

const baseQuery = {
  name: 'Business',
  entities: [
    {
      name: 'customer',
      variableName: 'crn',
      variableSource: 'credentials.crn',
      fields: [
        {
          path: 'info',
          fields: [
            {
              path: 'name',
              fields: [{ path: 'title' }, { path: 'first' }, { path: 'middle' }, { path: 'last' }]
            }
          ]
        }
      ]
    },
    {
      name: 'business',
      variableName: 'sbi',
      variableSource: 'credentials.sbi',
      fields: [
        {
          path: 'info',
          fields: [
            { path: 'name' },
            { path: 'reference' },
            { path: 'email', fields: [{ path: 'address' }] },
            { path: 'phone', fields: [{ path: 'mobile' }, { path: 'landline' }] },
            {
              path: 'address',
              fields: [
                { path: 'line1' },
                { path: 'line2' },
                { path: 'line3' },
                { path: 'line4' },
                { path: 'line5' },
                { path: 'street' },
                { path: 'city' },
                { path: 'postalCode' },
                { path: 'uprn' },
                { path: 'county' },
                { path: 'buildingName' },
                { path: 'buildingNumberRange' },
                { path: 'dependentLocality' },
                { path: 'doubleDependentLocality' },
                { path: 'flatName' },
                { path: 'pafOrganisationName' }
              ]
            },
            { path: 'vat' }
          ]
        },
        {
          path: 'countyParishHoldings',
          fields: [{ path: 'cphNumber' }]
        }
      ]
    }
  ]
}

const baseResponseMapping = {
  business: 'data.business.info',
  countyParishHoldings: 'data.business.countyParishHoldings[0].cphNumber',
  customer: 'data.customer.info'
}

const baseDisplaySections = [
  {
    title: 'Applicant details',
    fields: [{ label: 'Applicant name', sourcePath: 'customer.name', format: 'fullName' }]
  },
  {
    title: 'Organisation details',
    fields: [
      { label: 'Organisation name', sourcePath: 'business.name' },
      { label: 'Single Business Identifier (SBI) number', sourceType: 'credentials', sourcePath: 'sbi' },
      { label: 'Business reference', sourcePath: 'business.reference' },
      { label: 'Organisation email', sourcePath: 'business.email.address' },
      { label: 'Mobile phone number', sourcePath: 'business.phone.mobile' },
      { label: 'Landline phone number', sourcePath: 'business.phone.landline' },
      { label: 'Organisation address', sourcePath: 'business.address', format: 'address' },
      { label: 'VAT registration number', sourcePath: 'business.vat' }
    ]
  },
  {
    title: 'County parish holding (CPH) numbers',
    fields: [{ label: 'CPH number', sourcePath: 'countyParishHoldings' }]
  }
]

describe('validateDetailsPageConfig', () => {
  it('passes when every DAL field is covered by a display sourcePath', () => {
    expect(() =>
      validateDetailsPageConfig({
        validateCoverage: true,
        query: baseQuery,
        responseMapping: baseResponseMapping,
        displaySections: baseDisplaySections
      })
    ).not.toThrow()
  })

  it('does nothing when validateCoverage is not set', () => {
    expect(() =>
      validateDetailsPageConfig({
        query: baseQuery,
        responseMapping: baseResponseMapping,
        displaySections: []
      })
    ).not.toThrow()
  })

  it('does nothing when there is no detailsPage config', () => {
    expect(() => validateDetailsPageConfig(undefined)).not.toThrow()
    expect(() => validateDetailsPageConfig({})).not.toThrow()
  })

  it('does nothing when the query has no entities or fields', () => {
    expect(() => validateDetailsPageConfig({ validateCoverage: true, query: {}, displaySections: [] })).not.toThrow()
    expect(() =>
      validateDetailsPageConfig({
        validateCoverage: true,
        query: { entities: [{ name: 'business' }] },
        displaySections: []
      })
    ).not.toThrow()
  })

  it('does not throw when displaySections contains sourcePaths not in the DAL query', () => {
    const displaySections = [
      ...baseDisplaySections,
      { title: 'Extras', fields: [{ label: 'Extra field', sourcePath: 'business.extra' }] }
    ]
    expect(() =>
      validateDetailsPageConfig({
        validateCoverage: true,
        query: baseQuery,
        responseMapping: baseResponseMapping,
        displaySections
      })
    ).not.toThrow()
  })

  it('throws when a DAL field has no matching sourcePath in displaySections', () => {
    const displaySections = baseDisplaySections.map((section) =>
      section.title === 'Organisation details'
        ? { ...section, fields: section.fields.filter((f) => f.sourcePath !== 'business.reference') }
        : section
    )
    expect(() =>
      validateDetailsPageConfig(
        { validateCoverage: true, query: baseQuery, responseMapping: baseResponseMapping, displaySections },
        'test-form'
      )
    ).toThrow(/queried but not displayed: business\.reference/)
  })

  it('reports all missing DAL fields in a single error', () => {
    expect(() =>
      validateDetailsPageConfig(
        { validateCoverage: true, query: baseQuery, responseMapping: baseResponseMapping, displaySections: [] },
        'test-form'
      )
    ).toThrow(/Invalid detailsPage configuration in form test-form: queried but not displayed: /)
  })
})
