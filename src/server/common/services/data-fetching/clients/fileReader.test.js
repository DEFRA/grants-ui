import { describe, expect, it, vi, beforeEach } from 'vitest'
import { FileReaderClient } from './fileReader.client'

// Import after mocking
import fs from 'node:fs/promises'

// Mock the fs/promises module
vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn()
  },
  readFile: vi.fn()
}))

describe('FileReaderClient', () => {
  const client = new FileReaderClient()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return file content when query is a valid string', async () => {
    const mockData = 'File content'
    fs.readFile.mockResolvedValue(mockData)

    const result = await client.fetch({ query: '/path/to/file.txt' })

    expect(fs.readFile).toHaveBeenCalledWith('/path/to/file.txt', 'utf8')
    expect(result).toEqual({ data: mockData })
  })

  it('should reject with error when query is not a string', async () => {
    await expect(client.fetch({ query: 123 })).rejects.toThrow(
      'For a fileReader client, query must be a string representing the file path'
    )
  })

  it('should format the response if formatResponse function is provided', async () => {
    const mockData = 'File content'
    const mockFormatter = vi.fn().mockReturnValue({ formatted: true })
    fs.readFile.mockResolvedValue(mockData)

    const result = await client.fetch({
      query: '/path/to/file.txt',
      formatResponse: mockFormatter
    })

    expect(mockFormatter).toHaveBeenCalledWith({ data: mockData })
    expect(result).toEqual({ formatted: true })
  })

  it('should reject with error when file reading fails', async () => {
    const mockError = new Error('File not found')
    fs.readFile.mockRejectedValue(mockError)

    await expect(client.fetch({ query: '/path/to/nonexistent.txt' })).rejects.toEqual(mockError)
  })
})
