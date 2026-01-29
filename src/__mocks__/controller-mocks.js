import { vi } from 'vitest'

export const setupControllerMocks = (controller, { proceed = 'redirected', nextPath = '/next-path' } = {}) => {
  controller.proceed = vi.fn().mockResolvedValue(proceed)
  controller.getNextPath = vi.fn().mockReturnValue(nextPath)
  controller.setState = vi.fn()
}
