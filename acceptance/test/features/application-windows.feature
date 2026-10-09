Feature: Application Windows

    Scenario: User cannot start a new application after the application window for a grant has closed
        Given there is no application data for SBI "106206183" and grant "example-grant-with-closed-window"

        # login
        Given the user navigates to "/example-grant-with-closed-window"
        And logs in as CRN "1100947604"

        # application-window-closed
        Then the user should be at URL "application-window-closed"
        And should see heading "The application window for this grant has closed"
        And the page is analyzed for accessibility
