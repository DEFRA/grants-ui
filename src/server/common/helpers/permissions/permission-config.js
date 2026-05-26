export function isPermissionEnforced(request) {
  return request.app?.model?.def?.metadata?.permissions?.enforce !== false
}
