# Forms component maps

Grants UI initialises the forms engine's `OsGridRefField`, `EastingNorthingField`, `LatLongField` and `GeospatialField` maps on any form page. Each component's `options` controls postcode centring and automatic help-panel closure. Both are enabled by default; no page-specific route or controller is needed.

```yaml
components:
  - name: location
    type: OsGridRefField
    title: Where is the location?
    options:
      hideMapHelpPanel: false # Keep the initial map help panel open
      zoomToPostcode: false  # Use the UK overview instead of the saved postcode
```

Use YAML booleans, not quoted strings. Omit an option (or set it to `true`) to enable that behaviour. Settings apply only to that component, including when multiple maps share a page and when validation errors are rendered. The page's `config` object is not used for these options.

`zoomToPostcode` replaces `zoomToCity`. Update any existing form definitions that explicitly use the old option; it is no longer read.

## Starting view

The shared layout reads `context.state.additionalAnswers.applicant.business.address.postalCode` and renders only the postcode and per-component map settings in escaped, hidden HTML attributes. When at least one map has `options.zoomToPostcode` enabled, the browser looks up that postcode once through the existing `/api/geocode-proxy` route before initialising the maps with the engine's helpers. Maps with `zoomToPostcode: false` retain the UK overview as their default.

A unique exact `Postcode` result is required. Matching ignores case and whitespace, so `SW1A 1AA` and `sw1a1aa` match the same postcode. City, town and road results are ignored. The OS Names response uses British National Grid coordinates, which are converted with the engine's exported helper. The resulting default view uses zoom level 10 for a wider surrounding-area view and leaves the location answer empty.

Missing or blank postcode state, ambiguous or unmatched results, invalid coordinates and lookup failures retain the engine's UK overview. There is no fallback to the city. The lookup is aborted after two seconds. An existing location answer, saved geospatial features or map view in the URL retain the engine's normal precedence over this default.

Maps and search require `FORMS_MAPS_API_KEY` and `FORMS_MAPS_API_SECRET`, with OS Names API and OS Vector Tile API available in the OS Data Hub project. These are separate from the land parcel map credentials documented in [MAPS.md](MAPS.md).

## Help panel

When `options.hideMapHelpPanel` is enabled, Grants UI observes that forms map until its initial `info` panel appears and closes it through the panel's normal close button. This allows the map to recalculate its layout. Other panels and the optional “How to find location details” guidance are unaffected. The observer disconnects after closing the panel or when leaving the page. Users can reopen the help panel normally.

Implementation lives in `src/client/javascripts/component-maps.js`, the `componentMapOptions` Nunjucks global and the shared `layouts/page.njk` template. The integration uses the engine's `map.defaultConfig`, `geospatialMap.processGeospatial` and internal `processLocation` helper (imported from the installed package through the existing `~` project resolver, without a dedicated alias). Each helper copies the component's starting view synchronously; Grants UI then restores the shared default. Native map indices and form-submit protection are retained. Verify these integration points and the help panel DOM when upgrading the forms engine or interactive map dependencies.
