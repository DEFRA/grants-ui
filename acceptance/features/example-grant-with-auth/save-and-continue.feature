Feature: Reusable grants-ui functionality

    Scenario: Use the Save and Continue feature
        # clear Mongo state storage
        Given there is no application state stored for SBI "115460751" and grant "example-grant-with-auth"

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

        # validate Mongo state storage
        Then there should be application state stored for SBI "115460751" and grant "example-grant-with-auth"

        # reload the browser session and start again
        Given the user starts a new browser session
        And navigates to "/example-grant-with-auth/start"
        And completes any login process as CRN "1100960953"
        When the user clicks on "Start now"

        # yes-no-field
        Then the user should be at URL "yes-no-field"
        And should see "Yes" as the selected radio option
        When the user continues

        # autocomplete-field
        Then the user should be at URL "autocomplete-field"
        And should see "Wales" selected for AutocompleteField "Country"
