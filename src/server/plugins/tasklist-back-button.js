import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { loadTasklistConfig } from '../common/tasklist/config-loader.js'
import { allForms } from '../common/forms/services/forms-config.js'
import { parse } from 'yaml'

const tasklistFirstPages = new Map()
const tasklistIds = new Set()

function safeYarGet(request, key) {
  if (!request.yar) {
    return null
  }
  try {
    return request.yar.get(key)
  } catch {
    return null
  }
}

function safeYarSet(request, key, value) {
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

function safeYarClear(request, key) {
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

async function loadAllTasklistConfigs() {
  const configsPath = join(process.cwd(), 'src/server/common/tasklist/configs')

  if (!existsSync(configsPath)) {
    return
  }

  const files = readdirSync(configsPath).filter((f) =>
    f.endsWith('-tasklist.yaml')
  )

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

function extractFirstPageForSubsection(subsection) {
  try {
    const formConfig = allForms.find((f) => f.slug === subsection.href)

    if (!formConfig) {
      return null
    }

    const formContent = readFileSync(formConfig.path, 'utf8')
    const formDef = parse(formContent)

    const firstPage = formDef.pages.find(
      (p) => !p.controller || p.controller !== 'TerminalPageController'
    )

    return firstPage ? `/${subsection.href}${firstPage.path}` : null
  } catch {
    return null
  }
}

function extractFirstPages(tasklistConfig) {
  return (tasklistConfig.sections || [])
    .flatMap((section) => section.subsections || [])
    .map((subsection) => extractFirstPageForSubsection(subsection))
    .filter(Boolean)
}

function isSourceTasklist(request) {
  const source = request.query?.source
  return source && tasklistIds.has(source)
}

function getTasklistIdFromSource(request) {
  return request.query?.source
}

function isFromTasklist(request) {
  const tasklistContext = safeYarGet(request, 'tasklistContext')
  return tasklistContext?.fromTasklist === true
}

function getTasklistIdFromSession(request) {
  const tasklistContext = safeYarGet(request, 'tasklistContext')
  return tasklistContext?.tasklistId || null
}

function isRedirectResponse(response) {
  return (
    response?.isBoom === false &&
    response?.variety === 'plain' &&
    response?.headers?.location
  )
}

function preserveSourceParameterInRedirect(response, tasklistId) {
  const location = response.headers.location
  const separator = location.includes('?') ? '&' : '?'
  response.headers.location = `${location}${separator}source=${tasklistId}`
}

function isViewResponse(response) {
  return response?.variety === 'view'
}

function isFirstPage(path, tasklistId) {
  const firstPages = tasklistFirstPages.get(tasklistId)
  return firstPages ? firstPages.includes(path) : false
}

function hasViewContext(response) {
  return response?.source?.context !== undefined
}

function addBackLinkToContext(response, tasklistId) {
  response.source.context.backLink = {
    text: 'Back to tasklist',
    href: `/${tasklistId}/tasklist`
  }
}

function shouldProcessTasklistRequest(fromTasklistSession) {
  return fromTasklistSession
}

function handleFirstPageRequest(request, fromTasklistSession) {
  const tasklistId = getTasklistIdFromSession(request)

  if (tasklistId) {
    const isFirst = isFirstPage(request.path, tasklistId)
    const hasContext = hasViewContext(request.response)

    if (isFirst && hasContext) {
      addBackLinkToContext(request.response, tasklistId)
    } else if (!isFirst && fromTasklistSession) {
      safeYarClear(request, 'tasklistContext')
    }
  }
}

function processExistingTasklistSession(request, fromTasklistSession, h) {
  if (!isViewResponse(request.response)) {
    return h.continue
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
    if (isSourceTasklist(request) && isRedirectResponse(request.response)) {
      const tasklistId = getTasklistIdFromSource(request)
      preserveSourceParameterInRedirect(request.response, tasklistId)
      return h.continue
    }

    const fromTasklistSession = isFromTasklist(request)

    if (!shouldProcessTasklistRequest(fromTasklistSession)) {
      return h.continue
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
