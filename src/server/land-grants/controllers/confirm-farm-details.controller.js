import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
import { formatPhone } from '~/src/server/land-grants/utils/format-phone.js'
import { sbiStore } from '~/src/server/sbi/state.js'
import { fetchBusinessAndCustomerInformation } from '../../common/services/consolidated-view/consolidated-view.service.js'
import { config } from '~/src/config/config.js'

const logger = createLogger()

export default class ConfirmFarmDetailsController extends QuestionPageController {
  viewName = 'confirm-farm-details'

  // Constants
  static ERROR_MESSAGE = 'Unable to find farm information, please try again later.'

  /**
   * Handle GET requests to the confirm farm details page
   */
  makeGetRouteHandler() {
    return async (request, context, h) => {
      const baseViewModel = super.getViewModel(request, context)

      try {
        const { sbi, crn } = this.selectSbiAndCrn(request)
        const farmDetails = await this.buildFarmDetails(crn, sbi)
        return h.view(this.viewName, { ...baseViewModel, farmDetails })
      } catch (error) {
        return this.handleError(error, baseViewModel, h)
      }
    }
  }

  selectSbiAndCrn(request) {
    if (config.get('defraId.enabled')) {
      const sbi =
        (Array.isArray(request.auth.credentials.relationships) &&
          request.auth.credentials.relationships[0]?.split(':')[1]) ||
        null
      sbiStore.set(sbi)
      return {
        crn: request.auth.credentials.contactId,
        sbi
      }
    }

    return {
      crn: config.get('landGrants.customerReferenceNumber'),
      sbi: sbiStore.get('sbi')
    }
  }

  /**
   * Build farm details view model
   * @returns {Promise<object>} Farm details object with rows array
   */
  async buildFarmDetails(crn, sbi) {
    const data = await fetchBusinessAndCustomerInformation(sbi, crn)

    const rows = [
      this.createCustomerNameRow(data.customer?.name),
      this.createBusinessNameRow(data.business?.name),
      this.createAddressRow(data.business?.address),
      this.createSbiRow(sbi),
      this.createContactDetailsRow(data.business?.phone?.mobile, data.business?.email?.address)
    ].filter(Boolean)

    return { rows }
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
  handleError(error, baseViewModel, h) {
    const sbi = sbiStore.get('sbi')

    logger.error({ err: error, sbi }, 'Unexpected error when fetching farm information')

    return h.view(this.viewName, {
      ...baseViewModel,
      error: {
        titleText: 'There is a problem',
        errorList: [
          {
            text: ConfirmFarmDetailsController.ERROR_MESSAGE,
            href: ''
          }
        ]
      }
    })
  }

  makePostRouteHandler() {
    /**
     * Handle POST requests to the confirm farm details page.
     * @param {FormRequest} request
     * @param {FormContext} context
     * @param {Pick} h
     * @returns {Promise<void>}
     */
    const fn = async (request, context, h) => {
      const { state } = context
      const { sbi, crn } = this.selectSbiAndCrn(request)

      if (sbi) {
        const applicant = await fetchBusinessAndCustomerInformation(sbi, crn)
        await this.setState(request, {
          ...state,
          sbi,
          applicant
        })
      }

      return this.proceed(request, h, this.getNextPath(context))
    }

    return fn
  }
}

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */
