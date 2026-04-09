/**
 * @import { ParcelCardViewModel, AdditionalPaymentViewModel } from '~/src/server/land-grants/view-models/payment.view-model.js'
 */

/**
 * @typedef {object} PaymentStrategyResult
 * @property {number} totalPence
 * @property {string} totalPayment
 * @property {object} payment
 * @property {ParcelCardViewModel[]} [parcelItems]
 * @property {AdditionalPaymentViewModel[]} [additionalYearlyPayments]
 */

/**
 * @typedef {object} MultiActionState
 * @property {string[]} [parcelIds]
 */

/**
 * @typedef {object} WmpState
 * @property {string[]} [landParcels]
 * @property {number} [newWoodlandAreaHa]
 * @property {number} [oldWoodlandAreaHa]
 */
