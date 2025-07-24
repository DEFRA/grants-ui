import { sbiStore } from '~/src/server/sbi/state.js'

export const keyGenerator = (request) => {
  const { userId, businessId, grantId } = getIdentity(request)
  return `${userId}:${businessId}:${grantId}`
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getIdentity = (_) => {
  if (process.env.SBI_SELECTOR_ENABLED === 'true') {
    const sbi = sbiStore.get('sbi')
    return {
      userId: `user_${sbi}`,
      businessId: `business_${sbi}`,
      grantId: `grant_${sbi}`
    }
  }

  // If there are credentials from DEFRA ID, use those
  // if (identity) {
  //   return {
  //     userId: identity.userId,
  //     businessId: identity.businessId,
  //     grantId: identity.grantId
  //   }
  // }

  // Backup

  return {
    userId: 'placeholder-user-id',
    businessId: 'placeholder-business-id',
    grantId: 'placeholder-grant-id'
  }
}
