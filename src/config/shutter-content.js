/**
 * Read from the environment directly because convict cannot declare per-slug variable names.
 * @param {string} slug
 * @returns {string | undefined}
 */
export function shutterContentFor(slug) {
  const envSuffix = slug.toUpperCase().replaceAll(/[^A-Z0-9]/g, '_')
  return process.env[`SHUTTER_ENABLED_CONTENT_${envSuffix}`]?.trim() || undefined
}
