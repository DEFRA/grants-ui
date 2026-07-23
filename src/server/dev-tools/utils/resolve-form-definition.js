import { statusCodes } from '../../common/constants/status-codes.js'

/**
 * Resolves the requested slug's form definition via the forms service (the
 * per-request combined backend response). Returns `null` when the backend has
 * no definition for the slug.
 *
 * @param {{ params: { slug?: string }, server: { methods: { getFormService: () => { getFormDefinitionBySlug: (slug: string) => Promise<import('@defra/forms-model').FormDefinition> } } } }} request
 * @returns {Promise<import('@defra/forms-model').FormDefinition | null>}
 */
export async function resolveFormDefinition(request) {
  const { slug } = request.params
  if (!slug) {
    return null
  }
  try {
    return await request.server.methods.getFormService().getFormDefinitionBySlug(slug)
  } catch (err) {
    const boom = /** @type {{ isBoom?: boolean, output?: { statusCode?: number } }} */ (err)
    if (boom?.isBoom && boom.output?.statusCode === statusCodes.notFound) {
      return null
    }
    throw err
  }
}
