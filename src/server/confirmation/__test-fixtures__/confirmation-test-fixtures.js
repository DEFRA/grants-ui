import { MOCK_FORM_ENTRIES } from '~/src/__test-fixtures__/mock-forms-cache.js'

export const MOCK_FORMS = {
  basic: {
    id: 'test-form-id',
    slug: 'test-slug',
    title: 'Test Form'
  },
  exampleGrant: {
    id: 'example-grant-id',
    slug: 'example-grant-with-auth',
    title: 'Example Grant with Auth'
  },
  flyingPigs: {
    id: 'flying-pigs-id',
    slug: 'flying-pigs',
    title: 'Flying Pigs Grant'
  }
}

export const MOCK_CONFIRMATION_CONTENT = {
  basic: {
    html: '<h2>Test confirmation content</h2>'
  },
  detailed: {
    html: '<h2 class="govuk-heading-m">What happens next</h2><p class="govuk-body">Detailed confirmation content</p>'
  },
  empty: {},
  withText: {
    text: 'Test text confirmation'
  }
}

export const MOCK_FORM_CACHE = [
  { ...MOCK_FORM_ENTRIES.testForm, metadata: { confirmationContent: MOCK_CONFIRMATION_CONTENT.basic } },
  MOCK_FORM_ENTRIES.anotherForm,
  MOCK_FORM_ENTRIES.exampleGrant
]
