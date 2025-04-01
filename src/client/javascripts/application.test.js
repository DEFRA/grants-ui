jest.mock('govuk-frontend', () => ({
  createAll: jest.fn(),
  Button: {},
  Checkboxes: {},
  ErrorSummary: {},
  Header: {},
  Radios: {},
  SkipLink: {}
}))

describe('#application', () => {
  test('calls createAll on all components', async () => {
    await import('./application.js')
    const { createAll } = await import('govuk-frontend')

    expect(createAll).toHaveBeenCalledTimes(6)
    expect(createAll).toHaveBeenCalledWith({})
  })
})
