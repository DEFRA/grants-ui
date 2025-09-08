import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { loadTasklistConfig } from '../tasklist/services/config-loader.js'
import { allForms } from '../common/forms/services/forms-config.js'
import { parse } from 'yaml'

const tasklistFirstPages = new Map()
const tasklistIds = new Set()

export function safeYarGet(request, key) {
  if (!request.yar) {
    return null
  }
  try {
    return request.yar.get(key)
  } catch {
    return null
  }
}

export function safeYarSet(request, key, value) {
  if (!request.yar) {
    return false
  }
  try {
    request.yar.set(key, value)
    return true
  } catch {
    return false
  }
}

export function safeYarClear(request, key) {
  if (!request.yar) {
    return false
  }
  try {
    request.yar.clear(key)
    return true
  } catch {
    return false
  }
}

export async function loadAllTasklistConfigs() {
  const configsPath = join(process.cwd(), 'src/server/common/forms/definitions/tasklists')

  if (!existsSync(configsPath)) {
    return
  }

  const files = readdirSync(configsPath).filter((f) => f.endsWith('-tasklist.yaml'))

  await Promise.all(
    files.map(async (file) => {
      const tasklistId = file.replace('-tasklist.yaml', '')
      const config = await loadTasklistConfig(tasklistId)

      if (config?.tasklist) {
        const firstPages = extractFirstPages(config.tasklist)
        tasklistFirstPages.set(`${tasklistId}-tasklist`, firstPages)
        tasklistIds.add(`${tasklistId}-tasklist`)
      }
    })
  )
}

export function extractFirstPageForSubsection(subsection) {
  try {
    const formConfig = allForms.find((f) => f.slug === subsection.href)

    if (!formConfig) {
      return null
    }

    const formContent = readFileSync(formConfig.path, 'utf8')
    const formDef = parse(formContent)

    const firstPage = formDef.pages.find((p) => !p.controller || p.controller !== 'TerminalPageController')

    return firstPage ? `/${subsection.href}${firstPage.path}` : null // NOSONAR - Complex integration test setup required
  } catch {
    return null
  }
}

export function extractFirstPages(tasklistConfig) {
  return (tasklistConfig.sections || [])
    .flatMap((section) => section.subsections || [])
    .map((subsection) => extractFirstPageForSubsection(subsection))
    .filter(Boolean)
}

export function isSourceTasklist(request, tasklistIdsSet = tasklistIds) {
  const source = request.query?.source
  return source && tasklistIdsSet.has(source)
}

export function getTasklistIdFromSource(request) {
  return request.query?.source
}

export function isFromTasklist(request) {
  const tasklistContext = safeYarGet(request, 'tasklistContext')
  return tasklistContext?.fromTasklist === true
}

export function getTasklistIdFromSession(request) {
  const tasklistContext = safeYarGet(request, 'tasklistContext')
  return tasklistContext?.tasklistId || null
}

export function isRedirectResponse(response) {
  return response?.isBoom === false && response?.variety === 'plain' && response?.headers?.location
}

export function preserveSourceParameterInRedirect(response, tasklistId) {
  const location = response.headers.location
  const separator = location.includes('?') ? '&' : '?'
  response.headers.location = `${location}${separator}source=${tasklistId}`
}

export function isViewResponse(response) {
  return response?.variety === 'view'
}

export function isFirstPage(path, tasklistId, tasklistFirstPagesMap = tasklistFirstPages) {
  const firstPages = tasklistFirstPagesMap.get(tasklistId)
  return firstPages ? firstPages.includes(path) : false
}

export function hasViewContext(response) {
  return response?.source?.context !== undefined
}

export function addBackLinkToContext(response, tasklistId) {
  response.source.context.backLink = {
    text: 'Back to tasklist',
    href: `/${tasklistId}/tasklist`
  }
}

export function addTasklistIdToContext(response, tasklistId) {
  if (hasViewContext(response)) {
    response.source.context.tasklistId = tasklistId
  }
}

export function shouldProcessTasklistRequest(fromTasklistSession) {
  return fromTasklistSession
}

export function handleFirstPageRequest(request, fromTasklistSession) {
  const tasklistId = getTasklistIdFromSession(request)

  if (tasklistId) {
    const isFirst = isFirstPage(request.path, tasklistId)
    const hasContext = hasViewContext(request.response)

    if (isFirst && hasContext) {
      addBackLinkToContext(request.response, tasklistId)
    } else if (!isFirst && fromTasklistSession) {
      safeYarClear(request, 'tasklistContext')
    } else {
      // No action needed for other cases
    }
  }
}

export function processExistingTasklistSession(request, fromTasklistSession, h) {
  if (!isViewResponse(request.response)) {
    return h.continue
  }

  const tasklistId = getTasklistIdFromSession(request)
  if (tasklistId) {
    addTasklistIdToContext(request.response, tasklistId)
  }

  handleFirstPageRequest(request, fromTasklistSession)
  return h.continue
}

function createOnPreHandlerHook() {
  return (request, h) => {
    if (isSourceTasklist(request)) {
      const tasklistId = getTasklistIdFromSource(request)
      safeYarSet(request, 'tasklistContext', {
        fromTasklist: true,
        tasklistId
      })
    }

    return h.continue
  }
}

function createOnPreResponseHandler() {
  return (request, h) => {
    if (isSourceTasklist(request)) {
      const tasklistId = getTasklistIdFromSource(request)

      if (isRedirectResponse(request.response)) {
        preserveSourceParameterInRedirect(request.response, tasklistId)
        return h.continue
      }

      if (isViewResponse(request.response) && hasViewContext(request.response)) {
        addTasklistIdToContext(request.response, tasklistId)
      }
    }

    const fromTasklistSession = isFromTasklist(request)

    if (!shouldProcessTasklistRequest(fromTasklistSession)) {
      return h.continue
    }

    if (fromTasklistSession && isRedirectResponse(request.response)) {
      const tasklistId = getTasklistIdFromSession(request)
      if (tasklistId) {
        preserveSourceParameterInRedirect(request.response, tasklistId)
      }
    }

    return processExistingTasklistSession(request, fromTasklistSession, h)
  }
}

export const tasklistBackButton = {
  plugin: {
    name: 'tasklist-back-button',
    async register(server) {
      await loadAllTasklistConfigs()
      server.ext('onPreHandler', createOnPreHandlerHook())
      server.ext('onPreResponse', createOnPreResponseHandler())
    }
  }
}
