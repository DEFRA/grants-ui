# Parcel Map — developer guide

The interactive land parcel selection map is a self-contained browser component backed by a small set of server-side routes. This document describes how it works and how to wire it into a new grant journey.

---

## Overview

The system has three layers:

| Layer                                             | Location                              |
| ------------------------------------------------- | ------------------------------------- |
| **`<parcel-map>` web component**                  | `src/client/javascripts/parcel-map/`  |
| **Server-side routes** (parcels API + tile proxy) | `src/server/common/map/map.plugin.js` |
| **Page controllers**                              | `src/server/common/map/`              |

The component fetches the authenticated user's parcels from `/api/map/parcels`, renders them on a MapLibre GL map, and emits DOM events. The surrounding page decides what to do with those events — the component itself never touches form state.

---

## Adding the map to a new journey

### 1. Register `mapPlugin`

The plugin must be registered once. Check it is already present in your server plugin list — it is shared across all journeys that use the map.

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

Minimum viable journey — single parcel selection, straight to check-your-answers:

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

`MapSelectPageController` reads `pageDef.config.multiSelect` in its constructor and passes it to the template and the component's `multi-select` attribute.

---

## What the page controller do

### `MapSelectPageController`

Extends `QuestionPageController`. Renders `map-select-parcel.html`.

**GET** — passes `multiSelect` and `formAction` to the view.

**POST** — reads `landParcels` from the request payload (written by the JS selection listener as hidden inputs). Validates that at least one parcel was selected; returns the form with an inline error if not. On success:

- Writes `selectedParcelId` (first parcel), `selectedParcelIds` (full array), and `selectedParcelsDisplay` (comma-separated string) to session state.
- In single-select mode, appends `?parcelId=<id>` to the redirect URL so downstream controllers (e.g. `SelectLandActionsPageController`) receive the parcel ID via query string.

---

## The `<parcel-map>` web component

### Attributes

| Attribute      | Values               | Default   | Description                                    |
| -------------- | -------------------- | --------- | ---------------------------------------------- |
| `multi-select` | `"true"` / `"false"` | `"false"` | Allow selecting more than one parcel at a time |

**Single-select** — clicking a parcel selects it and deselects any previously selected one. Clicking the same parcel again deselects it.

**Multi-select** — clicking toggles each parcel independently. Multiple parcels can be selected simultaneously.

`multi-select` is read once when the component connects — changing it afterwards has no effect (re-create the element to reconfigure).

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
| `parcel-map:ready`     | —                                           | Map initialised and parcels loaded successfully            |
| `parcel-map:error`     | `{ reason: 'unavailable' \| 'no-parcels' }` | Map or parcels API failed; `reason` describes the cause    |
| `parcel-map:selection` | `{ selectedIds: string[] }`                 | User clicks a parcel (empty array when all are deselected) |

`reason` values for `parcel-map:error`:

- `'unavailable'` — map initialisation failed or the parcels API returned an error
- `'no-parcels'` — API returned successfully but the user has no parcels

The inline script in `map-select-parcel.html` is the canonical example of how to consume these events.

### Loading and error behaviour

- While initialising, the component shows a grey "Loading map…" skeleton (`role="status"`).
- The parcels fetch is retried once (after 1 s) on failure; the map load itself has a 10 s timeout. The relevant constants (`FETCH_MAX_ATTEMPTS`, `FETCH_RETRY_DELAY_MS`, `MAP_LOAD_TIMEOUT_MS`) live in `config.js`.
- On an `'unavailable'` error the component replaces the map with an inline "There was a problem loading the map." overlay (`role="alert"`).
- On a `'no-parcels'` error it renders nothing — messaging is left to the page (`map-select-parcel.html` un-hides a GOV.UK error summary and disables the continue button).
- The viewport is fitted to the parcels' bounding box on load; the map does not persist its viewport in the URL (`urlPosition: 'none'`).
- Zoom-out is capped at `MAP_MIN_ZOOM` (7) — the OS basemap has no tiles below z7, so without the cap users could zoom out into a blank void.

### Asset loading

The JS bundle is built by webpack into `.public/javascripts/parcel-map.js`. The template loads it as an ES module in `{% block bodyEnd %}`:

```html
<script type="module" nonce="{{ cspNonce }}" src="{{ getAssetPath('parcel-map.js') }}"></script>
```

In production webpack outputs a content-hashed filename (`parcel-map.[contenthash:7].min.js`). `getAssetPath` resolves the correct path via `assets-manifest.json`, so the reference stays valid across deployments.

The `@defra/interactive-map` CSS must also be loaded. It is copied by webpack's CopyPlugin and served via an explicit route in `serve-static-files.js`. The template loads it in `{% block head %}`:

```html
<link rel="stylesheet" href="{{ getAssetPath('stylesheets/interactive-map.css') }}" />
```

> **Note for Docker:** `webpack.config.js` is not volume-mounted. After changing it, run `npm run docker:rebuild && npm run docker:up` to rebuild the image.

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

When `mock: true` is present the component uses `PARCELS_GEOJSON_URL` (another client-side constant) as a GeoJSON source instead of the vector tile source. Returns `503` if the land-grants API is unavailable.

### `GET /api/map/parcels/geojson`

Returns the full GeoJSON `FeatureCollection` for mock mode. Reads features stored in the session by the parcels endpoint. Returns `404` if mock mode is disabled or the session has no features. Requires session auth — MapLibre fetches this from the browser, which sends the session cookie automatically (same-origin).

### `GET /api/map/parcel-tiles/{z}/{x}/{y}`

Proxies MapLibre vector tile requests to the land-grants API. Fetches the current user's parcel IDs from `fetchParcels` (concurrent tile requests share one in-flight lookup per SBI) and sends them in the POST body so they are never exposed in the tile URL. Returns the protobuf tile buffer with `Cache-Control: private, max-age=3600` — `private` because tiles are per-user.

### `GET /api/map/os-basemap`

Serves a locally built MapLibre style for the OS Maps **raster** basemap — no upstream call is involved. The style contains one raster source pointing at the `/api/map/os-tiles` proxy (layer fixed server-side by `OS_MAPS_LAYER`, zooms 7–20) and one raster layer. No `glyphs` URL is set: parcel-label text is generated locally in the browser by MapLibre (TinySDF), so no font files are hosted or fetched. Absolute URLs are built from the configured `APP_BASE_URL` (falling back to the request origin for bare local dev). Served with `Cache-Control: private, max-age=3600`.

### `GET /api/map/os-tiles/{z}/{x}/{y}`

Proxies OS Maps raster tile requests to `api.os.uk/maps/raster/v1/zxy`, injecting the API key server-side so the browser never sees it. The basemap layer is fixed server-side — clients cannot spend our key on anything else. A non-OK upstream status (e.g. `401` from a key without the right product) is logged and passed through. Responses are served with `Cache-Control: public, max-age=3600` — basemap tiles are identical for every user.

---

## Session state written by `MapSelectPageController`

| Key                      | Type       | Description                                                  |
| ------------------------ | ---------- | ------------------------------------------------------------ |
| `selectedParcelId`       | `string`   | First (or only) selected parcel ID (single-select mode only) |
| `selectedParcelIds`      | `string[]` | All selected parcel IDs                                      |
| `selectedParcelsDisplay` | `string`   | Comma-separated IDs, used by the summary page                |

---

## Example journey YAML

A complete working example is at `src/server/common/forms/definitions/example-grant-with-map.yaml`. It demonstrates:

- Single parcel selection with `MapSelectPageController`
- Actions selection with `SelectLandActionsPageController` (receives `?parcelId=` from the redirect)
- Check-your-answers with `MapSubmissionPageController`
- Confirmation page

---

## OS Maps API key

The basemap is Ordnance Survey's **OS Maps API** (raster ZXY tiles), which requires an API key. The key is read from config as `osMapsApiKey` (env var `OS_MAPS_API_KEY`, marked sensitive) and is only ever used server-side by the `/api/map/os-tiles` proxy — it must never be shipped to the browser.

> **Which OS product?** The key's OS Data Hub project must have the **"OS Maps API"** product added — a key without it gets `401` from the tile endpoint. We deliberately do **not** use the OS Vector Tile API: it is due to retire in 2028 and is not included in the keys we are issued. (If vector basemaps are ever needed, the successor is the OS NGD API – Tiles.)

### Local setup

Get a key from the [OS Data Hub](https://osdatahub.os.uk/) with the OS Maps API product added, then add it to `.env`:

```
OS_MAPS_API_KEY=your-key-here
```

`compose.yml` passes it through to the container. Without a key the basemap requests return `401` and the component shows its error overlay.

### Deployed environments

The key is a secret, so it is **not** set in `cdp-app-config` — it must be configured as a CDP secret per environment. Check it exists before enabling map journeys in a new environment.

---

## Mock data mode

When the real land-grants API is unavailable locally, mock mode serves embedded GeoJSON geometry directly — removing the dependency on a running tile server and avoiding vector tile clipping issues at zoom boundaries.

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

- The parcel list — always fetched from the DAL stub
- Actions and payment calculations — always call the real land-grants API

### Removing mock support entirely

Once the real API is available everywhere:

1. Delete `map.mock.js`
2. Remove `import { isMockData, buildMockFeatures }` from `map.plugin.js`
3. Remove the `isMockData()` branch and the `/api/map/parcels/geojson` route from `map.plugin.js`
4. Remove `mapMockDataEnabled` from `src/config/config.js`
5. Remove `MAP_MOCK_DATA_ENABLED` from `compose.yml` and `.env`
