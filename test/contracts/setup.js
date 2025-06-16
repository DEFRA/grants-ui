import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { promises as fs } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')

// Ensure pacts directory exists
const pactsDir = resolve(__dirname, '../pacts')
const logsDir = resolve(__dirname, '../logs')

try {
  await fs.mkdir(pactsDir, { recursive: true })
  await fs.mkdir(logsDir, { recursive: true })
} catch (error) {
  // Directories may already exist
}

// Setup global test utilities
global.testConfig = {
  pactsDir,
  logsDir
}