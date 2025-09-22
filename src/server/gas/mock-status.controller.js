// mock-status.controller.js
export const mockStatusController = {
  handler: (request, h) => {
    const { code, clientRef } = request.params

    // Return some mock payload
    return h.response({
      grantCode: code,
      clientRef,
      phase: 'PRE_AWARD',
      stage: 'REVIEW',
      status: 'WITHDRAWN'
    })
  }
}
