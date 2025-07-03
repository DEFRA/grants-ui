jest.mock('@defra/forms-engine-plugin/shared.js', () => ({
  initAll: jest.fn()
}))

describe('#application', () => {
  test('calls initAll on all components', async () => {
    await import('./application.js')
    const { initAll } = await import('@defra/forms-engine-plugin/shared.js')

    expect(initAll).toHaveBeenCalledTimes(1)
  })
})
