import { fetchLatestDefinitionFromApi } from '../../common/helpers/state/fetch-saved-state-helper.js'
import { loadSharedRedirectRules, mergeGrantRedirectRules } from '../../common/forms/services/form.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'
import { logHandledError } from '../../common/helpers/logging/handled-error.js'

/**
 * The post-submission rules each listed application answers to, by reference: those of the latest definition
 * within the major the backend pins it to, as when it is opened. The latest definition serves its own major and
 * any other major is read from the backend once. An application without a pinned major, or whose major has no
 * readable definition, answers to the latest definition's rules instead, as every row did before majors were
 * told apart, with `ownMajor` false so the caller treats the verdict as a hint.
 *
 * @param {AnyRequest} request
 * @param {string} grantCode
 * @param {DefinitionDocument | null | undefined} latest - The grant's latest definition document
 * @param {{ applicationRef: string, pinnedMajor?: number | null }[]} applications
 * @returns {Promise<Map<string, ApplicationRules>>}
 */
export async function readPostSubmissionRules(request, grantCode, latest, applications) {
  if (applications.length === 0) {
    return new Map()
  }
  const majors = applications.map((application) => ({ application, major: pinnedMajorOf(application) }))
  const unpinned = majors
    .filter(({ major }) => major === undefined)
    .map(({ application }) => application.applicationRef)
  if (unpinned.length > 0) {
    log(LogCodes.APPLICATIONS.NO_PINNED_MAJOR, { grantCode, applicationRefs: unpinned.join(', ') }, request)
  }
  const otherMajors = /** @type {number[]} */ (
    [...new Set(majors.map(({ major }) => major))].filter((major) => major !== undefined && major !== latest?.major)
  )

  const [sharedRules, ...documents] = await Promise.all([
    loadSharedRedirectRules(),
    ...otherMajors.map((major) => readDefinitionWithinMajor(request, grantCode, major))
  ])
  const rulesOf = (/** @type {DefinitionDocument | null | undefined} */ document) =>
    mergeGrantRedirectRules(
      /** @type {object | undefined} */ (document?.definition?.metadata?.grantRedirectRules),
      sharedRules
    ).postSubmission ?? []
  const latestRules = rulesOf(latest)
  const rulesByMajor = new Map(
    otherMajors.flatMap((major, index) => (documents[index] ? [[major, rulesOf(documents[index])]] : []))
  )
  if (latest && Number.isInteger(latest.major)) {
    rulesByMajor.set(/** @type {number} */ (latest.major), latestRules)
  }

  return new Map(
    majors.map(({ application, major }) => {
      const own = major === undefined ? undefined : rulesByMajor.get(major)
      return [
        application.applicationRef,
        own ? { rules: own, ownMajor: true } : { rules: latestRules, ownMajor: false }
      ]
    })
  )
}

/**
 * The major the backend pins an application to; undefined when it lists none.
 * @param {{ pinnedMajor?: number | null }} application
 * @returns {number | undefined}
 */
function pinnedMajorOf(application) {
  return Number.isInteger(application.pinnedMajor) ? /** @type {number} */ (application.pinnedMajor) : undefined
}

/**
 * The latest definition document within a major, from the backend; undefined, logged, when none can be read.
 * @param {AnyRequest} request @param {string} grantCode @param {number} major
 * @returns {Promise<DefinitionDocument | undefined>}
 */
async function readDefinitionWithinMajor(request, grantCode, major) {
  try {
    const document = await fetchLatestDefinitionFromApi(grantCode, { major })
    if (document?.definition) {
      return document
    }
    const errorMessage = document ? 'Definition has no content' : 'No active definition'
    log(LogCodes.APPLICATIONS.RULES_UNAVAILABLE, { grantCode, major, errorMessage }, request)
  } catch (error) {
    logHandledError(error, request, {
      fallbackCode: LogCodes.APPLICATIONS.RULES_UNAVAILABLE,
      fallbackDetails: { grantCode, major }
    })
  }
  return undefined
}

/**
 * The rules an application answers to, and whether they are its own major's; when not, they are the latest
 * definition's and only good for a label.
 * @typedef {{ rules: RedirectRule[], ownMajor: boolean }} ApplicationRules
 * @import { DefinitionDocument } from '../../common/helpers/state/fetch-saved-state-helper.js'
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { RedirectRule } from '../../common/request-pipeline/redirects/forms-status-redirect.js'
 */
