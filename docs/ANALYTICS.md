# Google Analytics

## Overview

This application uses Google Analytics 4 (GA4) to track user interactions and page views across both development and production environments.

## Configuration

The Analytics tracking is configured via the `GA_TRACKING_ID` environment variable, which gets injected into the DOM at runtime.

```bash
# .env
GA_TRACKING_ID=G-XXXXXXXXXX
```

This can be added to the [cdp-app-config](https://github.com/DEFRA/cdp-app-config/blob/main/services/grants-ui) repository.

## Dashboards

- [Google Analytics Non-prod (dev) dashboard](https://analytics.google.com/analytics/web/?authuser=1#/a179628664p387058420/reports/intelligenthome?params=_u..nav%3Dmaui)

- [Google Analytics Production dashboard](https://analytics.google.com/analytics/web/?authuser=1#/a180010783p386784935/reports/intelligenthome?params=_u..nav%3Dmaui)

## Events Tracked

Standard GA4 automatic events are being tracked, including `page_view`, `form_start`, `session_start`, `form_submit` etc.

### What is not being tracked at the moment

- Form input clicks are not specifically tracked
- Granular user actions within forms are not captured

These are considered non-critical for initial day 1 launch but should be addressed in future iterations.

## Access Requests

Analytics access is managed by the Grants Enablement team. To request access, please send a request to the [#grants-ui-support](https://defra-digital-team.slack.com/archives/C08RCBK5J3E) slack channel under Defra Digital Team workspace.
