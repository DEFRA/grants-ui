export default {
  plugin: {
    name: 'sso',
    register: (server) => {
      server.ext('onRequest', (request, h) => {
        // If the user has already selected an organisation in another service, pass the organisation Id to force Defra Id to skip the organisation selection screen
        if (request.query.ssoOrgId) {
          const searchParams = new URLSearchParams(request.url.search)
          searchParams.delete('ssoOrgId') // Remove the SSO query parameter from the URL to avoid an endless loop

          const redirect =
            searchParams.size > 0 ? `${request.url.pathname}?${searchParams.toString()}` : request.url.pathname
          return h
            .redirect(`/auth/organisation?organisationId=${request.query.ssoOrgId}&redirect=${redirect}`)
            .takeover()
        }
        return h.continue
      })
    }
  }
}
