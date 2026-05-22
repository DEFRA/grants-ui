import convict from 'convict'

const externalLinks = convict({
  sfd: {
    enabled: {
      doc: 'Is updating through Single Front Door enabled',
      format: Boolean,
      default: false,
      env: 'SFD_UPDATE_ENABLED'
    },
    updateUrl: {
      doc: 'The URL to redirect to when updating through Single Front Door',
      format: String,
      default: '',
      env: 'SFD_UPDATE_URL'
    }
  }
})

export default externalLinks
