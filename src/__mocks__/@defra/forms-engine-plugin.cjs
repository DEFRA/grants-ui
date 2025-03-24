// __mocks__/@defra/forms-engine-plugin.cjs
const plugin = {
  // Add mock implementations of the methods you use from the plugin
  name: 'forms-engine-plugin',
  register: jest.fn()
  // Add other methods as needed
}

// Use CommonJS export syntax since this is a .cjs file
module.exports = plugin
