const FIRST_PAGES = [
  '/business-status/nature-of-business',
  '/project-preparation/planning-permission',
  '/facilities/smaller-abattoir',
  '/costs/project-cost',
  '/produce-processed/produce-processed',
  '/project-impact/how-adding-value',
  '/manual-labour-amount/mechanisation',
  '/future-customers/future-customers',
  '/collaboration/collaboration',
  '/environmental-impact/environmental-impact',
  '/score-results/score-results',
  '/business-details/business-details',
  '/who-is-applying/applying',
  '/agent-details/agent-details',
  '/applicant-details/applicant-details',
  '/check-details/check-details',
  '/declaration/declaration'
]

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000

function isSourceTasklist(request) {
  return request.query?.source === 'adding-value-tasklist'
}

function getSessionId(request) {
  return request.yar?.id
}

function isFromTasklist(request) {
  try {
    return request.yar?.get('fromTasklist') === true
  } catch {
    return false
  }
}

function isRedirectResponse(response) {
  return (
    response?.isBoom === false &&
    response?.variety === 'plain' &&
    response?.headers?.location
  )
}

function preserveSourceParameterInRedirect(response) {
  const location = response.headers.location
  const separator = location.includes('?') ? '&' : '?'
  response.headers.location = `${location}${separator}source=adding-value-tasklist`
}

function isViewResponse(response) {
  return response?.variety === 'view'
}

function isFirstPage(path) {
  return FIRST_PAGES.includes(path)
}

function hasViewContext(response) {
  return response?.source?.context !== undefined
}

function addBackLinkToContext(response) {
  response.source.context.backLink = {
    text: 'Back to task list',
    href: '/adding-value-tasklist/tasklist'
  }
}

function createSessionCleanupInterval(tasklistSessions) {
  return setInterval(() => {
    /* istanbul ignore next */ // NOSONAR - timer callback, tested indirectly
    tasklistSessions.clear()
  }, CLEANUP_INTERVAL_MS)
}

function handleTasklistSourceRequest(request, tasklistSessions, sessionId) {
  request.yar.set('fromTasklist', true)
  tasklistSessions.add(sessionId)

  if (isRedirectResponse(request.response)) {
    preserveSourceParameterInRedirect(request.response)
  }
}

function shouldProcessTasklistRequest(
  sessionId,
  tasklistSessions,
  fromTasklistSession
) {
  return sessionId && (tasklistSessions.has(sessionId) || fromTasklistSession)
}

function handleFirstPageRequest(
  request,
  fromTasklistSession,
  tasklistSessions,
  sessionId
) {
  if (isFirstPage(request.path) && hasViewContext(request.response)) {
    addBackLinkToContext(request.response)
  } else if (!isFirstPage(request.path) && fromTasklistSession) {
    request.yar.set('fromTasklist', false)
    tasklistSessions.delete(sessionId)
  } else {
    // No action needed - either first page without context or non-first page without session
  }
}

function processTasklistSourceRequest(request, tasklistSessions, sessionId, h) {
  handleTasklistSourceRequest(request, tasklistSessions, sessionId)
  return h.continue
}

function processExistingTasklistSession(
  request,
  fromTasklistSession,
  tasklistSessions,
  sessionId,
  h
) {
  if (!isViewResponse(request.response)) {
    return h.continue
  }

  handleFirstPageRequest(
    request,
    fromTasklistSession,
    tasklistSessions,
    sessionId
  )
  return h.continue
}

function createOnPreResponseHandler(tasklistSessions) {
  return (request, h) => {
    const sessionId = getSessionId(request)

    if (isSourceTasklist(request) && sessionId) {
      return processTasklistSourceRequest(
        request,
        tasklistSessions,
        sessionId,
        h
      )
    }

    const fromTasklistSession = isFromTasklist(request)

    if (
      !shouldProcessTasklistRequest(
        sessionId,
        tasklistSessions,
        fromTasklistSession
      )
    ) {
      return h.continue
    }

    return processExistingTasklistSession(
      request,
      fromTasklistSession,
      tasklistSessions,
      sessionId,
      h
    )
  }
}

export const tasklistBackButton = {
  plugin: {
    name: 'tasklist-back-button',
    register(server) {
      const tasklistSessions = new Set()

      server.ext('onPreResponse', createOnPreResponseHandler(tasklistSessions))

      createSessionCleanupInterval(tasklistSessions)
    }
  }
}
