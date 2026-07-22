import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join, parse, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Replace a directory's children without replacing the directory itself.
 * @param {string} sourceDirectory
 * @param {string} targetDirectory
 */
export const replaceDirectoryContents = async (sourceDirectory, targetDirectory) => {
  const sourcePath = resolve(sourceDirectory)
  const targetPath = resolve(targetDirectory)

  if (sourcePath === targetPath || targetPath === parse(targetPath).root) {
    throw new Error('Source and target must be distinct, non-root directories')
  }

  if (!(await stat(sourcePath)).isDirectory()) {
    throw new Error(`Source is not a directory: ${sourcePath}`)
  }

  await mkdir(targetPath, { recursive: true })

  for (const entry of await readdir(targetPath)) {
    await rm(join(targetPath, entry), { recursive: true, force: true })
  }

  for (const entry of await readdir(sourcePath)) {
    await cp(join(sourcePath, entry), join(targetPath, entry), { recursive: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [sourceDirectory, targetDirectory] = process.argv.slice(2)

  if (!sourceDirectory || !targetDirectory) {
    throw new Error('Usage: node replace-directory-contents.js <source-directory> <target-directory>')
  }

  await replaceDirectoryContents(sourceDirectory, targetDirectory)
}
