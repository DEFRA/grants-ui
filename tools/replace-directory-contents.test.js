import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { replaceDirectoryContents } from './replace-directory-contents.js'

describe('replaceDirectoryContents', () => {
  let temporaryDirectory

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  })

  it('replaces the contents while preserving the target directory', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'replace-directory-contents-'))
    const sourceDirectory = join(temporaryDirectory, 'source')
    const targetDirectory = join(temporaryDirectory, 'target')
    await mkdir(join(sourceDirectory, 'nested'), { recursive: true })
    await mkdir(targetDirectory)
    await writeFile(join(sourceDirectory, 'nested', 'new.yml'), 'new config')
    await writeFile(join(sourceDirectory, '.hidden'), 'hidden config')
    await writeFile(join(targetDirectory, 'stale.yml'), 'stale config')
    const inodeBefore = (await stat(targetDirectory)).ino

    await replaceDirectoryContents(sourceDirectory, targetDirectory)

    expect((await stat(targetDirectory)).ino).toBe(inodeBefore)
    await expect(readFile(join(targetDirectory, 'stale.yml'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(targetDirectory, 'nested', 'new.yml'), 'utf8')).resolves.toBe('new config')
    await expect(readFile(join(targetDirectory, '.hidden'), 'utf8')).resolves.toBe('hidden config')
  })
})
