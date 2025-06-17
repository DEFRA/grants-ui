import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import {
  fetchAvailableActionsForParcel,
  parseLandParcel,
  validateLandActions
} from '~/src/server/land-grants/services/land-grants.service.js'

const NOT_AVAILABLE = 'Not available'

export default class LandActionsPageController extends QuestionPageController {
  viewName = 'choose-which-actions-to-do'
  quantityPrefix = 'qty-'
  availableActions = []

  /**
   * Extract action details from the form payload
   * @param {object} payload - The form payload
   * @returns {object} - Extracted action data
   */
  extractActionsObjectFromPayload(payload) {
    const areas = {}
    const { selectedActions = [] } = payload

    for (const key in payload) {
      if (key.startsWith(this.quantityPrefix)) {
        const [, code] = key.split('-')
        const actionInfo = this.availableActions.find((a) => a.code === code)
        if (!selectedActions.includes(code) || !payload[key] || !actionInfo) {
          continue
        }

        areas[code] = {
          description: actionInfo.description,
          value: payload[key],
          unit: actionInfo ? actionInfo.availableArea?.unit : ''
        }
      }
    }
    return areas
  }

  /**
   * This method is called to get the view model for the page.
   * It adds the area prefix and available actions to the view model.
   * @param {FormRequest} request - The request object
   * @param {FormContext} context - The form context
   * @returns {object} - The view model for the page
   */
  getViewModel(request, context) {
    return {
      ...super.getViewModel(request, context),
      quantityPrefix: this.quantityPrefix,
      availableActions: this.availableActions
    }
  }

  getSelectedLandParcelData(context) {
    const { state } = context

    return {
      name: state.selectedLandParcel,
      rows: [
        {
          key: {
            text: 'Total size'
          },
          value: {
            text: NOT_AVAILABLE
          }
        },
        {
          key: {
            text: 'Land Cover'
          },
          value: {
            text: NOT_AVAILABLE
          }
        },
        {
          key: {
            text: 'Intersections'
          },
          value: {
            text: NOT_AVAILABLE
          }
        }
      ]
    }
  }

  /**
   * This method is called when there is a POST request to the select land actions page.
   * It gets the land parcel id and redirects to the next step in the journey.
   */
  makePostRouteHandler() {
    /**
     * Handle POST requests to the page.
     * @param {FormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     * @returns {Promise<import('@hapi/boom').Boom<any> | import('@hapi/hapi').ResponseObject>}
     */
    const fn = async (request, context, h) => {
      const { state } = context
      const { viewName } = this
      const payload = request.payload ?? {}
      const [sheetId, parcelId] = parseLandParcel(state.selectedLandParcel)
      const actionsObj = this.extractActionsObjectFromPayload(payload)

      // Create updated state with the new action data
      const newState = {
        ...state,
        selectedLandParcelSummary: this.getSelectedLandParcelData(context),
        landParcels: {
          ...state.landParcels, // Spread existing land parcels
          [state.selectedLandParcel]: {
            actionsObj
          }
        }
      }

      if (payload.action === 'validate') {
        let errors = []
        if (Object.keys(actionsObj).length === 0) {
          errors.push('Please select at least one action and quantity')
        } else {
          const { valid, errorMessages = [] } = await validateLandActions({
            sheetId,
            parcelId,
            actionsObj
          })

          if (!valid) {
            errors = errorMessages.map((m) => `${m.code}: ${m.description}`)
          }
        }

        if (errors.length > 0) {
          return h.view(viewName, {
            ...this.getViewModel(request, context),
            ...newState,
            errors
          })
        }
      }

      await this.setState(request, newState)
      return this.proceed(request, h, this.getNextPath(context))
    }

    return fn
  }

  /**
   * This method is called when there is a GET request to the land grants actions page.
   * It gets the view model for the page and adds business details
   */
  makeGetRouteHandler() {
    /**
     * Handle GET requests to the page.
     * @param {FormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     */
    const fn = async (request, context, h) => {
      const { collection, viewName } = this
      const { state } = context

      const [sheetId = '', parcelId = ''] = parseLandParcel(
        state.selectedLandParcel
      )

      // Load available actions for the land parcel
      try {
        const data = await fetchAvailableActionsForParcel({ parcelId, sheetId })
        this.availableActions = data.actions || []
        if (!this.availableActions.length) {
          request.logger.error({
            message: `No actions found for parcel ${sheetId}-${parcelId}`,
            selectedLandParcel: state.selectedLandParcel
          })
        }
      } catch (error) {
        this.availableActions = []
        request.logger.error(
          error,
          `Failed to fetch land parcel data for id ${sheetId}-${parcelId}`
        )
      }

      // Build the view model exactly as in the original code
      const viewModel = {
        ...this.getViewModel(request, context),
        ...state,
        selectedLandParcelSummary: this.getSelectedLandParcelData(context),
        errors: collection.getErrors(collection.getErrors())
      }

      return h.view(viewName, viewModel)
    }

    return fn
  }
}

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */
