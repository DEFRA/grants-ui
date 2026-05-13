Feature: Clear Application State

    @runme
    Scenario: Clicking the 'Clear application state' footer link in non-prod environments clears saved journey answers
        Given there is no application state stored for CRN "1101006005" and SBI "106834980" and grant "example-grant-with-auth"

        # start
        Given the user navigates to "/example-grant-with-auth"
        And completes any login process as CRN "1101006005"
        Then the user should be at URL "start"
        When the user clicks on "Start now"

        # check-details
        Then the user should be at URL "check-details"
        When the user selects "Yes"
        And continues

        # yes-no-field, state is now stored
        Then the user should be at URL "yes-no-field"

        # click the footer link to clear state
        When the user clicks on "Clear application state"

        # should be redirected back to start, ensures action has occurred
        Then the user should be at URL "start"

        # new browser session
        Given the user starts a new browser session
        And navigates to "/example-grant-with-auth"
        And completes any login process as CRN "1101006005"

        # start
        Then the user should be at URL "start"
        When the user clicks on "Start now"
        
        # check-details
        Then the user should be at URL "check-details"
        And no option should be selected
