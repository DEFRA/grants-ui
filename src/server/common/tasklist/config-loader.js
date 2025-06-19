import { readFile } from 'fs/promises'
import { parse } from 'yaml'
import { join } from 'path'

const CONFIGS_PATH = join(process.cwd(), 'src/server/common/tasklist/configs')

export async function loadTasklistConfig(tasklistId) {
  try {
    const configPath = join(CONFIGS_PATH, `${tasklistId}-tasklist.yaml`)
    const fileContent = await readFile(configPath, 'utf8')
    return parse(fileContent)
  } catch (error) {
    throw new Error(
      `Failed to load tasklist config for '${tasklistId}': ${error.message}`
    )
  }
}

export function validateTasklistConfig(config) {
  if (!config.tasklist) {
    throw new Error('Missing tasklist root element in config')
  }

  const { tasklist } = config

  if (!tasklist.id) {
    throw new Error('Tasklist config must have an id')
  }

  if (!tasklist.title) {
    throw new Error('Tasklist config must have a title')
  }

  if (!tasklist.sections || !Array.isArray(tasklist.sections)) {
    throw new Error('Tasklist config must have sections array')
  }

  tasklist.sections.forEach((section, sectionIndex) => {
    if (!section.id) {
      throw new Error(`Section at index ${sectionIndex} must have an id`)
    }

    if (!section.title) {
      throw new Error(`Section '${section.id}' must have a title`)
    }

    if (!section.subsections || !Array.isArray(section.subsections)) {
      throw new Error(`Section '${section.id}' must have subsections array`)
    }

    section.subsections.forEach((subsection, subsectionIndex) => {
      if (!subsection.id) {
        throw new Error(
          `Subsection at index ${subsectionIndex} in section '${section.id}' must have an id`
        )
      }

      if (!subsection.title) {
        throw new Error(`Subsection '${subsection.id}' must have a title`)
      }
    })
  })

  return true
}
