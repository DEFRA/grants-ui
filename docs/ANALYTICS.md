# Google Analytics

## Overview

This application uses Google Tag Manager (GTM) to load Google Analytics 4 (GA4) tracking for user interactions and page views across both development and production environments.

## Configuration

The Analytics tracking is configured via the `GA_TRACKING_ID` environment variable, which holds a GTM container ID (e.g. `GTM-XXXXXXX`) and gets injected into the DOM at runtime.

```bash
# .env
GA_TRACKING_ID=GTM-XXXXXXX
```

This can be added to the [cdp-app-config](https://github.com/DEFRA/cdp-app-config/blob/main/services/grants-ui) repository.

The container ID is validated client-side against `/^GTM-[A-Z0-9]+$/` before the GTM script (`googletagmanager.com/gtm.js`) is injected (`src/shared/cookie-utils.js`, `loadGoogleAnalytics`). GTM only loads if the user has given analytics cookie consent - see `src/server/common/templates/layouts/page.njk` and the cookie consent helpers.

## Dashboards

- [Google Analytics Non-prod (dev) dashboard](https://analytics.google.com/analytics/web/?authuser=1#/a179628664p387058420/reports/intelligenthome?params=_u..nav%3Dmaui)

- [Google Analytics Production dashboard](https://analytics.google.com/analytics/web/?authuser=1#/a180010783p386784935/reports/intelligenthome?params=_u..nav%3Dmaui)

## Events Tracked

Standard GA4 automatic events are being tracked, including `page_view`, `form_start`, `session_start`, `form_submit` etc.

### What is not being tracked at the moment

- Form input clicks are not specifically tracked
- Granular user actions within forms are not captured

These are considered non-critical for initial day 1 launch but should be addressed in future iterations.

## Feedback survey (Qualtrics)

Separately from GA4/GTM, the app links out to a Qualtrics feedback survey via a phase-banner/confirmation-page CTA. This is configured via the `FEEDBACK_SURVEY_URL` environment variable (base Qualtrics survey URL); when unset, the CTA is hidden.

The link is built per-request by `src/server/common/helpers/feedback-survey.js` (`buildFeedbackSurveyUrl`), which appends `grant`, `journey`, and `url` query params so responses can be segmented by grant and journey stage (in-progress/submitted, or claim in-progress/submitted). It is rendered from `src/server/common/templates/layouts/page.njk` and `dxt-form.njk`.

## Access Requests & Support

Analytics access and support is managed by the Grants Enablement team. To request access, please send a request to the [#grants-ui-support](https://defra-digital-team.slack.com/archives/C08RCBK5J3E) slack channel under Defra Digital Team workspace.
