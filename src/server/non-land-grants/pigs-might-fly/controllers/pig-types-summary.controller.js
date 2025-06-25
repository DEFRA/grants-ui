import { hasComponents } from '@defra/forms-model'
import { ComponentCollection } from '@defra/forms-engine-plugin/engine/components/ComponentCollection.js'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { invokeGasPostAction } from '~/src/server/common/services/grant-application/grant-application.service.js'

export class PotentialFundingController extends QuestionPageController {
  constructor(model, pageDef) {
    super(model, pageDef)

    // Components collection
    this.collection = new ComponentCollection(
      hasComponents(pageDef) ? pageDef.components : [],
      {
        model,
        page: this
      }
    )
  }

  getViewModel(request, context) {
    const payload = {
      pigBreeds: [
        {
          pigType: 'largeWhite',
          quantity: context.state.whitePigsCount || 0
        },
        {
          pigType: 'landace',
          quantity: context.state.britishLandacePigsCount || 0
        },
        {
          pigType: 'berkshire',
          quantity: context.state.berkshirePigsCount || 0
        },
        { pigType: 'other', quantity: context.state.otherPigsCount || 0 }
      ]
    }

    const pigsDataPromise = new Promise((resolve, reject) => {
      try {
        const result = invokeGasPostAction(
          'pigs-might-fly',
          'calculate-pig-totals',
          payload
        )
        resolve(result)
      } catch (error) {
        reject(error)
      }
    })

    pigsDataPromise
      // eslint-disable-next-line promise/always-return
      .then((pigsData) => {
        context.pigData = pigsData
      })
      .catch(() => {
        // Handle any errors
      })

    return super.getViewModel(request, context)
  }
}
