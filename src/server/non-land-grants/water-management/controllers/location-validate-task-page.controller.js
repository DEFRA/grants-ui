import LocationValidateController from '~/src/server/non-land-grants/water-management/controllers/location-validate.controller.js'
import { withTaskContext } from '~/src/server/task-list/task-list.helper.js'

/**
 * Controller for individual task pages (pages with a section property).
 * Uses the withTaskContext mixin to override navigation to keep users within a task and return to task list when done.
 */
export default class LocationValidateTaskPageController extends withTaskContext(LocationValidateController) {}
