import { DISPLAY_ONLY_TYPES } from '~/src/server/common/helpers/print-application-service/constants.js'

export const MOCK_DISPLAY_ONLY_COMPONENTS = [...DISPLAY_ONLY_TYPES].map((type) => ({
  type,
  name: `${type[0].toLowerCase()}${type.slice(1)}Comp`,
  title: `${type} component`
}))

export const MOCK_FORM_ENTRIES = {
  testForm: { id: 'form1', slug: 'test-form', title: 'Test Form' },
  anotherForm: { id: 'form2', slug: 'another-form', title: 'Another Form' },
  exampleGrant: { id: 'form3', slug: 'example-grant', title: 'Example Grant' },
  flyingPigs: { id: 'form4', slug: 'flying-pigs', title: 'Flying Pigs Grant' }
}

export const MOCK_FORM_CACHE = Object.values(MOCK_FORM_ENTRIES)

export const MOCK_FORM_CACHE_SUBSET = [MOCK_FORM_ENTRIES.exampleGrant, MOCK_FORM_ENTRIES.flyingPigs]

export const MOCK_FORM_WITH_PATH = {
  slug: 'test-form',
  title: 'Test Form',
  path: '/path/to/test-form.yaml'
}

export const MOCK_SINGLE_PAGE_DEFINITION = {
  pages: [
    {
      title: 'Page 1',
      components: [{ name: 'field1', type: 'TextField', title: 'Field One' }]
    }
  ]
}
