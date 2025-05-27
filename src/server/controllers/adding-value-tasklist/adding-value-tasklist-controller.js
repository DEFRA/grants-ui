import { addingValueModel } from '../../common/forms/model-definitions/adding-value/adding-value.js'
import { statusComponents } from '../../common/constants/status-components.js'

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

const declarationPages = [...checkPages, 'check-details']

const falsyStatuses = ['notYetStarted', 'cannotStartYet', 'inProgress']

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
    'business-status': 'notYetStarted',
    'project-preparation': 'notYetStarted',
    facilities: 'notYetStarted',
    costs: 'notYetStarted',
    'produce-processed': otherFarmersYesOrFruitStorageCondition(data),
    'project-impact': otherFarmersYesOrFruitStorageCondition(data),
    'manual-labour-amount': 'notYetStarted',
    'future-customers': 'notYetStarted',
    collaboration: 'notYetStarted',
    'environmental-impact': 'notYetStarted',
    'score-results': 'cannotStartYet',
    'business-details': 'notYetStarted',
    'who-is-applying': 'notYetStarted',
    'agent-details': agentOrApplicantCondition(data, 'agent'),
    'applicant-details': agentOrApplicantCondition(data, 'applicant'),
    'check-details': 'cannotStartYet',
    declaration: 'cannotStartYet'
  }

  const pageStatuses = { ...baseStatuses }

  for (const [key] of Object.entries(pageStatuses)) {
    if (baseStatuses[key] === 'notRequired') {
      continue
    }

    if (key in data) {
      pageStatuses[key] = 'completed'
    } else {
      const visitedSubSections = request.yar.get('visitedSubSections')

      if (visitedSubSections.includes(key)) {
        pageStatuses[key] = 'inProgress'
      }
    }
  }

  pageStatuses['score-results'] = basedOnCompletion(
    'score-results',
    data,
    pageStatuses,
    scorePages
  )

  pageStatuses['check-details'] = basedOnCompletion(
    'check-details',
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
  data,
  { check, whenTrue = 'notYetStarted', whenFalse = 'cannotStartYet' }
) => (check ? whenTrue : whenFalse)

export const otherFarmersYesOrFruitStorageCondition = (data) => {
  const {
    isProvidingServicesToOtherFarmers: a,
    isProvidingFruitStorage: b,
    isBuildingSmallerAbattoir: c,
    isBuildingFruitStorage: d
  } = data?.facilities ?? {}

  if (c === false && d === false) return 'notRequired'

  return getCondition(data, {
    check: a || b
  })
}

export const agentOrApplicantCondition = (data, role) => {
  const grantType = data?.['who-is-applying']?.grantApplicantType ?? null
  if (!grantType) return 'cannotStartYet'
  const isValid =
    (role === 'applicant' && grantType === 'applying-A1') ||
    (role === 'agent' && grantType === 'applying-A2')
  return isValid ? 'notYetStarted' : 'notRequired'
}

export const basedOnCompletion = (pageSlug, data, pageStatuses, pageList) => {
  // CHANGE WHEN SCORING & CHECK PAGES WORK
  if (pageSlug in data) return 'completed'

  const values = pageList.map((key) => pageStatuses[key])

  if (falsyStatuses.some((iv) => values.includes(iv))) return 'cannotStartYet'
  return 'notYetStarted'
}

const applyStatuses = (sections, statuses) => {
  return sections.map((section) => ({
    title: section.title,
    subsections: section.subsections.map((sub) => ({
      ...sub,
      status: statusComponents[statuses[sub.href]],
      href:
        statuses[sub.href] === 'cannotStartYet' ||
        statuses[sub.href] === 'notRequired'
          ? null
          : `${sub.href}?source=adding-value-tasklist`
    }))
  }))
}
