import { vi } from 'vitest'

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
  },
  addingValue: {
    id: 'adding-value-id',
    slug: 'adding-value',
    title: 'Adding Value Grant'
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
  {
    id: 'form1',
    slug: 'test-form',
    title: 'Test Form',
    metadata: { confirmationContent: MOCK_CONFIRMATION_CONTENT.basic }
  },
  { id: 'form2', slug: 'another-form', title: 'Another Form' },
  { id: 'form3', slug: 'example-grant', title: 'Example Grant' }
]

export function createMockLogger() {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}
