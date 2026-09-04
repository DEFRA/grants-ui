// Thin entry point loaded by the page (see webpack.config.js and
// select-actions.html) - the actual availability engine and DOM event
// binding live in select-actions-availability.js and select-actions-events.js
// respectively, kept dependency-free of THIS file to avoid a cycle.
import { initSelectActionsPage } from './select-actions-events.js'

initSelectActionsPage(document.getElementById('select-actions-form'))

export { initSelectActionsPage }
