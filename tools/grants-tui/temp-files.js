import * as fs from 'node:fs'

// Temp files created this session — cleaned up on exit
const _tempFiles = []
process.on('exit', () => {
  for (const f of _tempFiles) {
    try {
      fs.unlinkSync(f)
    } catch {
      /* ignore */
    }
  }
})

/**
 * Register a temp file path for cleanup when the process exits.
 * @param {string} path
 */
export function registerTempFile(path) {
  _tempFiles.push(path)
}
