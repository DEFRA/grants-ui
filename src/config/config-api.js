/**
 * Convict schema for the Config API integration
 */
export const configApiSchema = {
  url: {
    doc: 'Config API base URL',
    format: String,
    default: '',
    env: 'CONFIG_API_URL'
  },
  jwtSecret: {
    doc: 'JWT secret for signing Config API bearer tokens',
    format: String,
    default: '',
    sensitive: true,
    env: 'CONFIG_API_JWT_SECRET'
  },
  jwtExpiry: {
    doc: 'JWT expiry for Config API tokens (e.g. "1h", "30m")',
    format: String,
    default: '1h',
    env: 'CONFIG_API_JWT_EXPIRY'
  },
  formSlugs: {
    doc: 'Comma-separated list of form slugs to load from the Config API instead of YAML files',
    format: Array,
    default: [],
    env: 'FORMS_API_SLUGS'
  },
  cacheTtlSeconds: {
    doc: 'Redis TTL in seconds for form definitions loaded from the Config API',
    format: 'nat',
    default: 300,
    env: 'FORMS_API_CACHE_TTL_SECONDS'
  }
}
