import { fileURLToPath } from 'node:url'

const componentPath = fileURLToPath(new URL('./components/', import.meta.url))

export const templatePaths = [componentPath]
export const sassPaths = [componentPath]
