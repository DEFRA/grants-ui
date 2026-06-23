export function getPermissionConfig(request) {
  return request.app.model?.def?.metadata?.permissions
}

export function getRequiredPermission(request) {
  const permissionConfig = getPermissionConfig(request)

  const matchedRule = permissionConfig?.pageAccess?.rules?.find((rule) => rule.paths.includes(request.params.path))

  return matchedRule?.permission ?? permissionConfig?.pageAccess?.default
}

export function getPermissionResource(request) {
  const permissionConfig = getPermissionConfig(request)

  if (!permissionConfig) {
    throw new Error('Permission config missing')
  }

  if (!permissionConfig.resource) {
    throw new Error(`Permission enforcement enabled but no resource configured for grant ${request.params.slug}`)
  }

  return permissionConfig.resource
}
