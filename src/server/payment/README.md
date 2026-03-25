# Payment Page

A generic payment summary page used across grant journeys. It is driven entirely by YAML config and a payment strategy — no journey-specific controller subclasses are needed.

## How it works

```
YAML config
    │
    ▼
PaymentPageController (constructor reads config via resolveConfig)
    │
    ├── strategy.fetch(state) ──► service function(s) ──► Land Grants API
    │        │
    │        └── returns { totalPence, totalPayment, payment, parcelItems?, additionalYearlyPayments? }
    │
    ├── buildViewModel(...)  ──► payment-page.html (Nunjucks)
    │
    └── redirect ──► redirects.next / redirects.addMoreActions
```

On GET, the controller calls `strategy.fetch(state)`, stores `totalPence`, `totalPayment`, and the raw `payment` object in session state, then renders the view.

On POST, if the user triggers validation (submit without answering the radio), it re-fetches and re-renders with errors. Otherwise it reads `addMoreActions` from the payload and navigates accordingly.

## YAML config reference

```yaml
- title: Review the actions you have selected
  path: /check-selected-land-actions
  controller: PaymentPageController
  config:
    # Required
    paymentStrategy: multiAction # key in payment-strategies.js

    # Navigation paths (next is required; addMoreActions required if showAddMoreActionsQuestion: true)
    redirects:
      next: /submit-your-application # where to go when user is done (often a consent check page or submit application)
      addMoreActions: /select-land-parcel

    # Display options (all optional, defaults shown)
    showPaymentActions: true # show per-parcel action breakdown tables
    showAddMoreActionsQuestion: true # show "Do you want to add actions to another parcel?" radio
    showSupportLink: true # show "If you have a question" support details

    # Optional Nunjucks HTML rendered above the payment total
    # {{ totalPayment }} is available as a token
    paymentExplanation: |
      <p class="govuk-body-l">The annual payment is <strong>{{ totalPayment }}</strong>.</p>
  next: []
  id: ...
```

## Adding a new journey

### 1. Add a payment strategy

Open [`payment-strategies.js`](./payment-strategies.js) and add an entry. Each strategy exposes a single `fetch(state)` method that returns:

| Field                      | Type                 | Description                                                                            |
| -------------------------- | -------------------- | -------------------------------------------------------------------------------------- |
| `totalPence`               | `number`             | Total payment in pence — stored in state for re-render on validation errors            |
| `totalPayment`             | `string`             | Formatted currency string e.g. `"£4,393.68"` — rendered directly in the view           |
| `payment`                  | `object`             | Raw API response — stored in session state for downstream use (e.g. submission mapper) |
| `parcelItems`              | `Array` _(optional)_ | Mapped view models for per-parcel action tables. Omit if not applicable                |
| `additionalYearlyPayments` | `Array` _(optional)_ | Mapped view models for agreement-level payment rows. Omit if not applicable            |

Example for a simple one-off payment:

```js
myJourney: {
  async fetch(state) {
    const { totalPence } = await calculateMyPayment(state)
    return {
      totalPence,
      totalPayment: formatPrice(totalPence),
      payment: { totalPence }
    }
  }
}
```

Example for a multi-action journey with per-parcel breakdown:

```js
myMultiAction: {
  async fetch(state) {
    const [paymentResult, actionGroups] = await Promise.all([
      calculateMyActionsPayment(state),
      fetchMyActionGroups(state)
    ])
    const { payment } = paymentResult
    const totalPence = payment?.annualTotalPence ?? 0
    return {
      totalPence,
      totalPayment: formatPrice(totalPence),
      payment,
      parcelItems: mapPaymentInfoToParcelItems(payment, actionGroups),
      additionalYearlyPayments: mapAdditionalYearlyPayments(payment)
    }
  }
}
```

`formatPrice` is available from `~/src/server/common/utils/payment.js`.

### 2. Add a service function

The strategy should call a service function in `land-grants.service.js` (or a new service file for non-land-grants journeys) rather than calling the API client directly. The service function handles:

- Building the request payload from state
- Calling the API client
- Returning normalised data (e.g. converting a string result to pence)

See `calculateLandActionsPayment` and `calculateWmpPayment` in [`land-grants.service.js`](../land-grants/services/land-grants.service.js) as examples.

### 3. Configure the YAML page

Set `paymentStrategy: <your-key>` in the page config block, along with `redirects.next` and any other required options (see YAML config reference above).

## API communication

Payment calculations go through the Land Grants API. The client layer ([`land-grants.client.js`](../land-grants/services/land-grants.client.js)) handles authentication headers, retries, and error surfacing. Two endpoints are currently in use:

| Strategy      | Endpoint                              | Request shape                                                        |
| ------------- | ------------------------------------- | -------------------------------------------------------------------- |
| `multiAction` | `POST /api/v2/payments/calculate`     | `{ parcel: [{ sheetId, parcelId, actions: [{ code, quantity }] }] }` |
| `wmp`         | `POST /api/v2/wmp/payments/calculate` | `{ parcelIds, newWoodlandAreaHa, oldWoodlandAreaHa }`                |

### `multiAction` response

```json
{
  "payment": {
    "annualTotalPence": 439368,
    "parcelItems": { "1": { "code": "UPL1", "annualPaymentPence": 316357, ... } },
    "agreementLevelItems": { "1": { "code": "CMOR1", "annualPaymentPence": 27200, ... } }
  }
}
```

### `wmp` response

```json
{
  "message": "success",
  "payment": {
    "agreementTotalPence": 375000,
    "agreementStartDate": "2026-06-01",
    "agreementEndDate": "2036-06-01",
    "frequency": "Single",
    "parcelItems": {},
    "agreementLevelItems": {
      "1": { "code": "PA3", "description": "Woodland Management Plan", "agreementTotalPence": 375000, ... }
    },
    "payments": [{ "totalPaymentPence": 375000, "paymentDate": "2026-06-15", ... }]
  }
}
```

The `wmp` strategy reads `payment.agreementTotalPence` for `totalPence`.

## Session state

After a successful GET, the controller stores the following in session state:

```js
{
  totalPence: 439368,        // used on re-render (e.g. POST validation error fallback)
  totalPayment: '£4,393.68', // formatted string, used directly in the view on re-render
  payment: { ... }           // raw API response, used by downstream mappers (e.g. GAS submission mapper)
}
```

The raw `payment` object shape depends on the strategy. For `multiAction`, downstream code (the GAS answers mapper) reads `payment.annualTotalPence` from state. For `wmp`, it reads `payment.agreementTotalPence`.
