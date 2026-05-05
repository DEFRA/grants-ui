Feature: Task Lists

    @ci
    Scenario: Complete a task list based grant application
        Given there is no application state stored for CRN "1100957579" and SBI "106604915" and grant "example-grant-with-task-list"

        # start
        Given the user navigates to "example-grant-with-task-list"
        And completes any login process as CRN "1100957579"
        Then the user should be at URL "start"
        Then the user should see heading "Apply for Example Grant with Task List"
        When the user clicks on "Start now"

        # eligibility-check
        Then the user should be at URL "eligibility-check"
        And should see heading "Example Eligibility Check"
        When the user selects "No"
        And continues

        # terminal-page
        Then the user should be at URL "terminal-page"
        And should see heading "Terminal Page Example"
        When the user navigates backward

        # eligibility-check
        Then the user should be at URL "eligibility-check"
        When the user selects "Yes"
        And continues

        # tasks
        Then the user should be at URL "tasks"
        And should see heading "Example Task List"
        And the page is analyzed for accessibility
        And should see the following task list with 0 of 6 tasks completed
            | Example section one              |                  |
            | Example multiple components task | Not started      |
            | Example single component task    | Cannot start yet |
            | Example section two              |                  |
            | Example compound component task  | Cannot start yet |
            | Example task with guidance       | Cannot start yet |
            | Example submit section           |                  |
            | Check your answers               | Cannot start yet |
            | Confirm and send                 | Cannot start yet |
        When the user selects task "Example multiple components task"

        # multiple-components-task-page
        Then the user should be at URL "multiple-components-task-page"
        And should see section title "Example section one"
        And should see heading "Example multiple components task"
        When the user enters the following
            | FIELD                  | VALUE       |
            | First name             | James       |
            | Middle name (optional) | Joseph      |
            | Last name              | Test-Farmer |
        And continues

        # single-component-task-page
        Then the user should be at URL "single-component-task-page"
        And should see section title "Example section one"
        And should see label heading "Example single component task"
        When the user enters "cl-defra-gae-test-applicant-email@equalexperts.com" for label heading "Example single component task"
        And continues

        # tasks
        Then the user should be back at URL "tasks"
        And should see the following task list with 2 of 6 tasks completed
            | Example section one              |                  |
            | Example multiple components task | Completed        |
            | Example single component task    | Completed        |
            | Example section two              |                  |
            | Example compound component task  | Not started      |
            | Example task with guidance       | Cannot start yet |
            | Example submit section           |                  |
            | Check your answers               | Cannot start yet |
            | Confirm and send                 | Cannot start yet |
        When the user selects task "Example compound component task"

        # compound-component-task-page
        Then the user should be at URL "compound-component-task-page"
        And should see section title "Example section two"
        And should see heading "Example compound component task"
        When the user enters the following
            | FIELD                     | VALUE            |
            | Address line 1            | Test Farm        |
            | Address line 2 (optional) | Cogenhoe         |
            | Town                      | Northampton      |
            | County (optional)         | Northamptonshire |
            | Postcode                  | NN7 1NN          |
        And continues

        # select-land-parcel
        Then the user should be at URL "select-land-parcel"
        When the user selects the following
            | SD6351 8781 |
        And continues

        # example-task-with-guidance
        Then the user should be at URL "example-task-with-guidance"
        And should see section title "Example section two"
        And should see heading "Example task with guidance"
        When the user enters "150000" for "Example number field"
        And continues

        # tasks
        Then the user should be back at URL "tasks"
        And should see the following task list with 4 of 6 tasks completed
            | Example section one              |                  |
            | Example multiple components task | Completed        |
            | Example single component task    | Completed        |
            | Example section two              |                  |
            | Example compound component task  | Completed        |
            | Example task with guidance       | Completed        |
            | Example submit section           |                  |
            | Check your answers               | Not started      |
            | Confirm and send                 | Cannot start yet |

        # revisit a task
        When the user selects task "Example task with guidance"

        # example-task-with-guidance
        Then the user should be at URL "example-task-with-guidance"
        When the user enters "200000" for "Example number field"
        And continues

        # tasks
        Then the user should be back at URL "tasks"
        And should see the following task list with 4 of 6 tasks completed
            | Example section one              |                  |
            | Example multiple components task | Completed        |
            | Example single component task    | Completed        |
            | Example section two              |                  |
            | Example compound component task  | Completed        |
            | Example task with guidance       | Completed        |
            | Example submit section           |                  |
            | Check your answers               | Not started      |
            | Confirm and send                 | Cannot start yet |
        When the user selects task "Check your answers"

        # summary
        Then the user should be at URL "summary"
        And should see heading "Check your answers"
        When the user continues

        # declaration
        Then the user should be at URL "declaration"
        And should see heading "Confirm and send"
        When the user confirms and sends

        # confirmation
        Then the user should be at URL "confirmation"
        And should see heading "Details submitted"
        And should see an "EGWT" reference number for their application
