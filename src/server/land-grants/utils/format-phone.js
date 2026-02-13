/**
 * @param {string} phone
 */
export const formatPhone = (phone) => phone?.replaceAll(/\s/g, '').replaceAll(/^(\d{5})(\d{6})$/g, '$1 $2')
