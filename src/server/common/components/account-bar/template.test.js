import { createComponentRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderAccountBar = createComponentRenderer(import.meta.url, 'defraAccountBar')

describe('Account Bar Component', () => {
  test('renders the SBI from the precise sbi parameter without changing display text', () => {
    const $accountBar = renderAccountBar({
      organisationName: 'Test Farm',
      sbi: '106284736',
      name: 'John Doe'
    })

    expect($accountBar('.defra-account-bar').text()).toContain('Test Farm')
    expect($accountBar('.defra-account-bar').text()).toContain('Single business identifier (SBI): 106284736')
    expect($accountBar('.defra-account-bar').text()).toContain('John Doe')
  })
})
