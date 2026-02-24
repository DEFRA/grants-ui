import { vi } from 'vitest'

export const mockReadFile = vi.fn()

vi.mock('node:fs/promises', () => ({
  default: { readFile: mockReadFile },
  readFile: mockReadFile
}))

vi.mock('yaml', () => ({
  parse: vi.fn((raw) => JSON.parse(raw))
}))
