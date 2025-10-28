# Grants UI Features

This document provides a comprehensive overview of all the features available in the Grants UI service, as demonstrated by the Example Grant with Auth journey. Each feature is configurable through YAML files and can be used to build custom grant application forms.

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
- **Example**: [Example Grant – Multi Field Form (/multi-field-form)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L320-L352) – applicant name field with pattern validation for letters, hyphens, and apostrophes

#### MultilineTextField

- **Purpose**: Multi-line text input for longer content
- **Use Cases**: Descriptions, comments, detailed explanations
- **Features**:
  - Configurable number of rows
  - Word count limits
  - Custom validation messages
- **Example**: [Example Grant – Multiline Text page (/multiline-text-field)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L304-L319) – description prompt with a 400-word limit

#### EmailAddressField

- **Purpose**: Email address input with built-in validation
- **Use Cases**: Contact information, notifications
- **Features**:
  - Email format validation
  - Custom validation messages
  - Required/optional configuration
- **Example**: [Example Grant – Multi Field Form (/multi-field-form)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L320-L364) – applicant email with format validation

#### TelephoneNumberField

- **Purpose**: Phone number input with pattern validation
- **Use Cases**: Contact numbers, mobile/landline
- **Features**:
  - Pattern matching for various phone formats
  - Autocomplete support
  - Custom validation messages
- **Example**: [Example Grant – Multi Field Form (/multi-field-form)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L320-L378) – mobile number with regex pattern validation

### Selection Components

#### RadiosField

- **Purpose**: Single selection from multiple options
- **Use Cases**: Exclusive choices, category selection
- **Features**:
  - Custom validation messages
  - Option descriptions/hints
  - Conditional navigation
- **Example**: [Example Grant – Radios page (/radios-field)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L169-L193) – business type selection with conditional routing

#### CheckboxesField

- **Purpose**: Multiple selection from available options
- **Use Cases**: Multi-select categories, feature selection
- **Features**:
  - Required/optional configuration
  - Option descriptions
  - Custom validation messages
- **Example**: [Example Grant – Checkboxes page (/checkboxes-field)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L208-L220) – multi-select list requiring at least one choice

#### SelectField

- **Purpose**: Dropdown selection from a list
- **Use Cases**: Long lists, category selection
- **Features**:
  - Required/optional configuration
  - Custom validation messages
- **Example**: [Example Grant – Select page (/select-field)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L288-L303) – dropdown populated from a predefined list

#### AutocompleteField

- **Purpose**: Searchable dropdown with filtering
- **Use Cases**: Large datasets, country/location selection
- **Features**:
  - Real-time filtering
  - Custom validation messages
  - Hint text for user guidance
- **Example**: [Example Grant – Autocomplete page (/autocomplete-field)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L139-L168) – country selection with type-ahead filtering

#### YesNoField

- **Purpose**: Binary choice (Yes/No) input
- **Use Cases**: Eligibility questions, boolean decisions
- **Features**:
  - Custom validation messages
  - Conditional navigation to terminal pages
- **Example**: [Example Grant – Yes/No page (/yes-no-field)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L109-L123) – eligibility confirmation that can route to a terminal page

### Numeric Components

#### NumberField

- **Purpose**: Numeric input with validation
- **Use Cases**: Costs, quantities, measurements
- **Features**:
  - Min/max value constraints
  - Precision control
  - Currency prefix support
  - Custom validation messages
- **Example**: [Example Grant – Number field page (/number-field)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L226-L254) – project cost entry with £ prefix and range validation

### Date Components

#### DatePartsField

- **Purpose**: Date input with separate day/month/year fields
- **Use Cases**: Project start dates, deadlines
- **Features**:
  - Past/future date restrictions
  - Custom validation messages
  - Autocomplete control
- **Example**: [Example Grant – Date parts page (/date-parts-field)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L255-L269) – project start date constrained to the next 90 days

#### MonthYearField

- **Purpose**: Month and year selection
- **Use Cases**: Approximate dates, planning periods
- **Features**:
  - Required/optional configuration
  - Custom validation messages
- **Example**: [Example Grant – Month & year page (/month-year-field)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L271-L280) – planning permission month/year selector

### Address Components

#### UkAddressField

- **Purpose**: UK address input with multiple fields
- **Use Cases**: Business addresses, contact addresses
- **Features**:
  - Multiple address lines
  - Optional fields (address line 2, county)
  - Postcode validation
  - Automatic field grouping
- **Example**: [Example Grant – Multi Field Form (/multi-field-form)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L320-L392) – business address entry with optional lines and postcode validation

## Page Types

The service supports several specialized page types for different stages of the application process.

### Standard Pages

- **Purpose**: Regular form pages with input components
- **Features**: Component rendering, validation, navigation
- **Example**: [Example Grant – Radios page (/radios-field)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L169-L193)

### Summary Pages

- **Purpose**: Review and edit previously entered data
- **Features**:
  - Display all form answers
  - Edit functionality
  - Change links for each section
- **Controller**: `CheckResponsesPageController`
- **Example**: [Example Grant – Summary page (/summary)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L394-L397)

### Declaration Pages

- **Purpose**: Final confirmation and submission
- **Features**:
  - Declaration text
  - Form submission to GAS
  - Application status management
- **Controller**: `DeclarationPageController`
- **Example**: [Example Grant – Declaration page (/declaration)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L398-L401)

### Confirmation Pages

- **Purpose**: Post-submission confirmation and next steps
- **Features**:
  - Custom HTML content
  - Reference number display
  - Next steps information
  - Support contact details
- **Controller**: `ConfirmationPageController`
- **Example**: [Example Grant – Confirmation content](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L1-L37)

### Terminal Pages

- **Purpose**: End the application process with specific messaging
- **Features**:
  - Custom HTML content
  - Eligibility messaging
  - Alternative options
- **Controller**: `TerminalPageController`
- **Example**: [Example Grant – Terminal page (/terminal-page)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L124-L138)

### Conditional Pages

- **Purpose**: Show content based on previous answers
- **Features**:
  - Conditional logic
  - Dynamic content display
- **Example**: [Example Grant – Conditional page (/conditional-page)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L194-L207)

## Guidance Components

Guidance components provide contextual help and information without requiring user input.

### Html Component

- **Purpose**: Custom HTML content
- **Use Cases**: Instructions, information, warnings
- **Features**: Full HTML support with GOV.UK Design System classes
- **Example**: [Example Grant – Start page HTML (/start)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L39-L51)

### Details Component

- **Purpose**: Collapsible content sections
- **Use Cases**: Additional information, help text
- **Features**: Expandable/collapsible sections
- **Example**: [Example Grant – Start page details components (/start)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L52-L88)

### InsetText Component

- **Purpose**: Highlighted information boxes
- **Use Cases**: Important notices, warnings
- **Features**: Styled information boxes
- **Example**: [Example Grant – Start page inset text (/start)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L89-L98)

### Markdown Component

- **Purpose**: Markdown-formatted content
- **Use Cases**: Rich text formatting
- **Features**: Markdown syntax support
- **Example**: [Example Grant – Start page markdown (/start)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L99-L106)

### List Component

- **Purpose**: Display predefined lists
- **Use Cases**: Reference data, options
- **Features**: Linked to list definitions
- **Example**: [Example Grant – Autocomplete page list component (/autocomplete-field)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L139-L156)

## Form Configuration

### Metadata Configuration

- **Form ID**: Unique identifier for the form
- **Production Enablement**: `enabledInProd` flag
- **Reference Number Prefix**: Custom prefix for application references
- **Whitelist Configuration**: CRN and SBI environment variables
- **Submission Configuration**: Grant code and schema path

### Confirmation Content Configuration

- **Panel Title**: Reference number panel title
- **Panel Text**: Reference number panel text
- **Custom HTML**: Full HTML content for confirmation page
- **Template Components**: Reusable components like `{{DEFRASUPPORTDETAILS}}`

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

### Whitelist System

- **CRN Whitelisting**: Customer Reference Number validation
- **SBI Whitelisting**: Single Business Identifier validation
- **Environment Variables**: Configurable whitelist management
- **Access Control**: Grant-specific access restrictions
- **Example**: [Example Whitelist definition and metadata](./src/server/common/forms/definitions/example-whitelist.yaml#L1-L18)

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
- **Example**: [Example Grant – Yes/No branch to terminal (/yes-no-field)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L109-L138) when the user selects "No"

### Conditional Navigation

- **Purpose**: Dynamic page routing based on user input
- **Features**:
  - Multiple navigation paths
  - Conditional page display
  - Dynamic form flow
- **Example**: [Example Grant – Radios page (/radios-field)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L169-L207) with different paths per option

## Lists & Data Sources

### List Definitions

- **Purpose**: Predefined data for dropdowns and selections
- **Types**: String-based lists with text/value pairs
- **Features**:
  - Item descriptions
  - Unique identifiers
  - Hierarchical organization
- **Example**: [Example Grant – Country list definition](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L404-L456)

### Dynamic Lists

- **Purpose**: Support journeys that need to populate options from external services
- **Approach**: Implement custom controllers or plugin extensions to fetch data before rendering form components
- **Example**: [Adding Value – Score results page fetches scoring data on load](./src/server/common/forms/definitions/adding-value.yaml#L862-L870)

## Validation & Error Handling

### Custom Validation Messages

- **Purpose**: User-friendly error messages
- **Features**:
  - Field-specific messages
  - Validation type-specific messages
  - Contextual guidance
- **Example**: ["Enter a country" validation message on the Autocomplete page](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L157-L165)

### Schema Validation

- **Purpose**: Data structure validation
- **Features**:
  - JSON Schema validation
  - Type checking
  - Range validation
  - Pattern matching
- **Example**: [Email format validation on the Multi Field Form](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L352-L364)

### Error Display

- **Purpose**: Clear error communication
- **Features**:
  - Inline error messages
  - Error summary
  - Accessibility support
- **Example**: [Example Grant – Yes/No page (/yes-no-field)](./src/server/common/forms/definitions/example-grant-with-auth.yaml#L109-L123) uses inline errors and summaries when validation fails

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
- **Configuration**: YAML-based confirmation content
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
- Use whitelist restrictions
- Validate all user input
- Protect sensitive data

This comprehensive feature set enables the creation of sophisticated, user-friendly grant application forms that can handle complex business logic, validation requirements, and user experience needs.
