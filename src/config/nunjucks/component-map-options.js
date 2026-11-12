const MAP_COMPONENT_TYPES = new Set(['OsGridRefField', 'EastingNorthingField', 'LatLongField', 'GeospatialField'])

/**
 * Expose only the map settings from the resolved page's component collection.
 * Custom component options are retained by the forms engine but not its component view models.
 * @param {{ collection?: { fields?: Array<{ type: string, name: string, options?: Record<string, unknown> }> } }} [page]
 */
export function componentMapOptions(page) {
  return (page?.collection?.fields ?? [])
    .filter((field) => MAP_COMPONENT_TYPES.has(field.type))
    .map((field) => ({
      name: field.name,
      hideMapHelpPanel: field.options?.hideMapHelpPanel !== false,
      zoomToPostcode: field.options?.zoomToPostcode !== false,
      showApproximateLocation: field.type !== 'GeospatialField' && field.options?.showApproximateLocation === true,
      approximateLocationPrefix:
        typeof field.options?.approximateLocationPrefix === 'string'
          ? field.options.approximateLocationPrefix
          : undefined
    }))
}
