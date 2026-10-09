Feature: Multiple grant applications

    Scenario: Create a second draft and resume the first from the application selector
        Given there is no application data for SBI "115664358" and grant "example-grant-with-auth"
        And the user navigates to "/example-grant-with-auth"
        And logs in as CRN "1100995048"
        Then the user should be at URL "start"
        When the user clicks on "Start now"
        And the user selects "Yes"
        And continues
        Then the user should be at URL "yes-no-field"

        When the user navigates to "/example-grant-with-auth"
        Then the user should be at URL "yes-no-field"

        When the user navigates to "/example-grant-with-auth/applications"
        Then the application selector should contain 1 distinct draft reference
        When the user clicks button "Start a new application"
        Then the user should be at URL "start"

        When the user navigates to "/example-grant-with-auth"
        Then the user should be at URL "applications"
        And the application selector should contain 2 distinct draft references
        When the user continues the oldest draft application
        Then the user should be at URL "yes-no-field"
