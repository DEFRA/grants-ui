# Forms component maps

Grants UI initialises the forms engine's `OsGridRefField`, `EastingNorthingField`, `LatLongField` and `GeospatialField` maps on any form page. Each component's `options` controls postcode centring and hiding the help panel. Both are enabled by default; no page-specific route or controller is needed. Point-location components can also opt in to an approximate location label.

```yaml
components:
  - name: location
    type: OsGridRefField
    title: Where is the location?
    options:
      hideMapHelpPanel: false # Show the map help panel
      zoomToPostcode: false  # Use the UK overview instead of the saved postcode
```

Use YAML booleans, not quoted strings. Omit `hideMapHelpPanel` or `zoomToPostcode` (or set it to `true`) to enable that behaviour. Settings apply only to that component, including when multiple maps share a page and when validation errors are rendered. The page's `config` object is not used for these options.

`zoomToPostcode` replaces `zoomToCity`. Update any existing form definitions that explicitly use the old option; it is no longer read.

## Starting view

The shared layout reads `context.state.additionalAnswers.applicant.business.address.postalCode` and renders only the postcode and per-component map settings in escaped, hidden HTML attributes. When a map has `options.zoomToPostcode` enabled and needs a default view, the browser looks up that postcode once through the existing `/api/geocode-proxy` route before initialising the maps with the engine's helpers. The lookup is skipped when usable saved location answers, geospatial features or a saved map view in the URL already supply the starting view. Empty or invalid answers still use the postcode default. Maps with `zoomToPostcode: false` retain the UK overview as their default.

A unique exact `Postcode` result is required. Matching ignores case and whitespace, so `SW1A 1AA` and `sw1a1aa` match the same postcode. City, town and road results are ignored. The OS Names response uses British National Grid coordinates, which are converted with the engine's exported helper. The resulting default view uses zoom level 10 for a wider surrounding-area view and leaves the location answer empty.

Missing or blank postcode state, ambiguous or unmatched results, invalid coordinates and lookup failures retain the engine's UK overview. There is no fallback to the city. The lookup is aborted after two seconds. An existing location answer, saved geospatial features or map view in the URL retain the engine's normal precedence over this default.

Maps and search require `FORMS_MAPS_API_KEY` and `FORMS_MAPS_API_SECRET`, with OS Names API and OS Vector Tile API available in the OS Data Hub project. These are separate from the land parcel map credentials documented in [MAPS.md](MAPS.md).

## Help panel

When `options.hideMapHelpPanel` is enabled, Grants UI skips creating the `info` panel for `OsGridRefField`, `EastingNorthingField` and `LatLongField` maps. Set it to `false` to create the help panel and show it initially. An omitted panel cannot be reopened.

For `GeospatialField`, the forms engine creates the help panel internally without a configuration option to omit it. Grants UI observes that map until its initial `info` panel appears and closes it through the panel's normal close button, allowing the map to recalculate its layout. The observer disconnects after closing the panel or when leaving the page. Users can reopen the geospatial help panel normally. Other panels and the optional “How to find location details” guidance are unaffected.

Implementation lives in `src/client/javascripts/component-maps.js`, `src/client/javascripts/location-map.js`, the `componentMapOptions` Nunjucks global and the shared `layouts/page.njk` template. The integration uses the engine's public `map` helpers and `geospatialMap.processGeospatial`, with a local `processLocation` adapter that accepts the per-component options. Each helper copies the component's starting view synchronously; Grants UI then restores the shared default. Native map indices and form-submit protection are retained. Verify these integration points and the geospatial help panel DOM when upgrading the forms engine or interactive map dependencies.

## Approximate location

Set `options.showApproximateLocation: true` to display a label below an `EastingNorthingField`, `LatLongField` or `OsGridRefField` map:

```yaml
components:
  - name: projectLocation
    title: Project location
    type: EastingNorthingField
    options:
      required: true
      showApproximateLocation: true
      approximateLocationPrefix: 'Nearby location:' # Optional; defaults to 'Approximate location:'
```

This option defaults to `false` and is ignored for `GeospatialField`. The label describes the selected answer, for example “Approximate location: LS8, Leeds”. It shows a saved answer once the map is ready, and updates when coordinate inputs change or a marker is placed. If the map does not initialise, no label is shown. Panning, zooming and postcode search alone do not update it. It is display-only metadata: the full prefix and location text are saved with the answer in Grants UI Backend, but are not submitted to GAS.

`options.approximateLocationPrefix` configures the prefix independently for each component. Omitted, blank or non-string values use “Approximate location:”. Include any punctuation in the configured text; a space separates it from the location. The prefix renders as plain text inside a semantic `<strong>` element, and the message uses `govuk-!-margin-top-1` spacing.

The browser converts the selected point to British National Grid coordinates and calls `/api/map/approximate-location?easting=…&northing=…`. This generic endpoint supports journeys without sign-in, validates the coordinates and calls [OS Names nearest](https://docs.os.uk/os-apis/accessing-os-apis/os-names-api/technical-specification/nearest) using the existing `FORMS_MAPS_API_KEY` on the server. No additional credentials or forms engine package changes are needed.

The nearest feature's postcode district and populated place supply the label, with missing parts omitted. Country names and a UK suffix are not included. Postcode records without a postcode district use the outward code from their postcode. If no populated place is present, the district/borough or county/unitary authority is used. This is an approximate description of a nearby feature, not a verified address or point-in-boundary lookup. The search radius is 1 km; rural locations can have no match.

Updates are debounced by 300 ms. Each change clears the previous label, cancels pending requests and ignores late responses. The OS request times out after two seconds, and the browser request after three seconds. Empty or invalid answers, missing matches and lookup failures leave the label empty without interrupting the map or form submission. Upstream failures are logged once on the server; the endpoint returns 503 for lookup failures and 200 with a null label for no match. Responses use `Cache-Control: no-store`. The label renders as text in a polite live region for assistive technology.

### Saved hints on Check answers and view/print application

For point fields with `showApproximateLocation: true`, the shared map adapter automatically creates an internal hidden input containing the full displayed text and the coordinate input values it describes. Each location change immediately clears the hidden value, including while typing, and only a successful current lookup repopulates it. Continuing before a lookup completes saves the answer without a hint; the hint never blocks submission.

A shared `onPreHandler` hook removes this transport metadata before forms-engine validation. After redirect and permission checks, the forms request pipeline accepts bounded metadata only for opted-in point components on the resolved page and only when its coordinate values match the validated answer. It creates a new `context.state.mapLocationHints` object for the normal page POST to persist through the existing state helpers. Invalid metadata is ignored, changed or removed answers clear the old hint, and hints belonging to other pages are retained.

The shared CYA view hook appends saved text beneath the existing coordinate values for both the engine’s standard summary view and Grants UI’s Check answers view. The full hint, including its prefix, uses normal font weight on CYA. It escapes the prefix and location as text, checks that the saved hint still matches the answer, and performs no location lookup. The coordinates and change link remain available without a hint. This decoration changes rendered rows only; it does not change the underlying answer detail values.

The view/print application page uses the same saved-hint check and displays the full hint beneath the coordinate answer in normal font weight, including when answers are grouped by task. Only components with `showApproximateLocation: true` and hints matching their saved answer are included. No lookup is performed when viewing or printing an application.

## Dependency compatibility tests

Grants UI retains its own `@defra/interactive-map` dependency for the land parcel map. The forms engine can resolve a different version. Compatibility checks exercise the installed combination without forcing either map to use the other's version.

`src/client/javascripts/location-map-compatibility.test.js` renders the installed engine's location templates and uses its real coordinate conversions and `centerMap` helper. It checks all three location types, saved answers taking precedence over the postcode, independent postcode and UK starting views, input changes, marker events, approximate location labels, zero longitude, blank inputs and both help-panel settings. Map creation is replaced with a controlled event fixture; map readiness and marker placement are simulated, following the acceptance suite's approach of supplying map events instead of clicking a rendered map. These checks require no WebGL, SwiftShader or live OS API credentials.

The compatibility checks run in the normal unit suite, including dependency updates. Run them with `npx vitest run src/client/javascripts/location-map-compatibility.test.js --coverage.enabled=false`. The acceptance suite continues to test land parcel selection through synthetic `parcel-map:ready` and `parcel-map:selection` events. Map rendering, plugin UI and canvas interactions are not covered by these checks.
