import DeclarationPageController from '~/src/server/declaration/declaration-page.controller.js'

export default class WoodlandDeclarationPageController extends DeclarationPageController {
  buildApplicationData(request, context) {
    const applicationData = super.buildApplicationData(request, context)
    const { state } = context

    if (state.totalHectaresAppliedFor !== undefined) {
      applicationData.answers.totalHectaresAppliedFor = state.totalHectaresAppliedFor
    }

    return applicationData
  }
}
