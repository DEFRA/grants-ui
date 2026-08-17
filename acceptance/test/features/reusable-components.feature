Feature: Reusable Components
    Follow the example-grant-with-auth journey:
    - Exercising all reusable UI components
    - Checking feedback links are rendered
    - Checking GOV.UK phase is observed

    Scenario: Use all available components in example journey and analyze accessibility
        Given there is no application data for SBI "107593059" and grant "example-grant-with-auth"

        # start
        Given the user navigates to "/example-grant-with-auth"
        And logs in as CRN "1100957269"
        Then the user should see heading "Example Grant"
        And the page is analyzed for accessibility
        And the user should see a notification banner
        And the user should see a phase banner feedback link
        And the user should see full GOV.UK branding as a public beta service
        When the user clicks on "Start now"

        # check-details
        Then the user should be at URL "check-details"
        And should see heading "Check your details"
        And the page is analyzed for accessibility
        And the user should see a notification banner
        And the user should see a phase banner feedback link
        When the user selects "No"
        And continues

        # update-details
        Then the user should be at URL "update-details"
        And should see heading "Contact the RPA to update your details"
        And the page is analyzed for accessibility
        When the user navigates backward
        
        # check-details
        Then the user should be at URL "check-details"
        When the user selects "Yes"
        And continues

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

        # checkboxes-follow-up (conditional on Option three)
        Then the user should be at URL "checkboxes-follow-up"
        And should see heading "Checkbox follow-up"
        And the page is analyzed for accessibility
        When the user continues

        # number-field-validation
        Then the user should be at URL "number-field-validation"
        And should see heading "NumberField with validation"
        And the page is analyzed for accessibility
        When the user enters "100000" for "Enter amount"
        And continues

        # number-field-routing
        Then the user should be at URL "number-field-routing"
        And should see heading "NumberField with conditional routing"
        And the page is analyzed for accessibility
        When the user enters "50000" for "Enter amount that may divert the journey"
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

        # email-address-field
        Then the user should be at URL "email-address-field"
        And should see label heading "EmailAddressField Example"
        And the page is analyzed for accessibility
        When the user enters "test@example.com" for "EmailAddressField Example"
        And continues

        # telephone-number-field
        Then the user should be at URL "telephone-number-field"
        And should see label heading "TelephoneNumberField Example"
        And the page is analyzed for accessibility
        When the user enters "01234 567890" for "TelephoneNumberField Example"
        And continues

        # uk-address-field
        Then the user should be at URL "uk-address-field"
        And should see heading "UkAddressField Example"
        And the page is analyzed for accessibility
        When the user enters the following
            | FIELD          | VALUE            |
            | Address line 1 | 1 Example Street |
            | Town or city   | Exampleton       |
            | Postcode       | EX1 1EX          |
        And continues

        # location-components
        Then the user should be at URL "location-components"
        And should see heading "Location components Example"
        And the page is analyzed for accessibility
        When the user enters the following
            | FIELD                       | VALUE          |
            | Easting                     | 530000         |
            | Northing                    | 180000         |
            | OS national grid reference  | ST 678 678     |
            | National Grid field number  | NG 1234 5678   |
            | Latitude                    | 51.519450      |
            | Longitude                   | -0.127758      |
            | GeospatialField             | [{"type":"Feature","properties":{"description":"Example location","coordinateGridReference":"ST 00001","centroidGridReference":"ST 00001"},"geometry":{"coordinates":[-2.5723699109417737,53.2380485215034],"type":"Point"},"id":"a"}] |
        And continues

        # hidden-field
        Then the user should be at URL "hidden-field"
        And should see heading "HiddenField Example"
        And the page is analyzed for accessibility
        When the user continues

        # multi-field-form
        Then the user should be at URL "multi-field-form"
        And should see heading "Multi Field Form Example"
        And the page is analyzed for accessibility
        When the user enters the following
            | FIELD               | VALUE               |
            | Project name        | Test project        |
            | Project description | Project description |
            | Project budget      | 50000               |
        And continues

        # repeat-page (item entry)
        Then the user should be at URL "repeat-page"
        And should see heading "RepeatPage Example"
        And the page is analyzed for accessibility
        When the user enters the following
            | FIELD     | VALUE               |
            | Item name | Repeat item example |
            | Amount    | 12000               |
        And continues

        # repeat-page (list summary)
        Then the user should be at URL "repeat-page"
        And should see heading "You have added 1 answer"
        And the page is analyzed for accessibility
        When the user continues

        # select-land-parcel (map)
        Then the user should be at URL "select-land-parcel"
        And should see heading "Select a land parcel"
        And the page is analyzed for accessibility
        # Pinned deliberately: this scenario asserts the parcel reference in the
        # check-answers and print tables below, which need a stable value.
        When the user selects parcel "SD6351-8781" on the map
        And continues

        # select-actions-for-land-parcel
        Then the user should be at URL "select-actions-for-land-parcel"
        And should see heading "Select actions for this land parcel"
        And the page is analyzed for accessibility
        When the user selects the first item
        And continues

        # your land and actions (payment summary)
        Then the user should be at URL "confirm-land-and-actions"
        And should see heading "Your land and actions"
        And the page is analyzed for accessibility
        And the user should see the text "Yearly payment for this parcel"
        And the user should see the text "Total yearly payment"
        And the user should see a populated land and actions payment summary
        And the user should see 1 land parcel section
        And the user should see button "Save and continue"
        And the user should see button "Add another land parcel"

        # "Add another land parcel" must route to the parcel picker rather than
        # the task list. It does not add a parcel here - the same parcel is still
        # selected - so the section count is asserted as unchanged on return.
        When the user clicks on "Add another land parcel"
        Then the user should be at URL "select-land-parcel"
        When the user continues
        Then the user should be at URL "select-actions-for-land-parcel"
        When the user continues
        Then the user should be at URL "confirm-land-and-actions"
        And the user should see a populated land and actions payment summary
        And the user should see 1 land parcel section
        When the user clicks on "Save and continue"

        # summary
        Then the user should be at URL "summary"
        And should see heading "Check your answers"
        And the page is analyzed for accessibility
        Then the user should see the following answers
            | QUESTION                       | ANSWER                  |
            | Yes or No                      | Yes                     |
            | Country                        | England                 |
            | Radio option                   | Option one              |
            | Checkbox options               | Option two              |
            |                                | Option three            |
            | Enter amount                   | 100000                  |
            | Routing amount                 | 50000                   |
            | Date                           | {DATE IN A WEEK}        |
            | Month and year                 | August 2025             |
            | Select option                  | Option three            |
            | Description                    | Lorem ipsum             |
            | Email address                  | test@example.com        |
            | Telephone number               | 01234 567890            |
            | Address                        | 1 Example Street        |
            |                                | Exampleton              |
            |                                | EX1 1EX                 |
            | Easting and northing           | Easting: 530000         |
            |                                | Northing: 180000        |
            | OS grid reference              | ST 678 678              |
            | National Grid field number     | NG 1234 5678            |
            | Latitude and longitude         | Latitude: 51.51945      |
            |                                | Longitude: -0.127758    |
            | GeospatialField                | Added 1 location        |
            | Hidden field                   | Not provided            |
            | Project name                   | Test project            |
            | Project description            | Project description     |
            | Project budget                 | 50000                   |
            | Item                           | You have added 1 answer |
            | Land parcel                    | SD6351-8781             |
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
            | QUESTION                       | ANSWER                  |
            | Yes or No                      | Yes                     |
            | Country                        | Wales                   |
            | Radio option                   | Option one              |
            | Checkbox options               | Option two              |
            |                                | Option three            |
            | Enter amount                   | 100000                  |
            | Routing amount                 | 50000                   |
            | Date                           | {DATE IN A WEEK}        |
            | Month and year                 | August 2025             |
            | Select option                  | Option three            |
            | Description                    | Lorem ipsum             |
            | Email address                  | test@example.com        |
            | Telephone number               | 01234 567890            |
            | Address                        | 1 Example Street        |
            |                                | Exampleton              |
            |                                | EX1 1EX                 |
            | Easting and northing           | Easting: 530000         |
            |                                | Northing: 180000        |
            | OS grid reference              | ST 678 678              |
            | National Grid field number     | NG 1234 5678            |
            | Latitude and longitude         | Latitude: 51.51945      |
            |                                | Longitude: -0.127758    |
            | GeospatialField                | Added 1 location        |
            | Hidden field                   | Not provided            |
            | Project name                   | Test project            |
            | Project description            | Project description     |
            | Project budget                 | 50000                   |
            | Item                           | You have added 1 answer |
            | Land parcel                    | SD6351-8781             |
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
        And the user should not see a notification banner
        And the user should see a confirmation page feedback link
        When the user clicks on "View / Print submitted application (opens in new tab)"
        Then a new tab should be opened at URL "print-submitted-application" and closed by the user

        # print-submitted-application
        Given the user navigates to "/example-grant-with-auth/print-submitted-application"
        Then the user should see heading "Example grant with auth application"
        And the page is analyzed for accessibility
        And the user should not see a notification banner
        Then the user should see the following submitted application details
            | Application number         | {REFERENCE NUMBER}                              |
            | Applicant details          |                                                 |
            | Title                      | {ANY}                                           |
            | First name                 | {ANY}                                           |
            | Middle name                | {ANY}                                           |
            | Last name                  | {ANY}                                           |
            | Business name              | {ANY}                                           |
            | Address 1                  | {ANY}                                           |
            | Address 2                  | {ANY}                                           |
            | City                       | {ANY}                                           |
            | Postcode                   | {ANY}                                           |
            | SBI number                 | {ANY}                                           |
            | Email address              | {ANY}                                           |
            | Submitted answers          |                                                 |
            | Yes or No                  | Yes                                             |
            | Country                    | Wales                                           |
            | Radio option               | Option one                                      |
            | Checkbox options           | Option two, Option three                        |
            | Enter amount               | 100000                                          |
            | Routing amount             | 50000                                           |
            | Date                       | {DATE IN A WEEK}                                |
            | Month and year             | August 2025                                     |
            | Select option              | Option three                                    |
            | Description                | Lorem ipsum                                     |
            | Email address              | test@example.com                                |
            | Telephone number           | 01234 567890                                    |
            | Address                    | 1 Example Street, Exampleton, EX1 1EX           |
            | Easting and northing       | 530000, 180000                                  |
            | OS grid reference          | ST 678 678                                      |
            | National Grid field number | NG 1234 5678                                    |
            | Latitude and longitude     | 51.51945, -0.127758                             |
            | Project name               | Test project                                    |
            | Project description        | Project description                             |
            | Project budget             | 50000                                           |
            | Land parcel                | SD6351-8781                                     |
        And should see the following configurable content
            | Configurable content                                                                                                                       |
            | This is an example of configurable content on the print page, defined via the configurablePrintContent property in the form YAML metadata. |
            | It supports HTML markup and the example-grant-with-auth placeholder.                                                                       |
        And should see button "Print this page"

        # validate GAS submission
        And the GAS submission should be valid against the "example-grant-with-auth" schema
