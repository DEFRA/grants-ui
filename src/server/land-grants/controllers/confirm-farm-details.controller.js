import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { formatPhone } from '~/src/config/nunjucks/filters/format-phone.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
import { sbiStore } from '~/src/server/sbi/state.js'
import { fetchBusinessAndCustomerInformation } from '../../common/services/consolidated-view/consolidated-view.service.js'

const logger = createLogger()

export default class ConfirmFarmDetailsController extends QuestionPageController {
  viewName = 'confirm-farm-details'
  crn = 3646257965
  farmInfoMissingErrorMessage =
    'Unable to find farm information, please try again later.'

  /**
   * Handle GET requests to the confirm farm details page
   */
  makeGetRouteHandler() {
    return async (request, context, h) => {
      const baseViewModel = super.getViewModel(request, context)

      try {
        const farmDetails = await this.buildFarmDetails()
        return h.view(this.viewName, { ...baseViewModel, farmDetails })
      } catch (error) {
        return this.handleError(error, baseViewModel, h)
      }
    }
  }

  /**
   * Build farm details view model
   * @returns {Promise<object>} Farm details object with rows array
   */
  async buildFarmDetails() {
    const sbi = sbiStore.get('sbi')
    const data = await fetchBusinessAndCustomerInformation(sbi, this.crn)

    const rows = []

    this.addCustomerNameRow(rows, data.customer?.name)
    this.addBusinessNameRow(rows, data.business?.name)
    this.addAddressRow(rows, data.business?.address)
    this.addSbiRow(rows, sbi)
    this.addContactDetailsRow(
      rows,
      data.business?.phone?.mobile,
      data.business?.email?.address
    )

    return { rows }
  }

  /**
   * Add customer name row if available
   */
  addCustomerNameRow(rows, name) {
    if (!name) return

    const fullName = [name.first, name.middle, name.last]
      .filter(Boolean)
      .join(' ')

    if (fullName) {
      rows.push({
        key: { text: 'Name' },
        value: { text: fullName }
      })
    }
  }

  /**
   * Add business name row if available
   */
  addBusinessNameRow(rows, businessName) {
    if (businessName) {
      rows.push({
        key: { text: 'Business name' },
        value: { text: businessName }
      })
    }
  }

  /**
   * Add address row if available
   */
  addAddressRow(rows, address) {
    if (!address) return

    const addressParts = [
      address.line1,
      address.line2,
      address.line3,
      address.street,
      address.city,
      address.postalCode
    ]
      .filter(Boolean)
      .map((part) =>
        part
          .toString()
          .trim()
          .replace(/^[,\s]+|[,\s]+$/g, '')
      )
      .filter((part) => part.length > 0)

    if (addressParts.length > 0) {
      rows.push({
        key: { text: 'Address' },
        value: { html: addressParts.join('<br/>') }
      })
    }
  }

  /**
   * Add SBI number row
   */
  addSbiRow(rows, sbi) {
    rows.push({
      key: { text: 'SBI number' },
      value: { text: sbi }
    })
  }

  /**
   * Add contact details row if available
   */
  addContactDetailsRow(rows, mobile, emailAddress) {
    const contactParts = []

    if (mobile) {
      contactParts.push(formatPhone(mobile))
    }

    if (emailAddress) {
      contactParts.push(emailAddress)
    }

    if (contactParts.length > 0) {
      rows.push({
        key: { text: 'Contact details' },
        value: { html: contactParts.join('<br/>') }
      })
    }
  }

  /**
   * Handle errors and return error view
   */
  handleError(error, baseViewModel, h) {
    const sbi = sbiStore.get('sbi')

    logger.error(
      { err: error, sbi },
      'Unexpected error when fetching farm information'
    )

    return h.view(this.viewName, {
      ...baseViewModel,
      errorMessage: this.farmInfoMissingErrorMessage
    })
  }
}

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */
