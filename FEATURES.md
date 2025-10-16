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
- **Example**: Applicant name field with pattern validation for letters, hyphens, and apostrophes

#### MultilineTextField

- **Purpose**: Multi-line text input for longer content
- **Use Cases**: Descriptions, comments, detailed explanations
- **Features**:
  - Configurable number of rows
  - Word count limits
  - Custom validation messages
- **Example**: Project description with 400-word limit

#### EmailAddressField

- **Purpose**: Email address input with built-in validation
- **Use Cases**: Contact information, notifications
- **Features**:
  - Email format validation
  - Custom validation messages
  - Required/optional configuration
- **Example**: Applicant email with format validation

#### TelephoneNumberField

- **Purpose**: Phone number input with pattern validation
- **Use Cases**: Contact numbers, mobile/landline
- **Features**:
  - Pattern matching for various phone formats
  - Autocomplete support
  - Custom validation messages
- **Example**: Mobile number with regex pattern validation

### Selection Components

#### RadiosField

- **Purpose**: Single selection from multiple options
- **Use Cases**: Exclusive choices, category selection
- **Features**:
  - Custom validation messages
  - Option descriptions/hints
  - Conditional navigation
- **Example**: Business type selection with conditional page routing

#### CheckboxesField

- **Purpose**: Multiple selection from available options
- **Use Cases**: Multi-select categories, feature selection
- **Features**:
  - Required/optional configuration
  - Option descriptions
  - Custom validation messages
- **Example**: Eligible items selection requiring at least one choice

#### SelectField

- **Purpose**: Dropdown selection from a list
- **Use Cases**: Long lists, category selection
- **Features**:
  - Required/optional configuration
  - Custom validation messages
- **Example**: Country selection from predefined list

#### AutocompleteField

- **Purpose**: Searchable dropdown with filtering
- **Use Cases**: Large datasets, country/location selection
- **Features**:
  - Real-time filtering
  - Custom validation messages
  - Hint text for user guidance
- **Example**: Country selection with type-ahead functionality

#### YesNoField

- **Purpose**: Binary choice (Yes/No) input
- **Use Cases**: Eligibility questions, boolean decisions
- **Features**:
  - Custom validation messages
  - Conditional navigation to terminal pages
- **Example**: Eligibility confirmation with terminal page routing

### Numeric Components

#### NumberField

- **Purpose**: Numeric input with validation
- **Use Cases**: Costs, quantities, measurements
- **Features**:
  - Min/max value constraints
  - Precision control
  - Currency prefix support
  - Custom validation messages
- **Example**: Project cost input with £ prefix and £10,000-£999,999 range

### Date Components

#### DatePartsField

- **Purpose**: Date input with separate day/month/year fields
- **Use Cases**: Project start dates, deadlines
- **Features**:
  - Past/future date restrictions
  - Custom validation messages
  - Autocomplete control
- **Example**: Project start date with 90-day future limit

#### MonthYearField

- **Purpose**: Month and year selection
- **Use Cases**: Approximate dates, planning periods
- **Features**:
  - Required/optional configuration
  - Custom validation messages
- **Example**: Planning permission month/year

### Address Components

#### UkAddressField

- **Purpose**: UK address input with multiple fields
- **Use Cases**: Business addresses, contact addresses
- **Features**:
  - Multiple address lines
  - Optional fields (address line 2, county)
  - Postcode validation
  - Automatic field grouping
- **Example**: Business address with optional fields

## Page Types

The service supports several specialized page types for different stages of the application process.

### Standard Pages

- **Purpose**: Regular form pages with input components
- **Features**: Component rendering, validation, navigation
- **Example**: Individual question pages

### Summary Pages

- **Purpose**: Review and edit previously entered data
- **Features**:
  - Display all form answers
  - Edit functionality
  - Change links for each section
- **Controller**: `CheckResponsesPageController`
- **Example**: "Check your answers" page

### Declaration Pages

- **Purpose**: Final confirmation and submission
- **Features**:
  - Declaration text
  - Form submission to GAS
  - Application status management
- **Controller**: `DeclarationPageController`
- **Example**: "Confirm and send" page

### Confirmation Pages

- **Purpose**: Post-submission confirmation and next steps
- **Features**:
  - Custom HTML content
  - Reference number display
  - Next steps information
  - Support contact details
- **Controller**: `ConfirmationPageController`
- **Example**: Application submitted confirmation

### Terminal Pages

- **Purpose**: End the application process with specific messaging
- **Features**:
  - Custom HTML content
  - Eligibility messaging
  - Alternative options
- **Controller**: `TerminalPageController`
- **Example**: "You cannot apply" page

### Conditional Pages

- **Purpose**: Show content based on previous answers
- **Features**:
  - Conditional logic
  - Dynamic content display
- **Example**: Additional information based on previous selections

## Guidance Components

Guidance components provide contextual help and information without requiring user input.

### Html Component

- **Purpose**: Custom HTML content
- **Use Cases**: Instructions, information, warnings
- **Features**: Full HTML support with GOV.UK Design System classes
- **Example**: Service introduction text

### Details Component

- **Purpose**: Collapsible content sections
- **Use Cases**: Additional information, help text
- **Features**: Expandable/collapsible sections
- **Example**: Component and page type lists

### InsetText Component

- **Purpose**: Highlighted information boxes
- **Use Cases**: Important notices, warnings
- **Features**: Styled information boxes
- **Example**: Guidance component demonstration

### Markdown Component

- **Purpose**: Markdown-formatted content
- **Use Cases**: Rich text formatting
- **Features**: Markdown syntax support
- **Example**: Formatted text with bold, italic, strikethrough

### List Component

- **Purpose**: Display predefined lists
- **Use Cases**: Reference data, options
- **Features**: Linked to list definitions
- **Example**: Country list for autocomplete

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

### Whitelist System

- **CRN Whitelisting**: Customer Reference Number validation
- **SBI Whitelisting**: Single Business Identifier validation
- **Environment Variables**: Configurable whitelist management
- **Access Control**: Grant-specific access restrictions

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
- **Example**: Show terminal page when "No" is selected

### Conditional Navigation

- **Purpose**: Dynamic page routing based on user input
- **Features**:
  - Multiple navigation paths
  - Conditional page display
  - Dynamic form flow
- **Example**: Different paths based on radio button selection

## Lists & Data Sources

### List Definitions

- **Purpose**: Predefined data for dropdowns and selections
- **Types**: String-based lists with text/value pairs
- **Features**:
  - Item descriptions
  - Unique identifiers
  - Hierarchical organization
- **Example**: Country list with ISO codes

### Dynamic Lists

- **Purpose**: Runtime data loading
- **Features**:
  - API integration
  - Real-time updates
  - Caching support
- **Example**: Dynamic scoring data

## Validation & Error Handling

### Custom Validation Messages

- **Purpose**: User-friendly error messages
- **Features**:
  - Field-specific messages
  - Validation type-specific messages
  - Contextual guidance
- **Example**: "Enter a country" for autocomplete field

### Schema Validation

- **Purpose**: Data structure validation
- **Features**:
  - JSON Schema validation
  - Type checking
  - Range validation
  - Pattern matching
- **Example**: Email format validation with regex

### Error Display

- **Purpose**: Clear error communication
- **Features**:
  - Inline error messages
  - Error summary
  - Accessibility support
- **Example**: Form validation with error highlighting

## Submission & Confirmation

### Form Submission

- **Purpose**: Submit completed applications
- **Features**:
  - Data validation
  - GAS integration
  - Reference number generation
  - Status tracking
- **Process**: Declaration → Submission → Confirmation

### Confirmation System

- **Purpose**: Post-submission user experience
- **Features**:
  - Custom HTML content
  - Reference number display
  - Next steps guidance
  - Support information
- **Configuration**: YAML-based confirmation content

### State Management

- **Purpose**: Application state persistence
- **Features**:
  - Session storage
  - Backend integration
  - State rehydration
  - Progress tracking
- **Example**: Save and return functionality

## Development Features

### Dev Tools

- **Purpose**: Development and testing support
- **Features**:
  - Demo confirmation pages
  - State clearing
  - Debug information
  - Mock data support
- **Access**: Development environment only

### Testing Support

- **Purpose**: Automated testing capabilities
- **Features**:
  - Contract testing
  - Integration testing
  - Mock services
  - Test data management
- **Example**: Vitest-based test suite

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
