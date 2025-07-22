import { readFile } from 'fs/promises'
import { parse } from 'yaml'
import { join } from 'path'
import { statusCodes } from '../../common/constants/status-codes.js'

const CONFIGS_PATH = join(process.cwd(), 'src/server/common/forms/definitions/tasklists')

class TasklistNotFoundError extends Error {
  constructor(message, statusCode, responseBody, tasklistId) {
    super(message)
    this.name = 'TasklistNotFoundError'
    this.status = statusCode
    this.responseBody = responseBody
    this.tasklistId = tasklistId
  }
}

class TasklistValidationError extends Error {
  constructor(message, statusCode, responseBody, tasklistId) {
    super(message)
    this.name = 'TasklistValidationError'
    this.status = statusCode
    this.responseBody = responseBody
    this.tasklistId = tasklistId
  }
}

export async function loadTasklistConfig(tasklistId) {
  try {
    const configPath = join(CONFIGS_PATH, `${tasklistId}-tasklist.yaml`)
    const fileContent = await readFile(configPath, 'utf8')
    return parse(fileContent)
  } catch (error) {
    throw new TasklistNotFoundError(
      `Failed to load tasklist config for '${tasklistId}': ${error.message}`,
      statusCodes.notFound,
      error.message,
      tasklistId
    )
  }
}

function validateTasklistRoot(config, tasklistId) {
  if (!config.tasklist) {
    throw new TasklistValidationError(
      'Missing tasklist root element in config',
      statusCodes.badRequest,
      'Invalid configuration structure',
      tasklistId
    )
  }
}

function validateTasklistProperties(tasklist, tasklistId) {
  if (!tasklist.id) {
    throw new TasklistValidationError(
      'Tasklist config must have an id',
      statusCodes.badRequest,
      'Missing required id field',
      tasklistId
    )
  }

  if (!tasklist.title) {
    throw new TasklistValidationError(
      'Tasklist config must have a title',
      statusCodes.badRequest,
      'Missing required title field',
      tasklistId
    )
  }

  if (!tasklist.sections || !Array.isArray(tasklist.sections)) {
    throw new TasklistValidationError(
      'Tasklist config must have sections array',
      statusCodes.badRequest,
      'Invalid sections structure',
      tasklistId
    )
  }
}

function validateSection(section, sectionIndex, tasklistId) {
  if (!section.id) {
    throw new TasklistValidationError(
      `Section at index ${sectionIndex} must have an id`,
      statusCodes.badRequest,
      'Missing section id',
      tasklistId
    )
  }

  if (!section.title) {
    throw new TasklistValidationError(
      `Section '${section.id}' must have a title`,
      statusCodes.badRequest,
      'Missing section title',
      tasklistId
    )
  }

  if (!section.subsections || !Array.isArray(section.subsections)) {
    throw new TasklistValidationError(
      `Section '${section.id}' must have subsections array`,
      statusCodes.badRequest,
      'Invalid subsections structure',
      tasklistId
    )
  }
}

function validateSubsection(subsection, subsectionIndex, sectionId, tasklistId) {
  if (!subsection.id) {
    throw new TasklistValidationError(
      `Subsection at index ${subsectionIndex} in section '${sectionId}' must have an id`,
      statusCodes.badRequest,
      'Missing subsection id',
      tasklistId
    )
  }

  if (!subsection.title) {
    throw new TasklistValidationError(
      `Subsection '${subsection.id}' must have a title`,
      statusCodes.badRequest,
      'Missing subsection title',
      tasklistId
    )
  }
}

export function validateTasklistConfig(config, tasklistId = 'unknown') {
  validateTasklistRoot(config, tasklistId)

  const { tasklist } = config
  validateTasklistProperties(tasklist, tasklistId)

  tasklist.sections.forEach((section, sectionIndex) => {
    validateSection(section, sectionIndex, tasklistId)

    section.subsections.forEach((subsection, subsectionIndex) => {
      validateSubsection(subsection, subsectionIndex, section.id, tasklistId)
    })
  })

  return true
}
