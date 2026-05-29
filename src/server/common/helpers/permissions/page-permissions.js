export function getPermissionConfig(request) {
  return request.app.model.def.metadata.permissions
}

export function getRequiredPermission(request) {
  const permissionConfig = getPermissionConfig(request)

  const matchedRule = permissionConfig?.pageAccess?.rules?.find((rule) => rule.paths.includes(request.params.path))

  return matchedRule?.permission ?? permissionConfig?.pageAccess?.default
}

export function getPermissionResource(request) {
  const permissionConfig = getPermissionConfig(request)

  return permissionConfig.resource || 'csApplications'
}
