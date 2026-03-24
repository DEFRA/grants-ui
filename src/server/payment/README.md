# Payment Page

A generic payment summary page used across grant journeys. It is driven entirely by YAML config and a payment strategy — no journey-specific controller subclasses are needed.

## How it works

```
YAML config
    │
    ▼
PaymentPageController (constructor reads config)
    │
    ├── strategy.fetch(state) ──► service function(s) ──► Land Grants API
    │        │
    │        └── returns { totalPence, payment, parcelItems?, additionalYearlyPayments? }
    │
    ├── buildViewModel(...)  ──► payment-page.html (Nunjucks)
    │
    └── getNextPathFromSelection(...) ──► nextPath / addMoreActionsPath / consentPath
```

On GET, the controller calls `strategy.fetch(state)`, stores `totalPence` and the raw `payment` object in session state, then renders the view.

On POST, if the user triggers validation (submit without answering the radio), it re-fetches and re-renders with errors. Otherwise it reads `addMoreActions` from the payload and navigates accordingly.

## YAML config reference

```yaml
- title: Review the actions you have selected
  path: /check-selected-land-actions
  controller: PaymentPageController
  config:
    # Required
    paymentStrategy: multiAction # key in payment-strategies.js
    nextPath: /submit-your-application # where to go when user is done

    # Required when showAddMoreActionsQuestion: true
    addMoreActionsPath: /select-land-parcel

    # Optional — where to go if consents are required for any action
    consentPath: /you-must-have-consent

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
| `totalPence`               | `number`             | Total payment in pence — used by the controller to format the display amount           |
| `payment`                  | `object`             | Raw API response — stored in session state for downstream use (e.g. submission mapper) |
| `parcelItems`              | `Array` _(optional)_ | Mapped view models for per-parcel action tables. Omit if not applicable                |
| `additionalYearlyPayments` | `Array` _(optional)_ | Mapped view models for agreement-level payment rows. Omit if not applicable            |

Example for a simple one-off payment:

```js
myJourney: {
  async fetch(state) {
    const { result, totalPence } = await calculateMyPayment(state)
    return {
      totalPence,
      payment: { result }
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
    return {
      totalPence: payment?.annualTotalPence ?? 0,
      payment,
      parcelItems: mapPaymentInfoToParcelItems(payment, actionGroups),
      additionalYearlyPayments: mapAdditionalYearlyPayments(payment)
    }
  }
}
```

### 2. Add a service function

The strategy should call a service function in `land-grants.service.js` (or a new service file for non-land-grants journeys) rather than calling the API client directly. The service function handles:

- Building the request payload from state
- Calling the API client
- Returning normalised data (e.g. converting a string result to pence)

See `calculateLandActionsPayment` and `calculateWmpPayment` in [`land-grants.service.js`](../land-grants/services/land-grants.service.js) as examples.

### 3. Configure the YAML page

Set `paymentStrategy: <your-key>` in the page config block, along with `nextPath` and any other required options (see YAML config reference above).

## API communication

Payment calculations go through the Land Grants API. The client layer ([`land-grants.client.js`](../land-grants/services/land-grants.client.js)) handles authentication headers, retries, and error surfacing. Two endpoints are currently in use:

| Strategy      | Endpoint                              | Request shape                                                        |
| ------------- | ------------------------------------- | -------------------------------------------------------------------- |
| `multiAction` | `POST /api/v2/payments/calculate`     | `{ parcel: [{ sheetId, parcelId, actions: [{ code, quantity }] }] }` |
| `oneOff`      | `POST /api/v2/payments/calculate-wmp` | `{ parcelIds, youngWoodlandArea, oldWoodlandArea }`                  |

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

### `oneOff` response

```json
{ "result": "125.00" }
```

The `oneOff` strategy converts `result` (pounds string) to pence: `Math.round(parseFloat(result) * 100)`.

## Session state

After a successful GET, the controller stores the following in session state:

```js
{
  totalPence: 439368,   // used by the view on re-render (e.g. POST validation error)
  payment: { ... }      // raw API response, used by downstream mappers (e.g. GAS submission mapper)
}
```

The raw `payment` object shape depends on the strategy. For `multiAction`, downstream code (the GAS answers mapper) reads `payment.annualTotalPence` from state.
