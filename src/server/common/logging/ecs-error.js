import { randomUUID } from 'node:crypto'

/**
 * Maps a JS Error object to ECS-compliant error fields.
 *
 * @param {Error} error
 * @returns {{
 *   type: string,
 *   message: string,
 *   stack_trace: string,
 *   id: string,
 *   code?: string | number
 * }}
 */
export function toEcsError(error) {
  /** @type {{
   *   type: string,
   *   message: string,
   *   stack_trace: string,
   *   id: string,
   *   code?: string | number
   * }} */
  const ecs = {
    type: error.constructor.name,
    message: error.message,
    stack_trace: error.stack || '',
    id: randomUUID()
  }

  if (typeof error === 'object' && error !== null && 'code' in error) {
    // @ts-ignore - dynamic error.code supported
    ecs.code = error.code
  }

  return ecs
}
