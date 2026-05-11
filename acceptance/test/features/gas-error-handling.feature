Feature: GAS Error-Handling

   
    Scenario: Handle unexpected GAS errors with a generic response to the user
        Given there is no application state stored for CRN "1100988734" and SBI "115646286" and grant "example-grant-with-auth"
        And the next application submitted to GAS for SBI "115646286" will return HTTP 429 "Too many requests" for 3 requests

        # start
        Given the user navigates to "/example-grant-with-auth/start"
        And completes any login process as CRN "1100988734"
        Then the user should see heading "Example Grant"
        When the user clicks on "Start now"

        # check-details
        Then the user should be at URL "check-details"
        And should see heading "Check your details"
        When the user selects "Yes"
        And continues

        # yes-no-field
        Then the user should be at URL "yes-no-field"
        When the user selects "Yes"
        And continues

        # autocomplete-field
        Then the user should be at URL "autocomplete-field"
        When the user selects "England" for AutocompleteField "Country"
        And continues

        # radios-field
        Then the user should be at URL "radios-field"
        When the user selects "Option two"
        And continues

        # checkboxes-field
        Then the user should be at URL "checkboxes-field"
        When the user selects the following
            | Option two   |
        And continues

        # number-field-validation
        Then the user should be at URL "number-field-validation"
        When the user enters "100000" for "Enter amount"
        And continues

        # number-field-routing
        Then the user should be at URL "number-field-routing"
        When the user enters "50000" for "Enter amount that may divert the journey"
        And continues

        # date-parts-field
        Then the user should be at URL "date-parts-field"
        When the user enters the date in a week for DatePartsField "datePartsField"
        And continues

        # month-year-field
        Then the user should be at URL "month-year-field"
        When the user enters month "08" and year "2025" for MonthYearField "monthYearField"
        And continues

        # select-field
        Then the user should be at URL "select-field"
        When the user selects "Option two" for "Select option"
        And continues

        # multiline-text-field
        Then the user should be at URL "multiline-text-field"
        When the user enters "Lorem ipsum" for MultilineTextField "MultilineTextField Example"
        And continues

        # email-address-field
        Then the user should be at URL "email-address-field"
        When the user enters "test@example.com" for "EmailAddressField Example"
        And continues

        # telephone-number-field
        Then the user should be at URL "telephone-number-field"
        When the user enters "01234 567890" for "TelephoneNumberField Example"
        And continues

        # uk-address-field
        Then the user should be at URL "uk-address-field"
        When the user enters the following
            | FIELD          | VALUE            |
            | Address line 1 | 1 Example Street |
            | Town or city   | Exampleton       |
            | Postcode       | EX1 1EX          |
        And continues

        # location-components
        Then the user should be at URL "location-components"
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
        When the user continues

        # multi-field-form
        Then the user should be at URL "multi-field-form"
        When the user enters the following
            | FIELD               | VALUE                                       |
            | Project name        | Test project                                |
            | Project description | Project description for the journey runner. |
            | Project budget      | 50000                                       |
        And continues

        # repeat-page (item entry)
        Then the user should be at URL "repeat-page"
        When the user enters the following
            | FIELD     | VALUE               |
            | Item name | Repeat item example |
            | Amount    | 12000               |
        And continues

        # repeat-page (list summary)
        When the user continues

        # select-land-parcel
        Then the user should be at URL "select-land-parcel"
        When the user selects the following
            | SD6351 8781 |
        And continues

        # summary
        Then the user should be at URL "summary"
        When the user continues

        # declaration
        Then the user should be at URL "declaration"
        When the user confirms and sends

        # declaration with error
        Then the user should still be at URL "declaration"
        And should see heading "Something went wrong"
