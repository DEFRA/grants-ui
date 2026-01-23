import { formatCurrency } from '~/src/config/nunjucks/filters/filters.js'
import { landActionWithCode } from '~/src/server/land-grants/utils/land-action-with-code.js'
import { stringifyParcel } from '../utils/format-parcel.js'
import { actionGroups } from '../services/land-grants.service.js'

/**
 * Maps payment information to view models for rendering in check pages.
 * Handles transformation of payment data into table rows and summary items.
 */

/**
 * Get formatted price from pence value
 * @param {number} value - Value in pence
 * @returns {string} - Formatted currency string
 */
export function formatPrice(value) {
  return formatCurrency(value / 100, 'en-GB', 'GBP', 2, 'currency')
}

/**
 * Creates action links for a parcel item
 * @param {ParcelItemData} data - Payment item data
 * @returns {object} HTML object with links
 */
function createLinks(data) {
  const parcelParam = stringifyParcel({
    parcelId: data.parcelId,
    sheetId: data.sheetId
  })
  const parcel = `${data.sheetId} ${data.parcelId}`
  const links = []

  links.push(
    `<li class='govuk-summary-list__actions-list-item'><a class='govuk-link' href='select-actions-for-land-parcel?parcelId=${parcelParam}'>Change</a><span class="govuk-visually-hidden"> land action ${data.code} for parcel ${parcel}</span></li>
    <li class='govuk-summary-list__actions-list-item'><a class='govuk-link' href='remove-action?parcelId=${parcelParam}&action=${data.code}'>Remove</a><span class="govuk-visually-hidden"> land action ${data.code} for parcel ${parcel}</span></li>`
  )

  return {
    html: `<ul class='govuk-summary-list__actions-list'>${links.join('')}</ul>`
  }
}

/**
 * Creates a table row for a parcel item
 * @param {ParcelItemData} data - Payment item data
 * @returns {Array<object>} Table row data
 */
export function createParcelItemRow(data) {
  const linksCell = createLinks(data)

  return [
    { text: landActionWithCode(data.description, data.code) },
    { text: data.quantity, format: 'numeric' },
    { text: formatPrice(data.annualPaymentPence), format: 'numeric' },
    linksCell
  ]
}

/**
 * Builds header actions for a land parcel card
 * @param {string} sheetId - Sheet ID
 * @param {string} parcelId - Parcel ID
 * @returns {object} Header actions configuration
 */
export function buildLandParcelHeaderActions(sheetId, parcelId) {
  return {
    text: 'Remove',
    href: `remove-parcel?parcelId=${sheetId}-${parcelId}`,
    hiddenTextValue: `all actions for Land Parcel ${sheetId} ${parcelId}`
  }
}

/**
 * Builds footer actions for a land parcel card
 * @param {object} selectedActions - All selected actions
 * @param {string} sheetId - Sheet ID
 * @param {string} parcelId - Parcel ID
 * @returns {object} Footer actions configuration or empty object
 */
export function buildLandParcelFooterActions(selectedActions, sheetId, parcelId) {
  const uniqueCodes = [
    ...new Set(
      Object.values(selectedActions)
        .filter((item) => `${item.sheetId} ${item.parcelId}` === `${sheetId} ${parcelId}`)
        .map((item) => item.code)
    )
  ]

  const hasActionFromGroup = actionGroups.map((group) => uniqueCodes.some((code) => group.actions.includes(code)))

  if (hasActionFromGroup.every(Boolean)) {
    return {}
  }

  return {
    text: 'Add another action',
    href: `select-actions-for-land-parcel?parcelId=${sheetId}-${parcelId}`,
    hiddenTextValue: `to Land Parcel ${sheetId} ${parcelId}`
  }
}

/**
 * Maps payment information to parcel items for display
 * @param {PaymentInfo} paymentInfo - Payment information from API
 * @returns {Array<ParcelCardViewModel>} Array of parcel card view models
 */
export function mapPaymentInfoToParcelItems(paymentInfo) {
  const groupedByParcel = Object.values(paymentInfo?.parcelItems || {}).reduce((acc, data) => {
    const parcelKey = `${data.sheetId} ${data.parcelId}`

    if (!acc[parcelKey]) {
      acc[parcelKey] = {
        cardTitle: `Land parcel ${parcelKey}`,
        headerActions: buildLandParcelHeaderActions(data.sheetId, data.parcelId),
        footerActions: buildLandParcelFooterActions(paymentInfo?.parcelItems, data.sheetId, data.parcelId),
        parcelId: parcelKey,
        items: []
      }
    }

    acc[parcelKey].items.push(createParcelItemRow(data))
    return acc
  }, {})

  return Object.values(groupedByParcel)
}

/**
 * Maps payment information to additional yearly payments
 * @param {PaymentInfo} paymentInfo - Payment information from API
 * @returns {Array<AdditionalPaymentViewModel>} Array of additional payment view models
 */
export function mapAdditionalYearlyPayments(paymentInfo) {
  return Object.values(paymentInfo?.agreementLevelItems || {}).map((data) => ({
    items: [
      [
        {
          text: `Additional payment per agreement per year for ${landActionWithCode(data.description, data.code)}`
        },
        {
          html: `<div class="govuk-!-width-one-half">${formatPrice(data.annualPaymentPence)}</div>`,
          format: 'numeric',
          classes: 'govuk-!-padding-right-5'
        }
      ]
    ]
  }))
}

/**
 * @typedef {object} ParcelItemData
 * @property {string} sheetId - Sheet ID
 * @property {string} parcelId - Parcel ID
 * @property {string} code - Action code
 * @property {string} description - Action description
 * @property {string} quantity - Quantity (e.g., "10 hectares")
 * @property {number} annualPaymentPence - Annual payment in pence
 */

/**
 * @typedef {object} PaymentInfo
 * @property {object} [parcelItems] - Parcel items
 * @property {object} [agreementLevelItems] - Agreement level items
 * @property {number} [annualTotalPence] - Total annual payment in pence
 */

/**
 * @typedef {object} ParcelCardViewModel
 * @property {string} cardTitle - Card title
 * @property {object} headerActions - Header actions configuration
 * @property {object} footerActions - Footer actions configuration
 * @property {string} parcelId - Parcel identifier
 * @property {Array<Array<object>>} items - Table row items
 */

/**
 * @typedef {object} AdditionalPaymentViewModel
 * @property {Array<Array<object>>} items - Payment item rows
 */
