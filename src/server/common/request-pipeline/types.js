/**
 * @typedef {import('@hapi/hapi').Request & {
 *   can: (
 *     action: string,
 *     resource: string
 *   ) => boolean,
 *   app: {
 *     model?: import('@defra/forms-engine-plugin/engine/models/FormModel.js').FormModel
 *   }
 * }} PipelineRequest
 */

export {}
