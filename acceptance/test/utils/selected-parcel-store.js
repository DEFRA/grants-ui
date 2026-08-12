import { Before } from '@cucumber/cucumber'

// Records the land parcel chosen by the first-available-parcel step so
// check-answers assertions can reference it via the {SELECTED PARCEL}
// placeholder when the parcel is selected dynamically (rather than hard-coded
// per identity).
//
// Reset per scenario: Cucumber runs many scenarios per worker process against
// one module instance, so without this a stale parcel from an unrelated
// scenario would silently satisfy the placeholder instead of failing.
const selectedParcel = { current: null }

Before(function () {
  selectedParcel.current = null
})

export default selectedParcel
