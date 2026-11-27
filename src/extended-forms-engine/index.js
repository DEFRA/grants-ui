import path from 'node:path'
import { fileURLToPath } from 'node:url'

const componentPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'components')

export const templatePaths = [componentPath]
export const sassPaths = [componentPath]
