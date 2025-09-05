import { outputService } from './output.js'

describe('outputService', () => {
  test('submit method returns empty object', async () => {
    const result = await outputService.submit()
    expect(result).toEqual({})
  })

  test('submit method returns a promise', () => {
    const result = outputService.submit()
    expect(result).toBeInstanceOf(Promise)
  })
})
