# TGC-1472: SFD meta redirect

## Purpose

Move navigation from the check-details grant journey to the Single Front Door (SFD) out of the check-details form POST response. This prevents Grants UI's `form-action` Content Security Policy from governing SFD and the services that SFD subsequently uses.

## Current behaviour

When `externalLinks.sfd.enabled` is true and a user answers that their details are incorrect, `CheckDetailsController` persists `checkDetailsChangesPending` and returns an external redirect to `externalLinks.sfd.updateUrl`. Because that redirect starts from the form submission, the browser applies Grants UI's `form-action` policy to the redirect chain.

When SFD is disabled, the same answer follows the forms engine journey to the injected `/update-details` terminal page, which renders the `incorrect-details` view.

## Design

The check-details POST will use the same forms engine navigation for both feature-flag states. Selecting that the details are incorrect will persist the expected journey state and proceed to the existing `/update-details` terminal page. The POST handler will not return an external redirect.

The `/update-details` page will be registered regardless of the SFD feature flag. `UpdateDetailsPageController` will decide which view model to provide:

- When SFD is disabled, it will preserve the existing incorrect-details page and support content.
- When SFD is enabled, it will build the configured SFD update URL and append the authenticated user's current relationship ID as `ssoOrgId`.

For the SFD-enabled variant, `incorrect-details.njk` will extend its layout's `head` block and output an immediate `<meta http-equiv="refresh">` redirect to the SFD URL. This is the primary navigation mechanism and starts from a GET document rather than the check-details form submission.

The rendered body will contain only a plain `Update details` link to the same SFD URL. This link is a fallback for browsers or users for whom the meta refresh does not navigate. It performs a normal GET and is not contained in a form.

No dedicated Hapi route or route-level lifecycle extension will be added.

## State and data flow

1. The user submits `/check-details` with the configured confirmation field set to `false`.
2. The controller removes any saved confirmation answer, sets `checkDetailsChangesPending: true`, and proceeds through the forms engine to `/update-details`.
3. The terminal page controller reads `externalLinks.sfd.updateUrl` and `request.auth.credentials.currentRelationshipId`.
4. The controller validates the configured URL and adds or replaces its `ssoOrgId` query parameter.
5. The GET response includes the SFD URL in both the head meta refresh and the body fallback link.

The SFD-enabled path must not persist `detailsConfirmed: false`, because doing so would make the forms engine treat check-details as answered when the user returns to the grant journey.

## Error handling

If SFD is enabled but `externalLinks.sfd.updateUrl` is missing or malformed, the controller will log the existing SFD update URL configuration error. It will not emit a meta refresh or an unusable external link. The response will retain the existing incorrect-details content as a safe fallback so the user is not shown a blank terminal page.

## Security

The SFD URL is constructed with the platform `URL` API after validation with `URL.canParse`. Nunjucks auto-escaping remains enabled when the URL is rendered into attributes. Both automatic and fallback navigation are GET requests from the rendered `/update-details` document, so no SFD origin or downstream identity-provider origin needs to be added to Grants UI's `form-action` policy.

## Testing

Focused tests will cover:

- registration of `/update-details` in both feature-flag states;
- SFD-enabled POST state handling and forms engine navigation without an external redirect;
- preservation of the existing SFD-disabled POST and incorrect-details behaviour;
- construction of the SFD URL with `ssoOrgId`, including existing query parameters;
- missing and malformed SFD URL handling;
- rendered SFD-enabled HTML containing the immediate meta refresh and fallback link;
- absence of the normal incorrect-details content from the valid SFD-enabled response;
- rendered SFD-disabled HTML remaining unchanged.

Validation will start with the focused controller and view tests, followed by formatting, linting, and the broader unit test suite.
