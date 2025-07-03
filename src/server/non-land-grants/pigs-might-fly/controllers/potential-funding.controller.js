import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { invokeGasPostAction } from '~/src/server/common/services/grant-application/grant-application.service.js'

export class PotentialFundingController extends QuestionPageController {
  viewName = 'potential-funding'

  makeGetRouteHandler() {
    const fn = async (request, context, h) => {
      const payload = {
        pigTypes: [
          {
            pigType: 'largeWhite',
            quantity: context.state.whitePigsCount || 0
          },
          {
            pigType: 'britishLandrace',
            quantity: context.state.britishLandracePigsCount || 0
          },
          {
            pigType: 'berkshire',
            quantity: context.state.berkshirePigsCount || 0
          },
          { pigType: 'other', quantity: context.state.otherPigsCount || 0 }
        ]
      }

      try {
        const result = await invokeGasPostAction(
          'pigs-might-fly',
          'calculate-pig-totals',
          payload
        )

        // tranform result.items to an object keyed on type
        context.pigData = result.items.reduce((acc, item) => {
          acc[item.type] = item
          return acc
        }, {})

        context.grandTotal = result.items.reduce((total, item) => {
          return total + (item.total || 0)
        }, 0)

        context.pigDataJson = JSON.stringify(result.pigsData)
        const { viewName } = this
        const baseViewModel = super.getViewModel(request, context)

        const viewModel = {
          ...baseViewModel
        }

        return h.view(viewName, viewModel)
      } catch (error) {
        request.logger.error('Error invoking GAS action:', error)
        throw error
      }
    }
    return fn
  }

  makePostRouteHandler() {
    const fn = (request, context, h) => {
      return this.proceed(request, h, this.getNextPath(context))
    }

    return fn
  }
}
