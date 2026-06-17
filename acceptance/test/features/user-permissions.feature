Feature: User Permissions

    SBI 106238911 users and permissions:
        CRN 1062311181 - SUBMIT permissions
        CRN 1062311182 - AMEND permissions
        CRN 1062311183 - VIEW permissions
        CRN 1062311184 - No permissions

    Scenario: Complete a grant application with multiple users with different permissions
        # attempt to unlock the application in the order it could have been left by the test
        Given there is no application lock for CRN "1062311184" and SBI "106238911" and grant "example-grant-with-auth"
        And there is no application lock for CRN "1062311183" and SBI "106238911" and grant "example-grant-with-auth"
        And there is no application lock for CRN "1062311181" and SBI "106238911" and grant "example-grant-with-auth"
        And there is no application lock for CRN "1062311182" and SBI "106238911" and grant "example-grant-with-auth"

        # delete any state
        And there is no application state stored for CRN "1062311181" and SBI "106238911" and grant "example-grant-with-auth"

        # unlock from CRN 1062311181 (deleting state above acquires a lock as a side effect)
        Given there is no application lock for CRN "1062311181" and SBI "106238911" and grant "example-grant-with-auth"

        # attempt to start as CRN 1062311183 with VIEW permission only, before any application exists
        Given the user navigates to "/example-grant-with-auth"
        And logs in as CRN "1062311183"
        Then the user should see heading "You do not have permission to view this page"

        # unlock from CRN 1062311183
        Given there is no application lock for CRN "1062311183" and SBI "106238911" and grant "example-grant-with-auth"

        # log in as CRN 1062311182 with AMEND permission
        Given the user starts a new browser session
        And navigates to "/example-grant-with-auth"
        And logs in as CRN "1062311182"
        Then the user should see SBI "106238911" as the logged in organisation
        And the user should see heading "Example Grant"
        When the user clicks on "Start now"

        # check-details
        Then the user should be at URL "check-details"
        And should see heading "Check your details"
        When the user selects "Yes"
        And continues

        # yes-no-field
        Then the user should be at URL "yes-no-field"
        And should see heading "YesNoField Example"
        When the user selects "Yes"
        And continues

        # autocomplete-field
        Then the user should be at URL "autocomplete-field"
        And should see heading "AutocompleteField Example"
        When the user selects "England" for AutocompleteField "Country"
        And continues

        # radios-field
        Then the user should be at URL "radios-field"
        And should see heading "RadiosField Example"
        When the user selects "Option one"
        And continues

        # conditional-page
        Then the user should be at URL "conditional-page"
        And should see heading "Conditional Page Example"
        When the user continues

        # checkboxes-field
        Then the user should be at URL "checkboxes-field"
        And should see heading "CheckboxesField Example"
        When the user selects the following
            | Option two   |
            | Option three |
        And continues

        # checkboxes-follow-up (conditional on Option three)
        Then the user should be at URL "checkboxes-follow-up"
        And should see heading "Checkbox follow-up"
        When the user continues

        # number-field-validation
        Then the user should be at URL "number-field-validation"
        And should see heading "NumberField with validation"
        When the user enters "100000" for "Enter amount"
        And continues

        # number-field-routing
        Then the user should be at URL "number-field-routing"
        And should see heading "NumberField with conditional routing"
        When the user enters "50000" for "Enter amount that may divert the journey"
        And continues

        # date-parts-field
        Then the user should be at URL "date-parts-field"
        And should see heading "DatePartsField Example"
        When the user enters the date in a week for DatePartsField "datePartsField"
        And continues

        # month-year-field
        Then the user should be at URL "month-year-field"
        And should see heading "MonthYearField Example"
        When the user enters month "08" and year "2025" for MonthYearField "monthYearField"
        And continues

        # select-field
        Then the user should be at URL "select-field"
        And should see heading "SelectField Example"
        When the user selects "Option three" for "Select option"
        And continues

        # multiline-text-field
        Then the user should be at URL "multiline-text-field"
        And should see label heading "MultilineTextField Example"
        When the user enters "Lorem ipsum" for MultilineTextField "MultilineTextField Example"
        And continues

        # email-address-field
        Then the user should be at URL "email-address-field"
        And should see label heading "EmailAddressField Example"
        When the user enters "test@example.com" for "EmailAddressField Example"
        And continues

        # telephone-number-field
        Then the user should be at URL "telephone-number-field"
        And should see label heading "TelephoneNumberField Example"
        When the user enters "01234 567890" for "TelephoneNumberField Example"
        And continues

        # uk-address-field
        Then the user should be at URL "uk-address-field"
        And should see heading "UkAddressField Example"
        When the user enters the following
            | FIELD          | VALUE            |
            | Address line 1 | 1 Example Street |
            | Town or city   | Exampleton       |
            | Postcode       | EX1 1EX          |
        And continues

        # location-components
        Then the user should be at URL "location-components"
        And should see heading "Location components Example"
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
        When the user continues

        # multi-field-form
        Then the user should be at URL "multi-field-form"
        And should see heading "Multi Field Form Example"
        When the user enters the following
            | FIELD               | VALUE               |
            | Project name        | Test project        |
            | Project description | Project description |
            | Project budget      | 50000               |
        And continues

        # repeat-page (item entry)
        Then the user should be at URL "repeat-page"
        And should see heading "RepeatPage Example"
        When the user enters the following
            | FIELD     | VALUE               |
            | Item name | Repeat item example |
            | Amount    | 12000               |
        And continues

        # repeat-page (list summary)
        Then the user should be at URL "repeat-page"
        And should see heading "You have added 1 answer"
        When the user continues

        # select-land-parcel
        Then the user should be at URL "select-land-parcel"
        And should see heading "Select all the eligible land parcels for the location of your woodland"
        When the user selects the following
            | SD7946 0155 |
        And continues

        # summary
        Then the user should be at URL "summary"
        And should see heading "Check your answers"
        When the user continues

        # cannot-submit as logged-in user has AMEND but not SUBMIT permission
        Then the user should be at URL "cannot-submit"
        And should see heading "You cannot submit this application"

        # unlock from CRN 1062311182
        Given there is no application lock for CRN "1062311182" and SBI "106238911" and grant "example-grant-with-auth"

        # attempt to view as CRN 1062311183 with VIEW permission only, while the application is still editable and not yet submitted
        Given the user starts a new browser session
        And navigates to "/example-grant-with-auth"
        And logs in as CRN "1062311183"
        Then the user should see heading "You do not have permission to view this page"

        # unlock from CRN 1062311183
        Given there is no application lock for CRN "1062311183" and SBI "106238911" and grant "example-grant-with-auth"

        # log in as CRN 1062311181 with SUBMIT permission
        Given the user starts a new browser session
        And navigates to "/example-grant-with-auth"
        And logs in as CRN "1062311181"

        # summary
        Then the user should be at URL "summary"
        And should see heading "Check your answers"
        When the user continues

        # declaration
        Then the user should be at URL "declaration"
        And should see heading "Confirm and send"
        When the user confirms and sends

        # confirmation
        Then the user should be at URL "confirmation"
        And should see heading "Details submitted"
        And should see an "EGWA" reference number for their application

        # GAS
        Then the reference number along with SBI "106238911" and CRN "1062311181" should be submitted to GAS

        # unlock from CRN 1062311181
        Given there is no application lock for CRN "1062311181" and SBI "106238911" and grant "example-grant-with-auth"

        # log in as CRN 1062311183 with VIEW permission
        Given the user starts a new browser session
        And navigates to "/example-grant-with-auth"
        And logs in as CRN "1062311183"

        # confirmation and print-submitted-application should be accessible to the VIEW user
        Then the user should be at URL "confirmation"
        And should see heading "Details submitted"
        When the user clicks on "View / Print submitted application (opens in new tab)"
        Then a new tab should be opened at URL "print-submitted-application" and closed by the user

        # unlock from CRN 1062311183
        Given there is no application lock for CRN "1062311183" and SBI "106238911" and grant "example-grant-with-auth"

        # attempt to view submitted application as CRN 1062311184 with no permissions
        Given the user starts a new browser session
        And navigates to "/example-grant-with-auth"
        And logs in as CRN "1062311184"
        Then the user should see heading "You do not have permission to view this page"

        # unlock from CRN 1062311184
        Given there is no application lock for CRN "1062311184" and SBI "106238911" and grant "example-grant-with-auth"
