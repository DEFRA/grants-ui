/**
 * Resolves the requested slug's form definition via the forms service (the
 * per-request combined backend response). Returns `null` when the backend has
 * no definition for the slug.
 *
 * @param {{ params: { slug?: string }, server: { methods: { getFormService: () => { getFormDefinitionBySlug: (slug: string) => Promise<import('@defra/forms-model').FormDefinition> } } } }} request
 * @returns {Promise<import('@defra/forms-model').FormDefinition | null>}
 */
export async function resolveFormDefinition(request) {
  try {
    return await request.server.methods.getFormService().getFormDefinitionBySlug(request.params.slug)
  } catch (err) {
    const boom = /** @type {{ isBoom?: boolean, output?: { statusCode?: number } }} */ (err)
    if (boom?.isBoom && boom.output?.statusCode === 404) {
      return null
    }
    throw err
  }
}
