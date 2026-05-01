Feature: Save and Continue

    @ci
    Scenario: Use the Save and Continue feature, checking which pages are returned to when resuming a journey
        # clear Mongo state storage
        Given there is no application state stored for CRN "1100960953" and SBI "115460751" and grant "example-grant-with-auth"

        # start
        Given the user navigates to "/example-grant-with-auth/start"
        And completes any login process as CRN "1100960953"
        Then the user should see heading "Example Grant"
        When the user clicks on "Start now"

        # yes-no-field
        Then the user should be at URL "yes-no-field"
        When the user selects "Yes"
        And continues

        # autocomplete-field
        Then the user should be at URL "autocomplete-field"
        When the user selects "Wales" for AutocompleteField "Country"
        And continues

        # radios-field
        Then the user should be at URL "radios-field"

        # validate Mongo state storage
        Then there should be application state stored for CRN "1100960953" and SBI "115460751" and grant "example-grant-with-auth"

        # reload the browser session and go to /start
        Given the user starts a new browser session
        And navigates to "/example-grant-with-auth/start"
        And completes any login process as CRN "1100960953"

        # radios-field, should return to first unanswered question on resumption of uncompleted journey
        Then the user should be at URL "radios-field"
        When the user navigates backward
        Then the user should be at URL "autocomplete-field"
        When the user navigates backward

        # yes-no-field, check previously entered answer
        Then the user should be at URL "yes-no-field"
        And should see "Yes" as the selected radio option
        When the user continues

        # autocomplete-field, check previously entered answer
        Then the user should be at URL "autocomplete-field"
        And should see "Wales" selected for AutocompleteField "Country"
        When the user continues

        # radios-field
        Then the user should be at URL "radios-field"
        When the user selects "Option two"
        And continues

        # checkboxes-field
        Then the user should be at URL "checkboxes-field"
        When the user selects the following
            | Option two   |
        And continues

        # number-field
        Then the user should be at URL "number-field"
        When the user enters "100000" for "Enter amount"
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
        When the user selects "Option three" for "Select option"
        And continues

        # multiline-text-field
        Then the user should be at URL "multiline-text-field"
        When the user enters "Lorem ipsum" for MultilineTextField "MultilineTextField Example"
        And continues

        # select-land-parcel
        Then the user should be at URL "select-land-parcel"
        When the user selects the following
            | SD6351 8781 |
        And continues

        # multi-field-form
        Then the user should be at URL "multi-field-form"
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
        When the user selects "Yes"
        And continues

        # summary
        Then the user should be at URL "summary"

        # reload the browser session and go to /start
        Given the user starts a new browser session
        And navigates to "/example-grant-with-auth/start"
        And completes any login process as CRN "1100960953"

        # summary, should return to summary with all previous answers on resumption of completed but unsubmitted journey
        Then the user should be at URL "summary"
        And should see the following answers
            | QUESTION            | ANSWER                                             |
            | Yes or No           | Yes                                                |
            | Country             | Wales                                              |
            | Radio option        | Option two                                         |
            | Checkbox options    | Option two                                         |
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
        When the user confirms and sends
        
        # confirmation
        Then the user should be at URL "confirmation"
        And should see heading "Details submitted"
        And should see an "EGWA" reference number for their application
    