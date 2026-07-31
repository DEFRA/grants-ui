# Grants UI Features

This document provides a comprehensive overview of all the features available in the Grants UI service, as demonstrated by the Example Grant with Auth journey. Each feature is configured through the grant's form definition (authored as YAML and served from `grants-ui-backend`; local copies for development live under `compose/config-broker-local/`) and can be used to build custom grant application forms.

## Table of Contents

- [Form Components](#form-components)
- [Page Types](#page-types)
- [Guidance Components](#guidance-components)
- [Form Configuration](#form-configuration)
- [Authentication & Authorization](#authentication--authorization)
- [Conditional Logic](#conditional-logic)
- [Lists & Data Sources](#lists--data-sources)
- [Validation & Error Handling](#validation--error-handling)
- [Submission & Confirmation](#submission--confirmation)

## Form Components

The Grants UI service supports a comprehensive set of form input components, each designed to handle specific data types and user interactions.

### Text Input Components

#### TextField

- **Purpose**: Single-line text input
- **Use Cases**: Names, short descriptions, single values
- **Features**:
  - Custom validation messages
  - Pattern matching with regex
  - Character limits
  - Required/optional configuration
- **Example**: [Example Grant – Multi Field Form (/multi-field-form)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml) – applicant name field with pattern validation for letters, hyphens, and apostrophes

#### MultilineTextField

- **Purpose**: Multi-line text input for longer content
- **Use Cases**: Descriptions, comments, detailed explanations
- **Features**:
  - Configurable number of rows
  - Word count limits
  - Custom validation messages
- **Example**: [Example Grant – Multiline Text page (/multiline-text-field)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml) – description prompt with a 400-word limit

#### EmailAddressField

- **Purpose**: Email address input with built-in validation
- **Use Cases**: Contact information, notifications
- **Features**:
  - Email format validation
  - Custom validation messages
  - Required/optional configuration
- **Example**: [Example Grant – Multi Field Form (/multi-field-form)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml) – applicant email with format validation

#### TelephoneNumberField

- **Purpose**: Phone number input with pattern validation
- **Use Cases**: Contact numbers, mobile/landline
- **Features**:
  - Pattern matching for various phone formats
  - Autocomplete support
  - Custom validation messages
- **Example**: [Example Grant – Multi Field Form (/multi-field-form)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml) – mobile number with regex pattern validation

### Selection Components

#### RadiosField

- **Purpose**: Single selection from multiple options
- **Use Cases**: Exclusive choices, category selection
- **Features**:
  - Custom validation messages
  - Option descriptions/hints
  - Conditional navigation
- **Example**: [Example Grant – Radios page (/radios-field)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml) – business type selection with conditional routing

#### CheckboxesField

- **Purpose**: Multiple selection from available options
- **Use Cases**: Multi-select categories, feature selection
- **Features**:
  - Required/optional configuration
  - Option descriptions
  - Custom validation messages
- **Example**: [Example Grant – Checkboxes page (/checkboxes-field)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml) – multi-select list requiring at least one choice

#### SelectField

- **Purpose**: Dropdown selection from a list
- **Use Cases**: Long lists, category selection
- **Features**:
  - Required/optional configuration
  - Custom validation messages
- **Example**: [Example Grant – Select page (/select-field)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml) – dropdown populated from a predefined list

#### AutocompleteField

- **Purpose**: Searchable dropdown with filtering
- **Use Cases**: Large datasets, country/location selection
- **Features**:
  - Real-time filtering
  - Custom validation messages
  - Hint text for user guidance
- **Example**: [Example Grant – Autocomplete page (/autocomplete-field)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml) – country selection with type-ahead filtering

#### YesNoField

- **Purpose**: Binary choice (Yes/No) input
- **Use Cases**: Eligibility questions, boolean decisions
- **Features**:
  - Custom validation messages
  - Conditional navigation to terminal pages
- **Example**: [Example Grant – Yes/No page (/yes-no-field)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml) – eligibility confirmation that can route to a terminal page

### Numeric Components

#### NumberField

- **Purpose**: Numeric input with validation
- **Use Cases**: Costs, quantities, measurements
- **Features**:
  - Min/max value constraints
  - Precision control
  - Currency prefix support
  - Custom validation messages
- **Example**: [Example Grant – Number field page (/number-field)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml) – project cost entry with £ prefix and range validation

### Date Components

#### DatePartsField

- **Purpose**: Date input with separate day/month/year fields
- **Use Cases**: Project start dates, deadlines
- **Features**:
  - Past/future date restrictions
  - Custom validation messages
  - Autocomplete control
- **Example**: [Example Grant – Date parts page (/date-parts-field)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml) – project start date constrained to the next 90 days

#### MonthYearField

- **Purpose**: Month and year selection
- **Use Cases**: Approximate dates, planning periods
- **Features**:
  - Required/optional configuration
  - Custom validation messages
- **Example**: [Example Grant – Month & year page (/month-year-field)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml) – planning permission month/year selector

### Address Components

#### UkAddressField

- **Purpose**: UK address input with multiple fields
- **Use Cases**: Business addresses, contact addresses
- **Features**:
  - Multiple address lines
  - Optional fields (address line 2, county)
  - Postcode validation
  - Automatic field grouping
- **Example**: [Example Grant – Multi Field Form (/multi-field-form)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml) – business address entry with optional lines and postcode validation

## Page Types

The service supports several specialized page types for different stages of the application process.

### Standard Pages

- **Purpose**: Regular form pages with input components
- **Features**: Component rendering, validation, navigation
- **Example**: [Example Grant – Radios page (/radios-field)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml)

### Summary Pages

- **Purpose**: Review and edit previously entered data
- **Features**:
  - Display all form answers
  - Edit functionality
  - Change links for each section
- **Controller**: `CheckResponsesPageController`
- **Example**: [Example Grant – Summary page (/summary)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml)

### Declaration Pages

- **Purpose**: Final confirmation and submission
- **Features**:
  - Declaration text, configured per grant (no bespoke template needed)
  - Form submission to GAS
  - Application status management
- **Controller**: `DeclarationPageController`
- **Configuration**: all copy comes from the page's `config:` block, hoisted onto `metadata.pageConfig[path]`:

  ```yaml
  - title: Submit your application
    path: /declaration
    controller: DeclarationPageController
    config:
      heading: Submit your application # default: "Confirm and send"
      html: | # body copy, rendered unescaped
        <p class="govuk-body">By submitting your application, you confirm that:</p>
        <ul class="govuk-list govuk-list--bullet">
          <li>the information you have provided is correct</li>
        </ul>
      buttonText: Confirm and submit # default: "Confirm and send"
      warningText: You can only submit your details once. # omit to hide
      optionalConsent: true # optional contact-consent checkbox
      showDataProtection: true # Defra data controller footer
      showSupportDetails: true # RPA support panel, email from metadata.supportEmail
      hiddenFields: # posted with the form, not part of the state schema
        guidanceRead: 'true'
  ```

  A page that declares any `config:` opts in to each block explicitly — only what it declares is rendered. A page with no `config:` falls back to the original built-in copy (heading, declaration paragraphs, consent checkbox, warning and data protection footer).

  `html` is rendered unescaped, so it is trusted content from the config repo — the same posture as `paymentExplanation` and `confirmationContent.html`.

- **Example**: [Example Grant – Declaration page (/declaration)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml)

### Confirmation Pages

- **Purpose**: Post-submission confirmation and next steps
- **Features**:
  - Custom HTML content
  - Reference number display
  - Next steps information
  - Support contact details
- **Controller**: `ConfirmationPageController`
- **Example**: [Example Grant – Confirmation content](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml)

### Terminal Pages

- **Purpose**: End the application process with specific messaging
- **Features**:
  - Custom HTML content
  - Eligibility messaging
  - Alternative options
- **Controller**: `TerminalPageController`
- **Example**: [Example Grant – Terminal page (/terminal-page)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml)

### Update Details Exit Page

- **Purpose**: Page shown when a user indicates on the Check Details page that their Rural Payments Agency (RPA) details are incorrect. Served at `GET /{slug}/update-details` by the `updateDetails` plugin so the browser URL reflects the state the user is in.
- **Flow**: The `CheckDetailsController` POST handler redirects to `/{slug}/update-details` when `detailsConfirmed === false`; the plugin resolves the form by slug and renders the `incorrect-details` view.
- **Configuration**: Page content is driven by the form's `metadata.incorrectDetailsContent` block. If the block is omitted, the view falls back to a generic "Contact the RPA" message.
  - `heading` – page heading text.
  - `paragraphs` – ordered list of body paragraphs. Each entry is either a plain string or an object with `textBefore`, `link: { text, href }`, and `textAfter` to embed a single inline link.
  - `showRpaSupport` – when `true`, renders the shared `{{DEFRASUPPORTDETAILS}}` RPA contact block beneath the paragraphs.
  - `continueText` – optional override for the continue-button label (defaults to `Continue`).
- **Example**: the Woodland form definition sets `incorrectDetailsContent` in its metadata (Woodland lives in the internal grants config repo, not the example-grants repo)

### Land Parcel Map Pages

- **Purpose**: Interactive map for selecting land parcels from a user's registered holding
- **Features**:
  - Single or multi-parcel selection
  - MapLibre GL vector tile rendering
  - Parcel ID and area display via tooltip
  - Selected parcel IDs written to session state for downstream pages
- **Controllers**: `MapSelectPageController`
- **Full developer guide**: [src/server/common/map/README.md](./src/server/common/map/README.md)
- **Example**: [Example Grant with Map journey](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-map/grants-ui/example-grant-with-map.yaml)

### Conditional Pages

- **Purpose**: Show content based on previous answers
- **Features**:
  - Conditional logic
  - Dynamic content display
- **Example**: [Example Grant – Conditional page (/conditional-page)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml)

### Landing Pages

- **Purpose**: "Off-journey" interstitial pages that sit outside the normal page walk and are reached only via a status redirect (a `grantRedirectRule`) or a direct link — for example an "Application reopened" page shown before sending the user into their existing answers.
- **Why use them**: They let you surface contextual information about the state of an application (e.g. its GAS/Grants status) before the user continues into a journey page, without inserting an extra step into the standard forward navigation. Because they are positioned after the final journey page, the default V2 page walk never reaches them, so they only appear when a redirect rule or link points at them.
- **Features**:
  - Onward navigation resolved from the page's own `next:` links (with conditions honoured), instead of the default page-order walk; falls back to the form start page when no link matches.
  - Back link suppressed (there is no meaningful previous page).
  - Submit button label pinned to "Continue", overriding any form-wide `submitButtonText`.
  - Save and exit disabled.
- **Controller**: `LandingPageController`
- **Configuration**:
  - Add a page near the end of the form definition (after the final journey page) with `controller: LandingPageController`.
  - Give the page a `path` (e.g. `/reopened`) and any guidance components you want to show.
  - Add `next:` links pointing at where "Continue" should take the user (e.g. `- path: /summary`); add a `condition` on a link to route differently based on state.
  - Point a `grantRedirectRule` at the page's path (e.g. `toGrantsStatus: REOPENED`, `toPath: /reopened`) so the page is entered when the application reaches that status. See [Authentication & Security / Architecture docs](./ARCHITECTURE.md) and the `grantRedirectRules` blocks in the example grants for redirect configuration.
- **Examples**:
  - [Example Grant with Task List (hide questions) – `/reopened` landing page](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-task-list-hide-questions/grants-ui/example-grant-with-task-list-hide-questions.yaml) plus its [`postSubmission` redirect rule](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-task-list-hide-questions/grants-ui/example-grant-with-task-list-hide-questions.yaml)
  - [Example Grant with Auth – `/reopened` landing page](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml) plus its [`postSubmission` redirect rule](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml)

## Guidance Components

Guidance components provide contextual help and information without requiring user input.

### Html Component

- **Purpose**: Custom HTML content
- **Use Cases**: Instructions, information, warnings
- **Features**: Full HTML support with GOV.UK Design System classes
- **Example**: [Example Grant – Start page HTML (/start)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml)

### Details Component

- **Purpose**: Collapsible content sections
- **Use Cases**: Additional information, help text
- **Features**: Expandable/collapsible sections
- **Example**: [Example Grant – Start page details components (/start)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml)

### InsetText Component

- **Purpose**: Highlighted information boxes
- **Use Cases**: Important notices, warnings
- **Features**: Styled information boxes
- **Example**: [Example Grant – Start page inset text (/start)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml)

### Markdown Component

- **Purpose**: Markdown-formatted content
- **Use Cases**: Rich text formatting
- **Features**: Markdown syntax support
- **Example**: [Example Grant – Start page markdown (/start)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml)

### List Component

- **Purpose**: Display predefined lists
- **Use Cases**: Reference data, options
- **Features**: Linked to list definitions
- **Example**: [Example Grant – Autocomplete page list component (/autocomplete-field)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml)

## Form Configuration

### Metadata Configuration

- **Form ID**: Unique identifier for the form
- **Reference Number Prefix**: Custom prefix for application references
- **Submission Configuration**: Grant code and schema path
- **Options**: Grant-scoped configuration options

#### Metadata Options

`submitButtonText` - Override the standard "Continue" button text for all question type pages

### Confirmation Content Configuration

- **Panel Title**: Reference number panel title
- **Panel Text**: Reference number panel text
- **Custom HTML**: Full HTML content for confirmation page
- **Template Components**: Reusable components like `{{DEFRASUPPORTDETAILS}}`

### Notification Banner

- **Purpose**: Display an important, non-dismissible message to users on every page of a grant journey - for example warning of an upcoming submission deadline or a planned purge of draft applications. Implemented with the GOV.UK [notification banner](https://design-system.service.gov.uk/components/notification-banner/) component.
- **Scope**: Configured per grant via the `metadata.notificationBanner` block, so one scheme can show a banner while others do not. The banner appears on every page **except** those declared in the Excluded Pages (see below).
- **Configuration** (`metadata.notificationBanner`):
  - `enabled` – set `true` to show the banner. When omitted or `false`, no banner renders (this is how a grant opts out).
  - `titleText` – banner heading (e.g. `Important`). **Required** when `enabled` is `true`; a missing `titleText` is a configuration error and throws at render time.
  - `text` – the banner message.
  - `link` – optional call-to-action link. If declared it must include **both** `text` and `href` (an incomplete link is a configuration error and throws). The `href` must be an `http(s)` URL or a same-origin relative path; other schemes (e.g. `javascript:`) are rejected and the banner falls back to text only.
- **Excluded pages**: The list of excluded page path suffixes defaults to `/confirmation` and `/print-submitted-application` and is configurable via the `NOTIFICATION_BANNER_EXCLUDED_PATH_SUFFIXES` environment variable (see [config.js](./src/config/config.js#L280-L287)).
- **Implementation**: The banner params are built in [build-notification-banner-config.js](./src/config/nunjucks/context/build-notification-banner-config.js) and injected into every page via the shared Nunjucks context, then rendered in the base layout [page.njk](./src/server/common/templates/layouts/page.njk).
- **Example**: [Example Grant with Auth – `notificationBanner`](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml)

### Page Configuration

- **Title**: Page heading
- **Path**: URL path for the page
- **Controller**: Custom controller (optional)
- **Components**: Array of form components
- **Conditions**: Conditional display logic
- **Next**: Navigation configuration

## Authentication & Authorization

### Defra ID Integration

- **Purpose**: Secure user authentication
- **Features**:
  - OpenID Connect (OIDC) protocol
  - JWT token validation
  - User session management
  - Automatic redirect handling
- **Example**: [Auth plugin registration with Defra ID support](./src/plugins/auth.js#L91-L114)

### Allowlist System

- **Backend allowlist**: Per-grant access control driven by the grants-ui-backend allowlist endpoint
- **CRN/SBI based**: Access is decided from the signed-in user's Customer Reference Number and Single Business Identifier
- **Access Control**: Users who are not allowlisted for the grant are redirected to `/auth/journey-unauthorised`
- **Example**: [Allowlist plugin](./src/server/common/helpers/allowlist/allowlist.js)

### Session Management

- **Save and Return**: Resume incomplete applications
- **Session Persistence**: Redis-based session storage
- **Timeout Handling**: Automatic session expiration
- **State Rehydration**: Restore user state from backend

## Conditional Logic

### Conditions

- **Purpose**: Control page visibility and navigation
- **Types**:
  - Boolean value conditions
  - List item reference conditions
  - Complex logical operators
- **Example**: [Example Grant – Yes/No branch to terminal (/yes-no-field)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml) when the user selects "No"

### Conditional Navigation

- **Purpose**: Dynamic page routing based on user input
- **Features**:
  - Multiple navigation paths
  - Conditional page display
  - Dynamic form flow
- **Example**: [Example Grant – Radios page (/radios-field)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml) with different paths per option

## Lists & Data Sources

### List Definitions

- **Purpose**: Predefined data for dropdowns and selections
- **Types**: String-based lists with text/value pairs
- **Features**:
  - Item descriptions
  - Unique identifiers
  - Hierarchical organization
- **Example**: [Example Grant – Country list definition](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml)

### Dynamic Lists

- **Purpose**: Support journeys that need to populate options from external services
- **Approach**: Implement custom controllers or plugin extensions to fetch data before rendering form components

## Validation & Error Handling

### Custom Validation Messages

- **Purpose**: User-friendly error messages
- **Features**:
  - Field-specific messages
  - Validation type-specific messages
  - Contextual guidance
- **Example**: ["Enter a country" validation message on the Autocomplete page](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml)

### Schema Validation

- **Purpose**: Data structure validation
- **Features**:
  - JSON Schema validation
  - Type checking
  - Range validation
  - Pattern matching
- **Example**: [Email format validation on the Multi Field Form](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml)

### Error Display

- **Purpose**: Clear error communication
- **Features**:
  - Inline error messages
  - Error summary
  - Accessibility support
- **Example**: [Example Grant – Yes/No page (/yes-no-field)](https://github.com/DEFRA/grants-config-example-grants/blob/main/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml) uses inline errors and summaries when validation fails

## Submission & Confirmation

### Form Submission

- **Purpose**: Submit completed applications
- **Features**:
  - Data validation
  - GAS integration
  - Reference number generation
  - Status tracking
- **Process**: Declaration → Submission → Confirmation
- **Example**: [DeclarationPageController submission workflow](./src/server/declaration/declaration-page.controller.js#L51-L126)

### Confirmation System

- **Purpose**: Post-submission user experience
- **Features**:
  - Custom HTML content
  - Reference number display
  - Next steps guidance
  - Support information
- **Configuration**: Confirmation content defined in the form definition metadata
- **Example**: [ConfirmationPageController renders confirmation view](./src/server/confirmation/confirmation-page.controller.js#L17-L63)

### State Management

- **Purpose**: Application state persistence
- **Features**:
  - Session storage
  - Backend integration
  - State rehydration
  - Progress tracking
- **Example**: [StatePersistenceService integration](./src/server/common/services/state-persistence/state-persistence.service.js#L24-L74) powering save-and-return functionality

## Development Features

### Dev Tools

- **Purpose**: Development and testing support
- **Features**:
  - Demo confirmation pages
  - State clearing
  - Debug information
  - Mock data support
- **Access**: Development environment only
- **Example**: [Dev tools plugin registering development routes](./src/server/dev-tools/index.js#L1-L120)

### Testing Support

- **Purpose**: Automated testing capabilities
- **Features**:
  - Contract testing
  - Integration testing
  - Mock services
  - Test data management
- **Example**: [Vitest scripts defined in package.json](./package.json#L30-L34)

## Best Practices

### Form Design

- Use appropriate components for data types
- Provide clear validation messages
- Implement progressive disclosure
- Ensure accessibility compliance

### Configuration

- Use meaningful page titles and paths
- Implement proper conditional logic
- Configure appropriate validation rules
- Test all user journeys

### Security

- Implement proper authentication
- Use allowlist restrictions
- Validate all user input
- Protect sensitive data

This comprehensive feature set enables the creation of sophisticated, user-friendly grant application forms that can handle complex business logic, validation requirements, and user experience needs.
