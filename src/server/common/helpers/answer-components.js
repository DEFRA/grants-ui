export const DISPLAY_ONLY_TYPES = new Set(['Html', 'Details', 'InsetText', 'Markdown', 'List', 'NotificationBanner'])

/**
 * Controls answer display only; excluded fields still participate in state and submission.
 * @param {{ type: string }} component - A component definition or engine field
 * @returns {boolean}
 */
export function shouldDisplayAnswer(component) {
  return component.type !== 'HiddenField' && !DISPLAY_ONLY_TYPES.has(component.type)
}
