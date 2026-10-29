Feature: Allowlisting

    Scenario: Attempt to access an allowlist-enabled journey with allowlisted and non-allowlisted SBIs
        Given there is no application data for SBI "800000017" and grant "example-whitelist"
        And there is no application data for SBI "800000008" and grant "example-whitelist"

        # login
        Given the user navigates to "/example-whitelist"
        And logs in as CRN "9000000021"

        # start
        Then the user should be at URL "start"
        And should see heading "Example Whitelist"
        And an authorised audit event should be published for entity "application" and grant "example-whitelist" with CRN "9000000021" and SBI "800000017"

        # home
        Given the user navigates to "/home"
        Then the user should see "Example Whitelist" in their available grants
        And the page is analyzed for accessibility

        # reload the browser session and login again
        Given the user starts a new browser session
        And navigates to "/example-whitelist"
        And logs in as CRN "9000000016"

        # journey-unauthorised
        Then the user should be at URL "journey-unauthorised"
        And should see heading "You are not able to complete this grant application"
        And the page is analyzed for accessibility
        And an unauthorised audit event should be published for entity "application" and grant "example-whitelist" with CRN "9000000016" and SBI "800000008" and reason "allowlist"

        # home
        Given the user navigates to "/home"
        Then the user should not see "Example Whitelist" in their available grants
