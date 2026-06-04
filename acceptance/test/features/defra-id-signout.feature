Feature: Defra ID Signout

    Scenario: Sign out of Defra ID and sign in as another user
        Given there is no application state stored for CRN "1101003693" and SBI "115722586" and grant "example-grant-with-auth"
        And there is no application state stored for CRN "1100995056" and SBI "115680267" and grant "example-grant-with-auth"

        # login as user 1
        Given the user navigates to "/example-grant-with-auth"
        And logs in as CRN "1101003693"
        Then the user should see SBI "115722586" as the logged in organisation

        # start
        Then the user should be at URL "start"
        And should see heading "Example Grant"
        When the user clicks on "Start now"

        # check-details
        Then the user should be at URL "check-details"
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

        # sign-out and sign in as user 2
        Given the user signs out of Defra ID
        And navigates to "/example-grant-with-auth"
        And logs in as CRN "1100995056"
        Then the user should see SBI "115680267" as the logged in organisation

        # start
        Then the user should be at URL "start"
        And should see heading "Example Grant"
        When the user clicks on "Start now"

        # check-details
        Then the user should be at URL "check-details"
        When the user selects "Yes"
        And continues

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

        # sign-out and sign in again as user 1
        Given the user signs out of Defra ID
        And navigates to "/example-grant-with-auth"
        And logs in as CRN "1101003693"
        Then the user should see SBI "115722586" as the logged in organisation

        # radios-field, first unanswered question
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
