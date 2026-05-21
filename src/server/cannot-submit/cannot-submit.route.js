export const cannotSubmitRoute = {
  method: 'GET',
  path: '/cannot-submit',
  handler: (request, h) => {
    return h.view('cannot-submit', {
      returnUrl: request.query.returnUrl
    })
  }
}
