export const applicationStatuses = new Map()

export const mockStatusController = {
  handler: (request, h) => {
    const { code, clientRef } = request.params
    const key = `${clientRef}_${code}`

    if (!applicationStatuses.has(key)) {
      // Not submitted yet → return 404
      return h.response({ error: 'Application not found' }).code(404)
    }

    const status = applicationStatuses.get(key)

    return h.response({
      grantCode: code,
      clientRef,
      phase: 'PRE_AWARD',
      stage: 'REVIEW',
      status
    })
  }
}
