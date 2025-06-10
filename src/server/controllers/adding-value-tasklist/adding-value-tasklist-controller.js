import { addingValueModel } from '../../common/forms/model-definitions/adding-value/adding-value.js'
import {
  taskListStatusComponents,
  TaskListStatus
} from '../../common/constants/tasklist-status-components.js'

const scorePages = [
  'business-status',
  'project-preparation',
  'facilities',
  'costs',
  'produce-processed',
  'project-impact',
  'manual-labour-amount',
  'future-customers',
  'collaboration',
  'environmental-impact'
]

const checkPages = [
  ...scorePages,
  // 'score-results', // ADD THIS BACK IN WHEN SCORING PAGE WORKS
  'business-details',
  'who-is-applying',
  'agent-details',
  'applicant-details'
]

const CHECK_DETAILS = 'check-details'

const declarationPages = [...checkPages, CHECK_DETAILS]

const falsyStatuses = [
  TaskListStatus.NOT_YET_STARTED,
  TaskListStatus.CANNOT_START_YET,
  TaskListStatus.IN_PROGRESS
]

export const addingValueTasklist = {
  plugin: {
    name: 'addingValueTasklist',
    register(server) {
      server.route({
        method: 'GET',
        path: '/adding-value-tasklist',
        handler: async (request, h) => {
          const data = (await server.app.cacheTemp.get(request.yar.id)) || {}
          const pageStatuses = determineStatuses(request, data)
          const modelWithStatuses = {
            pageHeading: 'Apply for adding value grant',
            sections: applyStatuses(addingValueModel, pageStatuses)
          }
          return h.view('views/adding-value-tasklist-page', modelWithStatuses)
        }
      })
    }
  }
}

const determineStatuses = (request, data) => {
  const baseStatuses = {
    'business-status': TaskListStatus.NOT_YET_STARTED,
    'project-preparation': TaskListStatus.NOT_YET_STARTED,
    facilities: TaskListStatus.NOT_YET_STARTED,
    costs: TaskListStatus.NOT_YET_STARTED,
    'produce-processed': otherFarmersYesOrFruitStorageCondition(data),
    'project-impact': otherFarmersYesOrFruitStorageCondition(data),
    'manual-labour-amount': TaskListStatus.NOT_YET_STARTED,
    'future-customers': TaskListStatus.NOT_YET_STARTED,
    collaboration: TaskListStatus.NOT_YET_STARTED,
    'environmental-impact': TaskListStatus.NOT_YET_STARTED,
    'score-results': TaskListStatus.CANNOT_START_YET,
    'business-details': TaskListStatus.NOT_YET_STARTED,
    'who-is-applying': TaskListStatus.NOT_YET_STARTED,
    'agent-details': agentOrApplicantCondition(data, 'agent'),
    'applicant-details': agentOrApplicantCondition(data, 'applicant'),
    'check-details': TaskListStatus.CANNOT_START_YET,
    declaration: TaskListStatus.CANNOT_START_YET
  }

  const pageStatuses = { ...baseStatuses }

  for (const [key] of Object.entries(pageStatuses)) {
    if (baseStatuses[key] === TaskListStatus.HIDDEN) {
      continue
    }

    if (key in data) {
      pageStatuses[key] = TaskListStatus.COMPLETED
    } else {
      const visitedSubSections = request.yar.get('visitedSubSections')

      if (visitedSubSections.includes(key)) {
        pageStatuses[key] = TaskListStatus.IN_PROGRESS
      }
    }
  }

  pageStatuses['score-results'] = basedOnCompletion(
    'score-results',
    data,
    pageStatuses,
    scorePages
  )

  pageStatuses[CHECK_DETAILS] = basedOnCompletion(
    CHECK_DETAILS,
    data,
    pageStatuses,
    checkPages
  )

  pageStatuses.declaration = basedOnCompletion(
    'declaration',
    data,
    pageStatuses,
    declarationPages
  )

  return pageStatuses
}

const getCondition = (
  _data,
  {
    check,
    whenTrue = TaskListStatus.NOT_YET_STARTED,
    whenFalse = TaskListStatus.CANNOT_START_YET
  }
) => (check ? whenTrue : whenFalse)

export const otherFarmersYesOrFruitStorageCondition = (data) => {
  const {
    isProvidingServicesToOtherFarmers: a,
    isProvidingFruitStorage: b,
    isBuildingSmallerAbattoir: c,
    isBuildingFruitStorage: d
  } = data?.facilities ?? {}

  if (c !== true && d !== true) {
    return TaskListStatus.HIDDEN
  }

  return getCondition(data, {
    check: a || b
  })
}

export const agentOrApplicantCondition = (data, role) => {
  const grantType = data?.['who-is-applying']?.grantApplicantType ?? null
  if (!grantType) {
    return TaskListStatus.HIDDEN
  }
  const isValid =
    (role === 'applicant' && grantType === 'applying-A1') ||
    (role === 'agent' && grantType === 'applying-A2')
  return isValid ? TaskListStatus.NOT_YET_STARTED : TaskListStatus.HIDDEN
}

export const basedOnCompletion = (pageSlug, data, pageStatuses, pageList) => {
  // CHANGE WHEN SCORING & CHECK PAGES WORK
  if (pageSlug in data) {
    return TaskListStatus.COMPLETED
  }

  const values = pageList.map((key) => pageStatuses[key])

  if (falsyStatuses.some((iv) => values.includes(iv))) {
    return TaskListStatus.CANNOT_START_YET
  }
  return TaskListStatus.NOT_YET_STARTED
}

const applyStatuses = (sections, statuses) => {
  return sections.map((section) => ({
    title: section.title,
    subsections: section.subsections
      .filter((sub) => statuses[sub.href] !== TaskListStatus.HIDDEN)
      .map((sub) => ({
        ...sub,
        status: taskListStatusComponents[statuses[sub.href]],
        href:
          statuses[sub.href] === TaskListStatus.CANNOT_START_YET
            ? null
            : `${sub.href}?source=adding-value-tasklist`
      }))
  }))
}
