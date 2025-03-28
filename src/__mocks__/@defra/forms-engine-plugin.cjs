// Mock the entire plugin
const plugin = {
  name: 'forms-engine-plugin',
  register: jest.fn(),
  controllers: {}
}

// Mock any specific functions used by tests
plugin.createServer = jest.fn().mockImplementation(() => {
  return {
    initialize: jest.fn().mockResolvedValue(true),
    stop: jest.fn().mockResolvedValue(true),
    inject: jest.fn().mockResolvedValue({ result: '', statusCode: 200 })
  }
})

module.exports = plugin
