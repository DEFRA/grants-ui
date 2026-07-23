# Parcel Map: developer guide

The interactive land parcel selection map is a self-contained browser component backed by a small set of server-side routes. This document describes how it works and how to wire it into a new grant journey.

---

## Overview

The system has three layers:

| Layer                                             | Location                              |
| ------------------------------------------------- | ------------------------------------- |
| **`<parcel-map>` web component**                  | `src/client/javascripts/parcel-map/`  |
| **Server-side routes** (parcels API + tile proxy) | `src/server/common/map/map.plugin.js` |
| **Page controllers**                              | `src/server/common/map/`              |

The component fetches the authenticated user's parcels from `/api/map/parcels`, renders them on a MapLibre GL map, and emits DOM events. The surrounding page decides what to do with those events. The component itself never touches form state.

---

## Running it locally

### Prerequisites: OS Maps API key

The basemap is Ordnance Survey's **OS Maps API** (raster ZXY tiles), which requires an API key. The key is read from config as `osMapsApiKey` (env var `OS_MAPS_API_KEY`, marked sensitive) and is only ever used server-side by the `/api/map/os-tiles` proxy. It must never be shipped to the browser.

The basemap always comes from Ordnance Survey, **including in mock mode**: mock mode only replaces the parcel geometry, never the map underneath it. Without a key the basemap 401s and the component shows its error overlay, which looks much like the map being broken.

> **Which OS product?** The key's OS Data Hub project must have the **"OS Maps API"** product added, since a key without it gets `401` from the tile endpoint. We deliberately do **not** use the OS Vector Tile API: it is due to retire in 2028 and is not included in the keys we are issued. (If vector basemaps are ever needed, the successor is the OS NGD API – Tiles.)

#### Generating a key on the OS Data Hub

1. Go to [osdatahub.os.uk](https://osdatahub.os.uk/) and sign up (the free **OS OpenData plan** is enough, as the OS Maps API is included in it).
2. Once logged in, open **API Dashboard → API Projects** and click **Create a new project** (any name, e.g. `grants-ui-local`).
3. In the project, click **Add API** and select **OS Maps API**.
4. Copy the **Project API Key** shown on the project page.

Then add it to `.env`:

```
OS_MAPS_API_KEY=your-key-here
```

`compose.yml` passes it through to the container.

#### Deployed environments

The key is a secret, so it is **not** set in `cdp-app-config`. It must be configured as a CDP secret per environment. Check it exists before enabling map journeys in a new environment.

### Start the right stack

Which compose command you want depends on where the parcel geometry comes from.

| You want                                | Command                        | What you get                                                                                                         |
| --------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Mock geometry (quickest, no API)        | `npm run docker:up`            | `MAP_MOCK_DATA_ENABLED` defaults to `true` in `compose.yml`. Geometry is served as GeoJSON from the embedded shapes. |
| Real vector tiles (the production path) | `npm run docker:landgrants:up` | Adds `land-grants-backend` on `:3009` and its seeded Postgres. Set `MAP_MOCK_DATA_ENABLED=false` in `.env`.          |

> **This is the one that catches people out.** Plain `npm run docker:up` points `LAND_GRANTS_API_URL` at `mockserver:1080`. There is **no land-grants API in the base compose file**. Setting `MAP_MOCK_DATA_ENABLED=false` without also switching to `docker:landgrants:up` gives you a map with a working basemap, no parcels, and nothing obvious in the logs to explain why.

### Sign in as a user who actually has parcels

The map routes are all session-authed, so the map cannot load until you have signed in.

1. Open http://localhost:3000/auth/sign-in and pick a pre-seeded user from the Defra ID stub (no real credentials needed).
2. **Use CRN `1102838829`** (Edward Jones). The DAL stub only returns land parcels for this CRN. Sign in as anyone else and the component correctly reports `no-parcels` and renders nothing.

### Open the map

http://localhost:3000/example-grant-with-map/start, then continue to `/select-land-parcel`.

### What working looks like

- The OS basemap draws (roads, field boundaries), not a blank grey pane.
- Parcel polygons render on top in the GOV.UK palette, each labelled with its `SHEET-PARCEL` ID.
- Clicking a parcel selects it, highlights it, and shows a tooltip with the parcel's total area.
- <kbd>Tab</kbd> into the map opens the keyboard listbox of parcels; <kbd>Enter</kbd> selects at the crosshair.
- **Continue** is enabled once something is selected, and the next page receives `?parcelId=`.
- Network tab: `/api/map/parcels` returns `200`, and `/api/map/os-tiles/{z}/{x}/{y}` returns `200` (`image/png`). In real mode `/api/map/parcel-tiles/{z}/{x}/{y}` returns `200` (`application/x-protobuf`); in mock mode you get `/api/map/parcels/geojson` instead.

### When it doesn't work

| Symptom                                             | Most likely cause                                                                                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| "There was a problem loading the map."              | Missing or wrong `OS_MAPS_API_KEY`, or the key's OS project lacks the OS Maps API product (`401` on `/api/map/os-tiles`).         |
| Basemap draws, but no parcels and no error          | Signed in as a CRN other than `1102838829`.                                                                                       |
| Basemap draws, parcels missing, real mode           | `MAP_MOCK_DATA_ENABLED=false` but running `docker:up` rather than `docker:landgrants:up` (see [Mock data mode](#mock-data-mode)). |
| Changes to `webpack.config.js` appear to do nothing | It isn't volume-mounted. Run `npm run docker:rebuild && npm run docker:up`.                                                       |

---

## Adding the map to a new journey

### 1. Register `mapPlugin`

The plugin must be registered once. Check it is already present in your server plugin list, as it is shared across all journeys that use the map.

```js
// src/server/router.js (or wherever plugins are registered)
import { mapPlugin } from '~/src/server/common/map/map.plugin.js'

await server.register(mapPlugin)
```

### 2. Register the controller

`MapSelectPageController` must be importable by the form engine. Add them to the controller registry if they are not already there.

```js
import MapSelectPageController from '~/src/server/common/map/map-select-page.controller.js'
```

### 3. Define the pages in your YAML

Minimum viable journey, single parcel selection, straight to check-your-answers:

```yaml
pages:
  - title: Select a land parcel
    id: <uuid>
    path: /select-land-parcel
    controller: MapSelectPageController
    components:
      # HiddenField gives the engine a state slot for the parcel ID.
      # shortDescription appears on the summary page.
      - name: selectedParcelsDisplay
        id: <uuid>
        type: HiddenField
        title: Land parcel
        shortDescription: Land parcel
        options:
          required: false

  - title: Check your answers
    id: <uuid>
    path: /submit-your-application
    controller: MapSubmissionPageController

  - title: Confirmation
    id: <uuid>
    path: /confirmation
    controller: ConfirmationPageController
```

#### Multi-select

To allow selecting multiple parcels, set `multiSelect: true` in the page's `config` block:

```yaml
pages:
  - title: Select land parcels
    path: /select-land-parcel
    controller: MapSelectPageController
    config:
      multiSelect: true
```

#### Page `config` flags

| Flag          | Type      | Default | Effect                                           |
| ------------- | --------- | ------- | ------------------------------------------------ |
| `multiSelect` | `boolean` | `false` | Allow selecting more than one parcel. See above. |

### What the page controllers do

#### `MapSelectPageController`

Extends `QuestionPageController`. Renders `map-select-parcel.html`.

**GET** passes `multiSelect` and `formAction` to the view.

**POST** reads `landParcels` from the request payload (written by the JS selection listener as hidden inputs). Validates that at least one parcel was selected; returns the form with an inline error if not. On success:

- Writes `selectedParcelId` (first parcel), `selectedParcelIds` (full array), and `selectedParcelsDisplay` (comma-separated string) to session state.
- In single-select mode, appends `?parcelId=<id>` to the redirect URL so downstream controllers (e.g. `SelectLandActionsPageController`) receive the parcel ID via query string.

##### Session state written by `MapSelectPageController`

| Key                      | Type       | Description                                                  |
| ------------------------ | ---------- | ------------------------------------------------------------ |
| `selectedParcelId`       | `string`   | First (or only) selected parcel ID (single-select mode only) |
| `selectedParcelIds`      | `string[]` | All selected parcel IDs                                      |
| `selectedParcelsDisplay` | `string`   | Comma-separated IDs, used by the summary page                |

#### `MapSubmissionPageController`

Extends `SummaryPageController` (wrapped in `withTaskContext`). This is the check-your-answers page for a map journey. It reads no map-specific payload; its only override is **POST**, which redirects to the journey's confirmation path (`getConfirmationPath`). Use it as the `controller` for the summary page in the YAML above.

### Example journey YAML

A complete working example is [`example-grant-with-map.yaml`](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-map/grants-ui/example-grant-with-map.yaml) in the grants config repo (served from `grants-ui-backend` at runtime). It demonstrates:

- Single parcel selection with `MapSelectPageController`
- Actions selection with `SelectLandActionsPageController` (receives `?parcelId=` from the redirect)
- Check-your-answers with `MapSubmissionPageController`
- Confirmation page

---

## The `<parcel-map>` web component

### Attributes

| Attribute      | Values               | Default   | Description                                    |
| -------------- | -------------------- | --------- | ---------------------------------------------- |
| `multi-select` | `"true"` / `"false"` | `"false"` | Allow selecting more than one parcel at a time |

**Single-select:** clicking a parcel selects it and deselects any previously selected one. Clicking the same parcel again deselects it.

**Multi-select:** clicking toggles each parcel independently. Multiple parcels can be selected simultaneously.

`multi-select` is read once when the component connects. Changing it afterwards has no effect (re-create the element to reconfigure).

### Height

Set height via CSS directly on the element. The component fills 100% of whatever dimensions it is given:

```html
<parcel-map style="display:block;width:100%;height:500px;position:relative"></parcel-map>
```

If no height is set via CSS the component falls back to `MAP_DEFAULT_HEIGHT` (defined in `config.js`).

### Dispatched events

All events bubble.

| Event                  | `detail`                                    | When                                                       |
| ---------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| `parcel-map:ready`     | _(none)_                                    | Map initialised and parcels loaded successfully            |
| `parcel-map:error`     | `{ reason: 'unavailable' \| 'no-parcels' }` | Map or parcels API failed; `reason` describes the cause    |
| `parcel-map:selection` | `{ selectedIds: string[] }`                 | User clicks a parcel (empty array when all are deselected) |

`reason` values for `parcel-map:error`:

- `'unavailable'`: map initialisation failed or the parcels API returned an error
- `'no-parcels'`: API returned successfully but the user has no parcels

The page wiring in `parcel-select-page.js` is the canonical example of how to consume these events.

### Accessible selection (interact plugin)

Selection is handled by the `@defra/interactive-map` **interact plugin**, not raw MapLibre click handlers. This gives every input method a route to select a parcel:

- **Pointer:** click a parcel
- **Touch:** a crosshair with a "Select" action button
- **Keyboard:** <kbd>Enter</kbd> selects at the crosshair target; <kbd>Tab</kbd> opens a listbox of parcels navigable with arrow keys

The plugin only selects a polygon on an exact geometric hit, which is impractical for small zoomed-out parcels. The component adds a rendered-pixel fallback (see `withParcelHitTolerance` in `index.js`) so parcels stay selectable at any zoom, by pointer and by keyboard.

The component listens to the plugin's selection events and re-dispatches them as `parcel-map:selection`, so page-level consumers are unaffected by the plugin internals.

### Moving the map (keyboard)

Panning and zooming are separate from selection: they come from MapLibre's built-in keyboard handler, which we leave enabled (the `@defra/interactive-map` maplibre provider constructs the map without `keyboard: false`). **Tab to the map so its canvas has focus**, then:

- **Arrow keys:** pan
- <kbd>+</kbd> / <kbd>=</kbd> to zoom in, <kbd>-</kbd> to zoom out

Rotation is deliberately disabled (`dragRotate: false` plus `disableRotation()` in the provider), so there is no keyboard rotate.

Note that the **arrow keys are context-dependent**: with the map canvas focused they pan the map, but once <kbd>Tab</kbd> has moved focus into the interact plugin's parcel listbox they move between parcels instead. Zoom-out is capped at `MAP_MIN_ZOOM` (7); see [Loading and error behaviour](#loading-and-error-behaviour).

The plugin needs a single property that uniquely identifies each parcel feature. The land-grants API tiles don't provide one directly, so the grants-ui tile proxy adds it. See `withCompoundParcelIds` in `mvt-compound-id.js` for why and how.

### Loading and error behaviour

- While initialising, the component shows a grey "Loading map…" skeleton (`role="status"`).
- The parcels fetch is retried once (after 1 s) on failure; the map load itself has a 10 s timeout. The relevant constants (`FETCH_MAX_ATTEMPTS`, `FETCH_RETRY_DELAY_MS`, `MAP_LOAD_TIMEOUT_MS`) live in `config.js`.
- On an `'unavailable'` error the component replaces the map with an inline "There was a problem loading the map." overlay (`role="alert"`).
- On a `'no-parcels'` error it renders nothing. Messaging is left to the page (`map-select-parcel.html` un-hides a GOV.UK error summary and disables the continue button).
- The viewport is fitted to the parcels' bounding box on load; the map does not persist its viewport in the URL (`urlPosition: 'none'`).
- Zoom-out is capped at `MAP_MIN_ZOOM` (7), because the OS raster basemap has no tiles below z7, so without the cap users could zoom out into a blank void.

### Asset loading

Webpack builds two JS bundles (entries in `webpack.config.js`): `parcel-map.js` (the component) and `parcel-select-page.js` (the page wiring — see [Dispatched events](#dispatched-events)). The template loads them as ES modules in `{% block bodyEnd %}`:

```html
<script type="module" nonce="{{ cspNonce }}" src="{{ getAssetPath('parcel-map.js') }}"></script>
<script type="module" nonce="{{ cspNonce }}" src="{{ getAssetPath('parcel-select-page.js') }}"></script>
```

In production webpack outputs a content-hashed filename (`parcel-map.[contenthash:7].min.js`). `getAssetPath` resolves the correct path via `assets-manifest.json`, so the reference stays valid across deployments.

The `@defra/interactive-map` CSS must also be loaded. It is copied by webpack's CopyPlugin and served via an explicit route in `serve-static-files.js`. The template loads it in `{% block head %}`:

```html
<link rel="stylesheet" href="{{ getAssetPath('stylesheets/interactive-map.css') }}" />
```

> **Note for Docker:** `webpack.config.js` is not volume-mounted. After changing it, run `npm run docker:rebuild && npm run docker:up` to rebuild the image.

### Basemap provider

The basemap is Ordnance Survey's raster basemap, served through the server-side proxy described below. `getMapStyle` in `map-helpers.js` resolves its style/attribution. It is authoritative UK survey data, including the farmland/parcel boundary detail the journey depends on.

---

## Server-side routes (`map.plugin.js`)

### `GET /api/map/parcels`

Fetches the authenticated user's parcels from the DAL, enriches them with area data from the land-grants API, and returns one of two shapes depending on whether mock data mode is enabled:

**Real mode** (`MAP_MOCK_DATA_ENABLED=false`):

```json
{
  "features": [
    {
      "type": "Feature",
      "id": "SD7148-9160",
      "properties": { "sheet_id": "SD7148", "parcel_id": "9160", "areaHa": 2.5 }
    }
  ],
  "bbox": { "minLng": -2.5, "minLat": 51.4, "maxLng": -2.3, "maxLat": 51.6 }
}
```

The component uses `PARCEL_TILES_URL` (a client-side constant in `config.js`) as the vector tile source.

**Mock mode** (`MAP_MOCK_DATA_ENABLED=true`):

```json
{
  "features": [{ "type": "Feature", "id": "SD7148-9160", "geometry": { ... }, "properties": { ... } }],
  "bbox": { "minLng": -2.5, "minLat": 51.4, "maxLng": -2.3, "maxLat": 51.6 },
  "mock": true
}
```

When `mock: true` is present the component uses `PARCELS_GEOJSON_URL` (another client-side constant) as a GeoJSON source instead of the vector tile source. Returns `503` if the land-grants API is unavailable. See [Mock data mode](#mock-data-mode).

### `GET /api/map/parcels/geojson`

Returns the full GeoJSON `FeatureCollection` for mock mode. Reads features stored in the session by the parcels endpoint. Returns `404` if mock mode is disabled or the session has no features. Requires session auth, since MapLibre fetches this from the browser, which sends the session cookie automatically (same-origin).

### `GET /api/map/parcel-tiles/{z}/{x}/{y}`

Proxies MapLibre vector tile requests to the land-grants API. Fetches the current user's parcel IDs from `fetchParcels` (concurrent tile requests share one in-flight lookup per SBI) and sends them in the POST body so they are never exposed in the tile URL. Each tile is re-encoded on the way through (`withCompoundParcelIds`) to stamp the compound `id` property onto every feature; see the interact plugin section above. Returns the protobuf tile buffer with `Cache-Control: private, max-age=3600`, marked `private` because tiles are per-user.

### `GET /api/map/os-basemap`

Serves a locally built MapLibre style for the OS Maps **raster** basemap. No upstream call is involved. The style contains one raster source pointing at the `/api/map/os-tiles` proxy (layer fixed server-side by `OS_MAPS_LAYER`, zooms 7–20) and one raster layer. No `glyphs` URL is set: parcel-label text is generated locally in the browser by MapLibre (TinySDF), so no font files are hosted or fetched. Absolute URLs are built from the configured `APP_BASE_URL` (falling back to the request origin for bare local dev). Served with `Cache-Control: private, max-age=3600`.

### `GET /api/map/os-tiles/{z}/{x}/{y}`

Proxies OS Maps raster tile requests to the configured `osMapsBaseUrl`, injecting the API key server-side so the browser never sees it. The basemap layer is fixed server-side, so clients cannot spend our key on anything else. A non-OK upstream status (e.g. `401` from a key without the right product) is logged and passed through. Responses are served with `Cache-Control: public, max-age=3600`, because basemap tiles are identical for every user.

---

## Configuration

| Config key                  | Env var                          | Default                                | Purpose                                                                                                             |
| --------------------------- | -------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `osMapsApiKey`              | `OS_MAPS_API_KEY`                | _(none)_                               | OS Data Hub key. Sensitive, server-side only. See [Prerequisites: OS Maps API key](#prerequisites-os-maps-api-key). |
| `osMapsBaseUrl`             | `OS_MAPS_BASE_URL`               | `https://api.os.uk/maps/raster/v1/zxy` | Upstream the `/api/map/os-tiles` proxy calls. Override to point at a stub or an egress proxy.                       |
| `mapTileCacheMaxAgeSeconds` | `MAP_TILE_CACHE_MAX_AGE_SECONDS` | `3600`                                 | `Cache-Control` max-age on tiles and the basemap style. Lower it to chase a stale-tile problem.                     |
| `mapMockDataEnabled`        | `MAP_MOCK_DATA_ENABLED`          | `false`                                | Serve embedded GeoJSON instead of vector tiles. See [Mock data mode](#mock-data-mode).                              |

Deliberately **not** configurable, and worth knowing why:

- **The OS basemap layer** (`Outdoor_3857`) is pinned in `map.plugin.js`. Pinning it server-side is what stops a browser asking the proxy for a layer our key isn't scoped for, i.e. it's what keeps the key from being spent on arbitrary OS products.
- **The OS zoom range** (7–20) is likewise pinned. These are facts about what OS publishes, not deployment choices, and they are the validation bound on a proxy that spends a metered API key. An env var could widen that bound with no code review on the path.

---

## Mock data mode

When the real land-grants API is unavailable locally, mock mode serves embedded GeoJSON geometry directly, removing the dependency on a running tile server and avoiding vector tile clipping issues at zoom boundaries.

### Enable / disable

In `.env`:

```
MAP_MOCK_DATA_ENABLED=true   # mock geometry (default for local docker)
MAP_MOCK_DATA_ENABLED=false  # real land-grants API + vector tiles
```

Then run `npm run docker:up` for the change to take effect.

### What mock mode does

- Assigns pre-loaded polygon geometry to real parcel IDs (round-robin across 48 embedded shapes)
- Serves geometry as GeoJSON from `/api/map/parcels/geojson` instead of vector tiles
- Uses pre-loaded area values instead of fetching from the API
- Parcel IDs remain real (from the DAL), so downstream actions and "continue" still work

### What mock mode does not affect

- The parcel list, which is always fetched from the DAL stub
- Actions and payment calculations, which always call the real land-grants API

### Removing mock support entirely

Once the real API is available everywhere:

1. Delete `map.mock.js`
2. Remove `import { isMockData, buildMockFeatures }` from `map.plugin.js`
3. Remove the `isMockData()` branch and the `/api/map/parcels/geojson` route from `map.plugin.js`
4. Remove `mapMockDataEnabled` from `src/config/config.js`
5. Remove `MAP_MOCK_DATA_ENABLED` from `compose.yml` and `.env`
