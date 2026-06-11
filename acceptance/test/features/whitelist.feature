Feature: Whitelisting

    Scenario: Attempt to access a whitelist-enabled journey with whitelisted and non-whitelisted CRNs and SBIs 
        Given there is no application state stored for CRN "1100953760" and SBI "108633093" and grant "example-whitelist"
        And there is no application state stored for CRN "1100955380" and SBI "115425713" and grant "example-whitelist"

        # login
        Given the user navigates to "/example-whitelist"
        And logs in as CRN "1100953760"

        # start
        Then the user should be at URL "start"
        And should see heading "Example Whitelist"

        # reload the browser session and login again
        Given the user starts a new browser session
        And navigates to "/example-whitelist"
        And logs in as CRN "1100955380"

        # journey-unauthorised
        Then the user should be at URL "journey-unauthorised"
        And should see heading "You are not able to complete this grant application"
