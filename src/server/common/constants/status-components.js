export const statusComponents = {
  completed: {
    text: 'Completed'
  },
  inProgress: {
    tag: { text: 'In progress', classes: 'govuk-tag--light-blue' }
  },
  notYetStarted: {
    tag: { text: 'Not yet started', classes: 'govuk-tag--blue' }
  },
  notRequired: {
    tag: { text: 'Not required', classes: 'govuk-tag--yellow' }
  },
  cannotStartYet: {
    tag: {
      text: 'Cannot start yet',
      classes: 'govuk-tag--white-bg'
    }
  }
}
