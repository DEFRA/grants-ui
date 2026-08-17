import crypto from 'node:crypto'

const IV_LENGTH_BYTES = 12
const KEY_LENGTH_BYTES = 32
const SCRYPT_SALT = 'salt'
const CIPHER_ALGORITHM = 'aes-256-gcm'
/** @type {Record<string, BufferEncoding>} */
const ENCODING = {
  UTF8: 'utf8',
  BASE64: 'base64'
}

/**
 * Encrypts the bearer token using AES-256-GCM
 * @param {string} token - The token to encrypt
 * @param {string} encryptionKey - Encryption key
 * @returns {string} Encrypted token in format: iv:authTag:encryptedData (base64)
 */
export function encryptToken(token, encryptionKey) {
  const iv = crypto.randomBytes(IV_LENGTH_BYTES)
  const key = crypto.scryptSync(encryptionKey, SCRYPT_SALT, KEY_LENGTH_BYTES)
  const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, key, iv)

  let encrypted = cipher.update(token, ENCODING.UTF8, ENCODING.BASE64)
  encrypted += cipher.final(ENCODING.BASE64)

  const authTag = cipher.getAuthTag()

  return `${iv.toString(ENCODING.BASE64)}:${authTag.toString(ENCODING.BASE64)}:${encrypted}`
}
