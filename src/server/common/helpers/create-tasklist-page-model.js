export function createTaskListPageModel(sections) {
  return {
    pageHeading: 'Apply for adding value grant',
    sections: sections.map((section) => ({
      title: section.title,
      subsections: section.subsections.map((sub) => {
        const statusText = sub.status || ''
        if (statusText === 'cannotStartYet') {
          return {
            title: { text: sub.text },
            status: statuses.cannotStartYet
          }
        }

        return {
          title: { text: sub.text },
          href: sub.href,
          status: statuses[statusText]
        }
      })
    }))
  }
}

const statuses = {
  completed: {
    text: 'Completed'
  },
  inProgress: {
    tag: { text: 'In progress', classes: 'govuk-tag--lightblue' }
  },
  notYetStarted: {
    tag: { text: 'Not yet started', classes: 'govuk-tag--blue' }
  },
  cannotStartYet: {
    tag: {
      text: 'Cannot start yet',
      classes: 'govuk-tag--white-bg'
    }
  }
}
