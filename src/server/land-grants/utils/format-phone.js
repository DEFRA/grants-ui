/**
 * @param {string} phone
 */
export const formatPhone = (phone) =>
  phone.replace(/\s/g, '').replace(/^(\d{5})(\d{6})$/, '$1 $2')
