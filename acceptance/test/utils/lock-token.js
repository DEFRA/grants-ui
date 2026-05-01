import jwt from 'jsonwebtoken'

export function mintLockToken(crn, sbi, grantCode, grantVersion = 1) {
  return jwt.sign(
    {
      sub: crn,
      sbi,
      grantCode,
      grantVersion,
      typ: 'lock'
    },
    process.env.APPLICATION_LOCK_TOKEN_SECRET,
    {
      audience: 'grants-backend',
      issuer: 'grants-ui'
    }
  )
}
