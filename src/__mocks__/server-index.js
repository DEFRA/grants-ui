// Mock implementation for server/index.js
export const createServer = jest.fn().mockImplementation(() => {
  return {
    initialize: jest.fn().mockResolvedValue(true),
    stop: jest.fn().mockResolvedValue(true),
    inject: jest.fn().mockResolvedValue({
      result: '',
      statusCode: 200
    })
  }
})
