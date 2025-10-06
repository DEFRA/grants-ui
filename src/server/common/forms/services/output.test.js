import { outputService } from './output.js'

describe('outputService', () => {
  test('submit method returns empty object', async () => {
    const result = outputService.submit()
    expect(result).toEqual({})
  })
})
