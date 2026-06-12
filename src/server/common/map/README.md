# Parcel Map — developer guide

The interactive land parcel selection map is a self-contained browser component backed by a small set of server-side routes. This document describes how to wire it into a new grant journey.

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

### 2. Register the controllers

`MapSelectPageController` and `MapSubmissionPageController` must be importable by the form engine. Add them to the controller registry if they are not already there.

```js
import MapSelectPageController from '~/src/server/common/map/map-select-page.controller.js'
import MapSubmissionPageController from '~/src/server/common/map/map-submission-page.controller.js'
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

## What the page controllers do

### `MapSelectPageController`

Extends `QuestionPageController`. Renders `map-select-parcel.html`.

**GET** — passes `multiSelect` and `formAction` to the view.

**POST** — reads `landParcels` from the request payload (written by the JS selection listener as hidden inputs). Validates that at least one parcel was selected; returns the form with an inline error if not. On success:

- Writes `selectedParcelId` (first parcel), `selectedParcelIds` (full array), and `selectedParcelsDisplay` (comma-separated string) to session state.
- In single-select mode, appends `?parcelId=<id>` to the redirect URL so downstream controllers (e.g. `SelectLandActionsPageController`) receive the parcel ID via query string.

### `MapSubmissionPageController`

Extends `SummaryPageController` (GOV.UK check-your-answers page). Uses the engine's default `summary` view — no custom template needed.

**POST** — redirects to the confirmation page, bypassing the engine's default submission flow.

---

## The `<parcel-map>` web component

### Attributes

| Attribute      | Values               | Default   | Description                                    |
| -------------- | -------------------- | --------- | ---------------------------------------------- |
| `multi-select` | `"true"` / `"false"` | `"false"` | Allow selecting more than one parcel at a time |

**Single-select** — clicking a parcel selects it and deselects any previously selected one. Clicking the same parcel again deselects it.

**Multi-select** — clicking toggles each parcel independently. Multiple parcels can be selected simultaneously.

Changing `multi-select` after the component has connected triggers a full teardown and re-init.

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

### Lifecycle states

The component tracks an internal `_state`:

| State       | Meaning                                    |
| ----------- | ------------------------------------------ |
| `'idle'`    | Not yet initialised or torn down           |
| `'loading'` | Map and parcels fetch in progress          |
| `'ready'`   | Fully initialised, map visible             |
| `'error'`   | Initialisation failed, component torn down |

### Asset loading

The JS bundle is built by webpack into `.public/javascripts/parcel-map.js`. The template loads it as an ES module in `{% block bodyEnd %}`:

```html
<script type="module" nonce="{{ cspNonce }}" src="{{ getAssetPath('parcel-map.js') }}"></script>
```

In production webpack outputs a content-hashed filename (`parcel-map.[contenthash:7].min.js`). `getAssetPath` resolves the correct path via `assets-manifest.json`, so the reference stays valid across deployments.

The `@defra/interactive-map` CSS must also be loaded. It is copied by webpack's CopyPlugin and served via an explicit route in `serve-static-files.js`. The template loads it in `{% block head %}`:

```html
<link rel="stylesheet" href="{{ getAssetPath('stylesheets/interactive-map.css') }}">
```

> **Note for Docker:** `webpack.config.js` is not volume-mounted. After changing it, run `npm run docker:rebuild && npm run docker:up` to rebuild the image.

---

## Server-side routes (`map.plugin.js`)

### `GET /api/map/parcels`

Fetches the authenticated user's parcels from the DAL, enriches them with size data from the land-grants API, stores parcel IDs in the session (`yar`), and returns one of two shapes depending on whether mock data mode is enabled:

**Real mode** (`MAP_MOCK_DATA_ENABLED=false`):

```json
{
  "features": [{ "type": "Feature", "id": "SD7148-9160", "properties": { ... } }],
  "bbox": { "minLng": -2.5, "minLat": 51.4, "maxLng": -2.3, "maxLat": 51.6 },
  "tileUrl": "/land-grants/parcel-tiles/{z}/{x}/{y}",
  "geojsonUrl": null
}
```

**Mock mode** (`MAP_MOCK_DATA_ENABLED=true`):

```json
{
  "features": [{ "type": "Feature", "id": "SD7148-9160", "geometry": { ... }, "properties": { ... } }],
  "bbox": { "minLng": -2.5, "minLat": 51.4, "maxLng": -2.3, "maxLat": 51.6 },
  "tileUrl": null,
  "geojsonUrl": "/api/map/parcels/geojson"
}
```

Returns `503` if the land-grants API is unavailable.

### `GET /api/map/parcels/geojson`

Returns the full GeoJSON `FeatureCollection` for mock mode. Reads features stored in the session by the parcels endpoint. Returns `404` if mock mode is disabled or the session has no features. Auth is not required — MapLibre fetches this directly from the browser.

### `GET /land-grants/parcel-tiles/{z}/{x}/{y}`

Proxies MapLibre vector tile requests to the land-grants API. Parcel IDs are read from the session (set by the parcels endpoint above) and sent in the POST body — they are never exposed in the tile URL.

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
