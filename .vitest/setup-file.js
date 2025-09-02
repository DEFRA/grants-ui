import { vi } from 'vitest'

vi.mock('@defra/forms-engine-plugin')
vi.mock('@defra/forms-model')
vi.mock('@hapi/h2o2', () => ({
  plugin: { name: 'h2o2', register: vi.fn() }
}))

// Set up global fetch if needed
global.fetch = globalThis.fetch || vi.fn()