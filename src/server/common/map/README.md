# Parcel Map — developer guide

The interactive land parcel selection map is a self-contained browser component backed by a small set of server-side routes. This document describes how to wire it into a new grant journey.

---

## Overview

The system has three layers:

| Layer | Location |
|---|---|
| **`<parcel-map>` web component** | `src/client/javascripts/parcel-map/` |
| **Server-side routes** (parcels API + tile proxy) | `src/server/common/map/map.plugin.js` |
| **Page controllers** | `src/server/common/map/` |

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
    next: []
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
    next: []

  - title: Confirmation
    id: <uuid>
    path: /confirmation
    controller: ConfirmationPageController
    next: []
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

| Attribute | Values | Default |
|---|---|---|
| `multi-select` | `"true"` / `"false"` | `"false"` |

Height is set via CSS on the element itself — the component fills 100% of whatever container it is given:

```html
<parcel-map style="display:block;width:100%;height:500px;position:relative"></parcel-map>
```

### Dispatched events

| Event | Detail | When |
|---|---|---|
| `parcel-map:ready` | — | Map and parcels loaded successfully |
| `parcel-map:error` | `{ reason?: 'no-parcels' \| string }` | Map or parcels API failed |
| `parcel-map:selection` | `{ selectedIds: string[] }` | User clicks a parcel |

All events bubble. The inline script in `map-select-parcel.html` is the canonical example of how to consume them.

### Error behaviour

When the map or parcels API fails, `parcel-map:error` fires with a `reason` in the detail (`'no-parcels'` when the API returned successfully but the user has no parcels; a generic error otherwise). The template's inline script renders an error summary and hides the Continue button.

### Asset loading

The JS bundle is built by webpack into `.public/javascripts/parcel-map.js`. The template loads it as an ES module in `{% block bodyEnd %}`:

```html
<script type="module" nonce="{{ cspNonce }}" src="/public/javascripts/parcel-map.js"></script>
```

The `@defra/interactive-map` CSS must also be loaded. It is copied by webpack's CopyPlugin to `.public/stylesheets/interactive-map.css` and served via an explicit route in `serve-static-files.js`. The template loads it in `{% block head %}`:

```html
<link rel="stylesheet" href="/public/stylesheets/interactive-map.css">
```

> **Note for Docker:** `webpack.config.js` is not volume-mounted. After changing it, run `npm run docker:rebuild && npm run docker:up` to rebuild the image.

---

## Server-side routes (`map.plugin.js`)

### `GET /api/map/parcels`

Fetches the authenticated user's parcels from the Land Grants API, stores the parcel IDs in the session (`yar`), and returns:

```json
{
  "features": [{ "type": "Feature", "id": "SD7148-9160", "properties": { ... } }],
  "bbox": { "minLng": -2.5, "minLat": 51.4, "maxLng": -2.3, "maxLat": 51.6 },
  "tileUrl": "/land-grants/parcel-tiles/{z}/{x}/{y}"
}
```

Returns `503` if the Land Grants API is unavailable.

### `GET /land-grants/parcel-tiles/{z}/{x}/{y}`

Proxies MapLibre vector tile requests to the Land Grants API. Parcel IDs are read from the session (set by the parcels endpoint above) and sent in the POST body — they are never exposed in the tile URL.

---

## Session state written by `MapSelectPageController`

| Key | Type | Description |
|---|---|---|
| `selectedParcelId` | `string` | First (or only) selected parcel ID (single-select mode only) |
| `selectedParcelIds` | `string[]` | All selected parcel IDs |
| `selectedParcelsDisplay` | `string` | Comma-separated IDs, used by the summary page |

---

## Example journey YAML

A complete working example is at `src/server/common/forms/definitions/example-grant-with-map.yaml`. It demonstrates:

- Single parcel selection with `MapSelectPageController`
- Actions selection with `SelectLandActionsPageController` (receives `?parcelId=` from the redirect)
- Check-your-answers with `MapSubmissionPageController`
- Confirmation page
