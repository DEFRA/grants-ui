Feature: Multiple Applications

    Scenario: Create multiple applications for the same SBI for a grant with the allowMultipleApplications setting enabled
        Given there is no application data for SBI "800000018" and grant "example-grant-with-multi-applications"

        # login
        Given the user navigates to "/example-grant-with-multi-applications"
        And logs in as CRN "9000000022"

        # start, first application
        Then the user should be at URL "start"
        And should see heading "Example Grant With Multiple Applications"
        When the user enters "Application 1" for "Application name"
        And continues

        # summary, first application
        Then the user should be at URL "summary"
        And should have an application reference in the URL

        # new browser session, first application resumes
        Given the user starts a new browser session
        And navigates to "/example-grant-with-multi-applications"
        And logs in as CRN "9000000022"
        Then the user should be at URL "summary"
        And should have application reference "{FIRST REFERENCE NUMBER}" in the URL
        And should see the following answers
            | QUESTION         | ANSWER        |
            | Application name | Application 1 |
        When the user continues

        # declaration, first application
        Then the user should be at URL "declaration"
        When the user confirms and sends

        # confirmation, first application
        Then the user should be at URL "confirmation"
        And should see heading "Application submitted"

        # new browser session, confirmation still shown for submitted single application
        Given the user starts a new browser session
        And navigates to "/example-grant-with-multi-applications"
        And logs in as CRN "9000000022"
        Then the user should be at URL "confirmation"
        And should have application reference "{FIRST REFERENCE NUMBER}" in the URL
        When the user clicks button "Start a new application"

        # start, second application
        Then the user should be at URL "start"
        And should have an application reference in the URL
        And should not have application reference "{FIRST REFERENCE NUMBER}" in the URL
        When the user enters "Application 2" for "Application name"
        And continues

        # summary, second application
        Then the user should be at URL "summary"

        # new browser session, now multiple applications shows the selector
        Given the user starts a new browser session
        And navigates to "/example-grant-with-multi-applications"
        And logs in as CRN "9000000022"
        Then the user should be at URL "applications"
        And should see the following applications
            | REFERENCE                 | STATUS    | ACTION               |
            | {SECOND REFERENCE NUMBER} | Draft     | Continue application |
            | {FIRST REFERENCE NUMBER}  | Submitted | View application     |
        When the user clicks button "Start a new application"

        # start, third application
        Then the user should be at URL "start"
        And should have an application reference in the URL
        And should not have application reference "{FIRST REFERENCE NUMBER}" in the URL
        And should not have application reference "{SECOND REFERENCE NUMBER}" in the URL
        When the user enters "Application 3" for "Application name"
        And continues

        # summary, third application
        Then the user should be at URL "summary"

        # applications
        Given the user navigates to "/example-grant-with-multi-applications/applications"
        Then the user should be at URL "applications"
        And should see the following applications
            | REFERENCE                 | STATUS    | ACTION               |
            | {THIRD REFERENCE NUMBER}  | Draft     | Continue application |
            | {SECOND REFERENCE NUMBER} | Draft     | Continue application |
            | {FIRST REFERENCE NUMBER}  | Submitted | View application     |
        When the user clicks "Continue application" for application "{THIRD REFERENCE NUMBER}"

        # return to summary, third application
        Then the user should be at URL "summary"
        And should have application reference "{THIRD REFERENCE NUMBER}" in the URL
        And should see the following answers
            | QUESTION         | ANSWER        |
            | Application name | Application 3 |
        When the user continues

        # declaration, third application
        Then the user should be at URL "declaration"
        When the user confirms and sends

        # confirmation, third application
        Then the user should be at URL "confirmation"
        And should see heading "Application submitted"
        And should have application reference "{THIRD REFERENCE NUMBER}" in the URL

        # new browser session, several applications show the selector
        Given the user starts a new browser session
        And navigates to "/example-grant-with-multi-applications"
        And logs in as CRN "9000000022"
        Then the user should be at URL "applications"
        And should see the following applications
            | REFERENCE                 | STATUS    | ACTION               |
            | {THIRD REFERENCE NUMBER}  | Submitted | View application     |
            | {SECOND REFERENCE NUMBER} | Draft     | Continue application |
            | {FIRST REFERENCE NUMBER}  | Submitted | View application     |

        # unknown application reference, denied and audited
        Given the user navigates to "/example-grant-with-multi-applications?ref=INVALID-REFERENCE-NUMBER"
        Then the user should see heading "Page not found"
        And an unauthorised audit event should be published for entity "application" and grant "example-grant-with-multi-applications" with CRN "9000000022" and SBI "800000018" and reason "unknown-reference" and reference number "INVALID-REFERENCE-NUMBER"
