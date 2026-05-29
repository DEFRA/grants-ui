/**
 * @typedef {import('@hapi/hapi').Request & {
 *   can: (action: string, resource: string) => boolean
 * }} AuthorisedRequest
 */

/**
 * @typedef {AuthorisedRequest & {
 *   app: {
 *     model?: {
 *       def?: {
 *         metadata?: {
 *           permissions?: {
 *             enforce?: boolean
 *           }
 *         }
 *       }
 *     }
 *   }
 * }} PipelineRequest
 */

export {}
