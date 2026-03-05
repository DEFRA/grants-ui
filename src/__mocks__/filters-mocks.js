import { vi } from 'vitest'

export const mockFilters = () => ({
  formatCurrency: vi.fn((value) => `£${value.toFixed(2)}`)
})
