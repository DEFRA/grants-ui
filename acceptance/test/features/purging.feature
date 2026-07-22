Feature: Purging

    Scenario: A user whose application has been purged sees the application deleted page
        Given there is no application data for SBI "300000002" and grant "example-grant-with-auth"

        # start
        Given the user navigates to "/example-grant-with-auth"
        And logs in as CRN "1300000002"
        Then the user should see heading "Example Grant"
        When the user clicks on "Start now"

        # check-details
        Then the user should be at URL "check-details"
        When the user selects "Yes"
        And continues

        # yes-no-field
        Then the user should be at URL "yes-no-field"

        # directly manipulate the backend's stored state to simulate the application having been purged
        Given the application status in the backend for CRN "1300000002" and SBI "300000002" and grant "example-grant-with-auth" is now "PURGED"

        # reload the browser session and log back in
        Given the user starts a new browser session
        And navigates to "/example-grant-with-auth"
        And logs in as CRN "1300000002"

        # the user is redirected to the application deleted page
        Then the user should be at URL "application-deleted"
        And should see heading "Your draft application has been deleted"

        # reloading the browser session and logging back in again should still show the deleted warning
        Given the user starts a new browser session
        And navigates to "/example-grant-with-auth"
        And logs in as CRN "1300000002"

        Then the user should be at URL "application-deleted"
        And should see heading "Your draft application has been deleted"

        # clicking the button starts a fresh application
        When the user clicks on "Start a new application"

        # start
        Then the user should see heading "Example Grant"
        When the user clicks on "Start now"

        # check-details
        Then the user should be at URL "check-details"
        When the user selects "Yes"
        And continues

        # yes-no-field
        Then the user should be at URL "yes-no-field"
