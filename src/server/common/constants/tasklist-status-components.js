export const TaskListStatus = {
  COMPLETED: 'completed',
  IN_PROGRESS: 'inProgress',
  NOT_YET_STARTED: 'notYetStarted',
  NOT_REQUIRED: 'notRequired',
  CANNOT_START_YET: 'cannotStartYet'
}

export const taskListStatusComponents = {
  [TaskListStatus.COMPLETED]: {
    text: 'Completed'
  },
  [TaskListStatus.IN_PROGRESS]: {
    tag: { text: 'In progress', classes: 'govuk-tag--light-blue' }
  },
  [TaskListStatus.NOT_YET_STARTED]: {
    tag: { text: 'Not yet started', classes: 'govuk-tag--blue' }
  },
  [TaskListStatus.NOT_REQUIRED]: {
    tag: { text: 'Not required', classes: 'govuk-tag--yellow' }
  },
  [TaskListStatus.CANNOT_START_YET]: {
    tag: {
      text: 'Cannot start yet',
      classes: 'govuk-tag--white-bg'
    }
  }
}
