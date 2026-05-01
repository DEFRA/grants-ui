Feature: SBI-Driven Applications

    @ci
    Scenario: Begin a journey as an applicant, continue as an agent and complete the application as the applicant, checking application locking is enforced along the way
        Given there is no application lock for CRN "1109990002" and SBI "119000002" and grant "example-grant-with-auth"
        And there is no application lock for CRN "1109990001" and SBI "119000002" and grant "example-grant-with-auth"
        And there is no application state stored for CRN "1109990002" and SBI "119000002" and grant "example-grant-with-auth"
        
        # login as applicant farmer
        Given the user navigates to "/example-grant-with-auth/start"
        And completes any login process as CRN "1109990002"

        # start
        Then the user should be at URL "start"
        And should see heading "Example Grant"
        When the user clicks on "Start now"

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

        # reload the browser session and login again as the agent, selecting the same SBI
        Given the user starts a new browser session
        And navigates to "/example-grant-with-auth/start"
        And completes any login process as CRN "1109990001"
        And selects SBI "119000002"
        And continues

        # application still locked by first user
        Then the user should see heading "Another applicant is currently editing this application. You cannot access it until their session ends."

        # unlock the application using the admin endpoint
        Given there is no application lock for CRN "1109990002" and SBI "119000002" and grant "example-grant-with-auth"
        And the user navigates to "/example-grant-with-auth/start"

        # radios-field, now the second user has access to the first unanswered question
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
        And should see "England" selected for AutocompleteField "Country"
        When the user continues

        # radios-field
        Then the user should be at URL "radios-field"
        When the user selects "Option two"
        And continues

        # second user logs out, releasing the application lock
        Given the user signs out of Defra ID

        # first user logs back in
        Given the user starts a new browser session
        And navigates to "/example-grant-with-auth/start"
        And completes any login process as CRN "1109990002"

        # checkboxes-field, first user is at the first unanswered question
        Then the user should be at URL "checkboxes-field"
        When the user selects the following
            | Option two   |
            | Option three |
        And continues

        # number-field
        Then the user should be at URL "number-field"
        When the user enters "150000" for "Enter amount"
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
            | FIELD                     | VALUE                                          |
            | Name                      | John Test-Agent                                |
            | Email address             | cl-defra-gae-test-agent-email@equalexperts.com |
            | Mobile number             | 07777 123456                                   |
            | Address line 1            | Test Farm                                      |
            | Address line 2 (optional) | Cogenhoe                                       |
            | Town                      | Northampton                                    |
            | County (optional)         | Northamptonshire                               |
            | Postcode                  | NN7 1NN                                        |
        And continues

        # check-details
        Then the user should be at URL "check-details"
        And should see heading "Check your details"
        When the user selects "Yes"
        And continues

        # summary
        Then the user should be at URL "summary"
        And should see the following answers
            | QUESTION            | ANSWER                                         |
            | Yes or No           | Yes                                            |
            | Country             | England                                        |
            | Radio option        | Option two                                     |
            | Checkbox options    | Option two                                     |
            |                     | Option three                                   |
            | Enter amount        | 150000                                         |
            | Date                | {DATE IN A WEEK}                               |
            | Month and year      | August 2025                                    |
            | Select option       | Option three                                   |
            | Description         | Lorem ipsum                                    |
            | Select land parcels | SD6351-8781                                    |
            | Name                | John Test-Agent                                |
            | Email address       | cl-defra-gae-test-agent-email@equalexperts.com |
            | Mobile number       | 07777 123456                                   |
            | Address             | Test Farm                                      |
            |                     | Cogenhoe                                       |
            |                     | Northampton                                    |
            |                     | Northamptonshire                               |
            |                     | NN7 1NN                                        |
        And continues

        # declaration
        Then the user should be at URL "declaration"
        When the user confirms and sends

        # confirmation
        Then the user should be at URL "confirmation"
        And should see heading "Details submitted"
        And should see an "EGWA" reference number for their application

        # GAS
        Then the reference number along with SBI "119000002" and CRN "1109990002" should be submitted to GAS
