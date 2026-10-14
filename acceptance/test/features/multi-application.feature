Feature: Multiple applications per business
    The example-grant-with-multi-applications grant lets one business hold several
    applications at once. Each application is identified by the ?ref= on the URL:
    a brand-new application starts without one, every page carries it once the
    application has been saved, and returning with no reference reopens the
    business's only application.

    Scenario: A new application gets its own reference on first save and is reopened on return
        Given there is no application data for SBI "115384462" and grant "example-grant-with-multi-applications"

        # start: nothing saved yet, so the URL names no application
        Given the user navigates to "/example-grant-with-multi-applications"
        And logs in as CRN "1100949763"
        Then the user should be at URL "start"
        And should see heading "Example Grant With Multiple Applications"
        And should see no application reference in the URL
        And the page is analyzed for accessibility
        When the user enters "North field" for "Application name"
        And continues

        # summary: the first save created the application and the URL now names it
        Then the user should be at URL "summary"
        And should see an application reference in the URL
        And should see the following answers
            | QUESTION         | ANSWER      |
            | Application name | North field |

        # returning with no reference reopens the business's only application where it left off
        Given the user starts a new browser session
        And navigates to "/example-grant-with-multi-applications"
        And logs in as CRN "1100949763"
        Then the user should be at URL "summary"
        And should be on the same application as before

        # declaration -> confirmation, the reference carried throughout
        When the user continues

        Then the user should be at URL "declaration"
        And should be on the same application as before
        When the user confirms and sends

        Then the user should be at URL "confirmation"
        And should see heading "Application submitted"
        And should be on the same application as before
        And should see an "EGMA" reference number for their application
        And the page is analyzed for accessibility
