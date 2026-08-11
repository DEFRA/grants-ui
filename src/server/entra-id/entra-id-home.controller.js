export const entraIdHomeController = {
  handler(request, h) {
    return h.view('entra-id-home', {
      pageTitle: 'Entra ID',
      heading: 'You are signed in with Entra ID',
      credentials: request.auth.credentials
    })
  }
}
