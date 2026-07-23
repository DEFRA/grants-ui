Feature: Allowlisting

    Scenario: Attempt to access an allowlist-enabled journey with allowlisted and non-allowlisted CRNs and SBIs
        Given there is no application data for SBI "108633093" and grant "example-whitelist"
        And there is no application data for SBI "115425713" and grant "example-whitelist"

        # login
        Given the user navigates to "/example-whitelist"
        And logs in as CRN "1100953760"

        # start
        Then the user should be at URL "start"
        And should see heading "Example Whitelist"
        And an authorised audit event should be published for grant "example-whitelist" with CRN "1100953760" and SBI "108633093"

        # reload the browser session and login again
        Given the user starts a new browser session
        And navigates to "/example-whitelist"
        And logs in as CRN "1100955380"

        # journey-unauthorised
        Then the user should be at URL "journey-unauthorised"
        And should see heading "You are not able to complete this grant application"
        And an unauthorised audit event should be published for grant "example-whitelist" with CRN "1100955380" and SBI "115425713" and reason "allowlist"
