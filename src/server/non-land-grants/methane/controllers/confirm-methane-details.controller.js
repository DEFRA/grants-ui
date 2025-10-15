import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
import { fetchBusinessAndCPH } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { formatPhone } from '~/src/server/land-grants/utils/format-phone.js'

const logger = createLogger()

export default class ConfirmMethaneDetailsController extends QuestionPageController {
  viewName = 'confirm-methane-details'

  // Constants
  static ERROR_MESSAGE = 'Unable to find farm information, please try again later.'

  /**
   * Handle GET requests to the confirm farm details page
   */
  makeGetRouteHandler() {
    return async (request, context, h) => {
      const baseViewModel = super.getViewModel(request, context)
      const { sbi, crn } = request.auth.credentials

      try {
        const farmDetails = await this.buildFarmDetails(crn, sbi)
        return h.view(this.viewName, { ...baseViewModel, farmDetails })
      } catch (error) {
        return this.handleError(sbi, error, baseViewModel, h)
      }
    }
  }

  /**
   * Build farm details view model
   * @returns {Promise<object>} Farm details object with rows array
   */
  async buildFarmDetails(crn, sbi) {
    const data = await fetchBusinessAndCPH(sbi, crn)

    const rows = [
      this.createCustomerNameRow(data.customer?.name),
      this.createBusinessNameRow(data.business?.name),
      this.createSbiRow(sbi),
      this.createContactDetailsRow(data.business?.phone?.mobile, data.business?.email?.address),
      this.createAddressRow(data.business?.address),
      this.createTypeRow(data.business?.type),
      this.createCPHRow(data.countyParishHoldings),
      this.createVATRow(data.business?.vat)
    ].filter(Boolean)

    return { rows }
  }

  createVATRow(vat) {
    if (!vat) {
      return null
    }

    return {
      key: { text: 'VAT number' },
      value: { text: vat }
    }
  }

  createCPHRow(countyParishHoldings) {
    if (countyParishHoldings.length === 0) {
      return null
    }

    return {
      key: { text: 'County Parish Holdings' },
      value: {
        text: countyParishHoldings
      }
    }
  }

  /**
   * Create customer name row if available
   * @returns {object|null} Row object or null if no valid name
   */
  createCustomerNameRow(name) {
    if (!name) {
      return null
    }

    const fullName = [name.first, name.middle, name.last].filter(Boolean).join(' ')

    if (!fullName) {
      return null
    }

    return {
      key: { text: 'Name' },
      value: { text: fullName }
    }
  }

  /**
   * Create business name row if available
   * @returns {object|null} Row object or null if no business name
   */
  createBusinessNameRow(businessName) {
    if (!businessName) {
      return null
    }

    return {
      key: { text: 'Business name' },
      value: { text: businessName }
    }
  }

  /**
   * Create address row if available
   * @returns {object|null} Row object or null if no valid address
   */
  createAddressRow(address) {
    if (!address) {
      return null
    }

    const addressParts = [address.line1, address.line2, address.line3, address.street, address.city, address.postalCode]
      .filter(Boolean)
      .map((part) => part.trim())
      .filter((part) => part.length > 0)

    if (addressParts.length === 0) {
      return null
    }

    return {
      key: { text: 'Address' },
      value: { html: addressParts.join('<br/>') }
    }
  }

  /**
   * Create SBI number row
   * @returns {object} Row object with SBI number
   */
  createSbiRow(sbi) {
    return {
      key: { text: 'SBI number' },
      value: { text: sbi }
    }
  }

  /**
   * Create contact details row if available
   * @returns {object|null} Row object or null if no contact details
   */
  createContactDetailsRow(mobile, emailAddress) {
    const contactParts = []

    if (mobile) {
      contactParts.push(formatPhone(mobile))
    }

    if (emailAddress) {
      contactParts.push(emailAddress)
    }

    if (contactParts.length === 0) {
      return null
    }

    return {
      key: { text: 'Contact details' },
      value: { html: contactParts.join('<br/>') }
    }
  }

  /**
   * Handle errors and return error view
   */
  handleError(sbi, error, baseViewModel, h) {
    logger.error({ err: error, sbi }, 'Unexpected error when fetching farm information')

    return h.view(this.viewName, {
      ...baseViewModel,
      error: {
        titleText: 'There is a problem',
        errorList: [
          {
            text: ConfirmMethaneDetailsController.ERROR_MESSAGE,
            href: ''
          }
        ]
      }
    })
  }

  makePostRouteHandler() {
    /**
     * Handle POST requests to the confirm farm details page.
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     * @returns {Promise<ResponseObject>}
     */
    const fn = async (request, context, h) => {
      const { state } = context
      const { sbi, crn } = request.auth.credentials

      if (sbi) {
        const applicant = await fetchBusinessAndCPH(sbi, crn)
        await this.setState(request, {
          ...state,
          applicant
        })
      }

      return this.proceed(request, h, this.getNextPath(context))
    }

    return fn
  }

  createTypeRow(type) {
    if (!type) {
      return null
    }

    const { type: organisationType } = type

    return {
      key: { text: 'Type' },
      value: { text: organisationType }
    }
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */
