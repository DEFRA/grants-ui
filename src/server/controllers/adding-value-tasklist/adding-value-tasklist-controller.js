import { addingValueModel } from '../../common/forms/model-definitions/adding-value/adding-value.js'
import {
  taskListStatusComponents,
  TaskListStatus
} from '../../common/constants/tasklist-status-components.js'

export const SECTIONS = {
  BUSINESS_STATUS: 'business-status',
  PROJECT_PREPARATION: 'project-preparation',
  FACILITIES: 'facilities',
  COSTS: 'costs',
  PRODUCE_PROCESSED: 'produce-processed',
  PROJECT_IMPACT: 'project-impact',
  MANUAL_LABOUR_AMOUNT: 'manual-labour-amount',
  FUTURE_CUSTOMERS: 'future-customers',
  COLLABORATION: 'collaboration',
  ENVIRONMENTAL_IMPACT: 'environmental-impact',
  BUSINESS_DETAILS: 'business-details',
  WHO_IS_APPLYING: 'who-is-applying',
  AGENT_DETAILS: 'agent-details',
  APPLICANT_DETAILS: 'applicant-details',
  CHECK_DETAILS: 'check-details',
  SCORE_RESULTS: 'score-results',
  DECLARATION: 'declaration'
}

export const GRANT_APPLICANT_TYPES = {
  APPLYING_A1: 'applying-A1',
  APPLYING_A2: 'applying-A2'
}

export const ROLES = {
  APPLICANT: 'applicant',
  AGENT: 'agent'
}

const scorePages = [
  SECTIONS.BUSINESS_STATUS,
  SECTIONS.PROJECT_PREPARATION,
  SECTIONS.FACILITIES,
  SECTIONS.COSTS,
  SECTIONS.PRODUCE_PROCESSED,
  SECTIONS.PROJECT_IMPACT,
  SECTIONS.MANUAL_LABOUR_AMOUNT,
  SECTIONS.FUTURE_CUSTOMERS,
  SECTIONS.COLLABORATION,
  SECTIONS.ENVIRONMENTAL_IMPACT
]

const checkPages = [
  ...scorePages,
  // SECTIONS.SCORE_RESULTS, // ADD THIS BACK IN WHEN SCORING PAGE WORKS
  SECTIONS.BUSINESS_DETAILS,
  SECTIONS.WHO_IS_APPLYING,
  SECTIONS.AGENT_DETAILS,
  SECTIONS.APPLICANT_DETAILS
]

const CHECK_DETAILS = SECTIONS.CHECK_DETAILS

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
        path: '/adding-value-tasklist/tasklist',
        handler: async (request, h) => {
          const data = (await server.app.cacheTemp.get(request.yar.id)) || {}
          const pageStatuses = determineStatuses(request, data)
          const modelWithStatuses = {
            pageHeading: 'Apply for adding value grant',
            sections: applyStatuses(addingValueModel, pageStatuses),
            serviceName: 'Adding Value Tasklist grant'
          }
          return h.view('views/adding-value-tasklist-page', modelWithStatuses)
        }
      })

      const sections = [
        SECTIONS.BUSINESS_STATUS,
        SECTIONS.PROJECT_PREPARATION,
        SECTIONS.FACILITIES,
        SECTIONS.COSTS,
        SECTIONS.PRODUCE_PROCESSED,
        SECTIONS.PROJECT_IMPACT,
        SECTIONS.MANUAL_LABOUR_AMOUNT,
        SECTIONS.FUTURE_CUSTOMERS,
        SECTIONS.COLLABORATION,
        SECTIONS.ENVIRONMENTAL_IMPACT,
        SECTIONS.BUSINESS_DETAILS,
        SECTIONS.WHO_IS_APPLYING,
        SECTIONS.AGENT_DETAILS,
        SECTIONS.APPLICANT_DETAILS,
        SECTIONS.CHECK_DETAILS
      ]

      sections.forEach((section) => {
        server.route({
          method: 'GET',
          path: `/adding-value-tasklist/${section}`,
          handler: (request, h) => {
            const queryString = request.url.search || ''
            return h.redirect(`/${section}${queryString}`)
          }
        })

        server.route({
          method: 'GET',
          path: `/adding-value-tasklist/${section}/{path*}`,
          handler: (request, h) => {
            const path = request.params.path || ''
            const queryString = request.url.search || ''
            return h.redirect(`/${section}/${path}${queryString}`)
          }
        })
      })
    }
  }
}

const determineStatuses = (request, data) => {
  const baseStatuses = {
    [SECTIONS.BUSINESS_STATUS]: TaskListStatus.NOT_YET_STARTED,
    [SECTIONS.PROJECT_PREPARATION]: TaskListStatus.NOT_YET_STARTED,
    [SECTIONS.FACILITIES]: TaskListStatus.NOT_YET_STARTED,
    [SECTIONS.COSTS]: TaskListStatus.NOT_YET_STARTED,
    [SECTIONS.PRODUCE_PROCESSED]: otherFarmersYesOrFruitStorageCondition(data),
    [SECTIONS.PROJECT_IMPACT]: otherFarmersYesOrFruitStorageCondition(data),
    [SECTIONS.MANUAL_LABOUR_AMOUNT]: TaskListStatus.NOT_YET_STARTED,
    [SECTIONS.FUTURE_CUSTOMERS]: TaskListStatus.NOT_YET_STARTED,
    [SECTIONS.COLLABORATION]: TaskListStatus.NOT_YET_STARTED,
    [SECTIONS.ENVIRONMENTAL_IMPACT]: TaskListStatus.NOT_YET_STARTED,
    [SECTIONS.SCORE_RESULTS]: TaskListStatus.CANNOT_START_YET,
    [SECTIONS.BUSINESS_DETAILS]: TaskListStatus.NOT_YET_STARTED,
    [SECTIONS.WHO_IS_APPLYING]: TaskListStatus.NOT_YET_STARTED,
    [SECTIONS.AGENT_DETAILS]: agentOrApplicantCondition(data, ROLES.AGENT),
    [SECTIONS.APPLICANT_DETAILS]: agentOrApplicantCondition(
      data,
      ROLES.APPLICANT
    ),
    [SECTIONS.CHECK_DETAILS]: TaskListStatus.CANNOT_START_YET,
    [SECTIONS.DECLARATION]: TaskListStatus.CANNOT_START_YET
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

  pageStatuses[SECTIONS.SCORE_RESULTS] = basedOnCompletion(
    SECTIONS.SCORE_RESULTS,
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

  pageStatuses[SECTIONS.DECLARATION] = basedOnCompletion(
    SECTIONS.DECLARATION,
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
  const grantType = data?.[SECTIONS.WHO_IS_APPLYING]?.grantApplicantType ?? null
  if (!grantType) {
    return TaskListStatus.HIDDEN
  }
  const isValid =
    (role === ROLES.APPLICANT &&
      grantType === GRANT_APPLICANT_TYPES.APPLYING_A1) ||
    (role === ROLES.AGENT && grantType === GRANT_APPLICANT_TYPES.APPLYING_A2)
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
            : `/adding-value-tasklist/${sub.href}?source=adding-value-tasklist`
      }))
  }))
}
