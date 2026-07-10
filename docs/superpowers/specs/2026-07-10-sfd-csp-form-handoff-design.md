# SFD CSP form handoff

## Goal

Prevent the browser from applying Grants UI's `form-action` policy to the
external SFD/B2C redirect chain after the woodland check-details form is
submitted.

## Design

When the authenticated check-details POST selects the SFD path, the controller
will build the validated SFD URL as it does today, store it in the existing
session (`request.yar`), and redirect to a same-origin Grants UI handoff path.
The handoff GET will read and remove the stored URL, then issue the external
redirect. If no URL is present, it will fail safely rather than accepting a URL
from the request.

The browser therefore submits the form and follows only a same-origin redirect
until the handoff GET. The external SFD and identity-provider redirects begin
after the form submission has completed.

## Error handling and security

- The destination is generated from the configured SFD URL and relationship ID;
  no caller-supplied destination is trusted.
- The handoff is authenticated and single-use by deleting the session value
  before redirecting.
- Missing session state redirects to the home page.
- Existing URL validation and SFD feature gating remain unchanged.

## Testing

Add controller tests proving that the POST stores the destination and redirects
to the internal handoff, and that the handoff consumes the session value and
redirects externally. Add a missing-state test for the safe fallback.
