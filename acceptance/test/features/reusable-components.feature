Feature: Reusable Components

    @ci
    Scenario: Use all available components in example journey and analyze accessibility
        Given there is no application state stored for CRN "1100957269" and SBI "107593059" and grant "example-grant-with-auth"

        # start
        Given the user navigates to "/example-grant-with-auth/start"
        And completes any login process as CRN "1100957269"
        Then the user should see heading "Example Grant"
        And the page is analyzed for accessibility
        When the user clicks on "Start now"

        # yes-no-field
        Then the user should be at URL "yes-no-field"
        And should see heading "YesNoField Example"
        And the page is analyzed for accessibility
        When the user selects "No"
        And continues

        # terminal-page
        Then the user should be at URL "terminal-page"
        And should see heading "Terminal Page Example"
        And the page is analyzed for accessibility
        When the user navigates backward
        
        # yes-no-field
        Then the user should be at URL "yes-no-field"
        When the user selects "Yes"
        And continues

        # autocomplete-field
        Then the user should be at URL "autocomplete-field"
        And should see heading "AutocompleteField Example"
        And the page is analyzed for accessibility
        When the user selects "England" for AutocompleteField "Country"
        And continues

        # radios-field
        Then the user should be at URL "radios-field"
        And should see heading "RadiosField Example"
        And the page is analyzed for accessibility
        When the user selects "Option one"
        And continues

        # conditional-page
        Then the user should be at URL "conditional-page"
        And should see heading "Conditional Page Example"
        And the page is analyzed for accessibility
        When the user continues

        # checkboxes-field
        Then the user should be at URL "checkboxes-field"
        And should see heading "CheckboxesField Example"
        And the page is analyzed for accessibility
        When the user selects the following
            | Option two   |
            | Option three |
        And continues

        # number-field
        Then the user should be at URL "number-field"
        And should see heading "NumberField Example"
        And the page is analyzed for accessibility
        When the user enters "100000" for "Enter amount"
        And continues

        # date-parts-field
        Then the user should be at URL "date-parts-field"
        And should see heading "DatePartsField Example"
        And the page is analyzed for accessibility
        When the user enters the date in a week for DatePartsField "datePartsField"
        And continues

        # month-year-field
        Then the user should be at URL "month-year-field"
        And should see heading "MonthYearField Example"
        And the page is analyzed for accessibility
        When the user enters month "08" and year "2025" for MonthYearField "monthYearField"
        And continues
    
        # select-field
        Then the user should be at URL "select-field"
        And should see heading "SelectField Example"
        And the page is analyzed for accessibility
        When the user selects "Option three" for "Select option"
        And continues

        # multiline-text-field
        Then the user should be at URL "multiline-text-field"
        And should see label heading "MultilineTextField Example"
        And the page is analyzed for accessibility
        When the user enters "Lorem ipsum" for MultilineTextField "MultilineTextField Example"
        And continues

        # select-land-parcel
        Then the user should be at URL "select-land-parcel"
        And should see heading "Select all the eligible land parcels for the location of your woodland"
        And the page is analyzed for accessibility
        When the user selects the following
            | SD6351 8781 |
        And continues

        # multi-field-form
        Then the user should be at URL "multi-field-form"
        And should see heading "Multi Field Form Example"
        And the page is analyzed for accessibility
        When the user enters the following
            | FIELD                     | VALUE                                              |
            | Name                      | James Test-Farmer                                  |
            | Email address             | cl-defra-gae-test-applicant-email@equalexperts.com |
            | Mobile number             | 07777 123456                                       |
            | Address line 1            | Test Farm                                          |
            | Address line 2 (optional) | Cogenhoe                                           |
            | Town                      | Northampton                                        |
            | County (optional)         | Northamptonshire                                   |
            | Postcode                  | NN7 1NN                                            |
        And continues

        # check-details
        Then the user should be at URL "check-details"
        And should see heading "Check your details"
        And the page is analyzed for accessibility
        When the user selects "Yes"
        And continues

        # summary
        Then the user should be at URL "summary"
        And should see heading "Check your answers"
        And the page is analyzed for accessibility
        Then the user should see the following answers
            | QUESTION            | ANSWER                                             |
            | Yes or No           | Yes                                                |
            | Country             | England                                            |
            | Radio option        | Option one                                         |
            | Checkbox options    | Option two                                         |
            |                     | Option three                                       |
            | Enter amount        | 100000                                             |
            | Date                | {DATE IN A WEEK}                                   |
            | Month and year      | August 2025                                        |
            | Select option       | Option three                                       |
            | Description         | Lorem ipsum                                        |
            | Select land parcels | SD6351-8781                                        |
            | Name                | James Test-Farmer                                  |
            | Email address       | cl-defra-gae-test-applicant-email@equalexperts.com |
            | Mobile number       | 07777 123456                                       |
            | Address             | Test Farm                                          |
            |                     | Cogenhoe                                           |
            |                     | Northampton                                        |
            |                     | Northamptonshire                                   |
            |                     | NN7 1NN                                            |
        When the user chooses to change their summary answer to question "Country"

        # autocomplete-field
        Then the user should be at URL "autocomplete-field"
        And the page is analyzed for accessibility
        When the user selects "Wales" for AutocompleteField "Country"
        And continues

        # summary
        Then the user should be at URL "summary"
        And the page is analyzed for accessibility
        Then the user should see the following answers
            | QUESTION            | ANSWER                                             |
            | Yes or No           | Yes                                                |
            | Country             | Wales                                              |
            | Radio option        | Option one                                         |
            | Checkbox options    | Option two                                         |
            |                     | Option three                                       |
            | Enter amount        | 100000                                             |
            | Date                | {DATE IN A WEEK}                                   |
            | Month and year      | August 2025                                        |
            | Select option       | Option three                                       |
            | Description         | Lorem ipsum                                        |
            | Select land parcels | SD6351-8781                                        |
            | Name                | James Test-Farmer                                  |
            | Email address       | cl-defra-gae-test-applicant-email@equalexperts.com |
            | Mobile number       | 07777 123456                                       |
            | Address             | Test Farm                                          |
            |                     | Cogenhoe                                           |
            |                     | Northampton                                        |
            |                     | Northamptonshire                                   |
            |                     | NN7 1NN                                            |
        When the user continues

        # declaration
        Then the user should be at URL "declaration"
        And should see heading "Confirm and send"
        And the page is analyzed for accessibility
        When the user confirms and sends
        
        # confirmation
        Then the user should be at URL "confirmation"
        And should see heading "Details submitted"
        And the page is analyzed for accessibility
        And should see an "EGWA" reference number for their application
        When the user clicks on "View / Print submitted application (opens in new tab)"
        Then a new tab should be opened at URL "print-submitted-application" and closed by the user

        # print-submitted-application
        Given the user navigates to "/example-grant-with-auth/print-submitted-application"
        Then the user should see heading "Example grant with auth application"
        And the page is analyzed for accessibility
        Then the user should see the following submitted application details
            | Application number  | {REFERENCE NUMBER}                                          |
            | Applicant details   |                                                             |
            | Title               | {ANY}                                                       |
            | First name          | {ANY}                                                       |
            | Middle name         | {ANY}                                                       |
            | Last name           | {ANY}                                                       |
            | Business name       | {ANY}                                                       |
            | Address 1           | {ANY}                                                       |
            | Address 2           | {ANY}                                                       |
            | City                | {ANY}                                                       |
            | Postcode            | {ANY}                                                       |
            | SBI number          | {ANY}                                                       |
            | Email address       | {ANY}                                                       |
            | Submitted answers   |                                                             |
            | Yes or No           | Yes                                                         |
            | Country             | Wales                                                       |
            | Radio option        | Option one                                                  |
            | Checkbox options    | Option two, Option three                                    |
            | Enter amount        | 100000                                                      |
            | Date                | {DATE IN A WEEK}                                            |
            | Month and year      | August 2025                                                 |
            | Select option       | Option three                                                |
            | Description         | Lorem ipsum                                                 |
            | Select land parcels | SD6351-8781                                                 |
            | Name                | James Test-Farmer                                           |
            | Email address       | cl-defra-gae-test-applicant-email@equalexperts.com          |
            | Mobile number       | 07777 123456                                                |
            | Address             | Test Farm, Cogenhoe, Northampton, Northamptonshire, NN7 1NN |
        And should see the following configurable content
            | Configurable content                                                                                                                       |
            | This is an example of configurable content on the print page, defined via the configurablePrintContent property in the form YAML metadata. |
            | It supports HTML markup and the example-grant-with-auth placeholder.                                                                       |
        And should see button "Print this page"
