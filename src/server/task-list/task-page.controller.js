import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { withTaskContext } from './task-list.helper.js'

/**
 * Controller for individual task pages (pages with a section property).
 * Uses the withTaskContext mixin to override navigation to keep users within a task and return to task list when done.
 */
export default class TaskPageController extends withTaskContext(QuestionPageController) {
  // The task helper honours this only when there are no required questions or completion requirements.
  get excludeFromTaskCompletion() {
    return 'components' in this.pageDef && (this.pageDef.components?.length ?? 0) > 0
  }
}
