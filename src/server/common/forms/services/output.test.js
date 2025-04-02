import { outputService } from './output.js'

describe('outputService', () => {
  test('submit resolves', async () => {
    await expect(outputService.submit()).resolves.toBeUndefined()
  })
})
