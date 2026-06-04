Feature: Task Lists Showing Questions

    Scenario: Complete a task list based grant application showing all questions
        Given there is no application state stored for CRN "1100957579" and SBI "106604915" and grant "example-grant-with-task-list"

        # start
        Given the user navigates to "example-grant-with-task-list"
        And logs in as CRN "1100957579"
        Then the user should be at URL "start"
        Then the user should see heading "Apply for Example Grant with Task List"
        And the page is analyzed for accessibility
        When the user clicks on "Start now"

        # eligibility-check
        Then the user should be at URL "eligibility-check"
        And should see heading "Example Eligibility Check"
        And the page is analyzed for accessibility
        When the user selects "No"
        And continues

        # terminal-page
        Then the user should be at URL "terminal-page"
        And should see heading "Terminal Page Example"
        And the page is analyzed for accessibility
        When the user navigates backward

        # eligibility-check
        Then the user should be at URL "eligibility-check"
        When the user selects "Yes"
        And continues

        # tasks
        Then the user should be at URL "tasks"
        And should see heading "Example Task List"
        And the page is analyzed for accessibility
        And should see the following task list with questions with 0 of 8 task pages completed
            | Example task one                 |                  |
            | Example multiple components      | Not started      |
            | Optional choice                  | Cannot start yet |
            | Single component                 | Cannot start yet |
            | Example task two                 |                  |
            | Compound component               | Cannot start yet |
            | Land parcels                     | Cannot start yet |
            | Number with guidance             | Cannot start yet |
            | Example check and submit task    |                  |
            | Check your answers               | Cannot start yet |
            | Confirm and send                 | Cannot start yet |
        When the user selects task "Example multiple components"

        # multiple-components-task-page
        Then the user should be at URL "multiple-components-task-page"
        And should see task title "Example task one"
        And should see heading "Example multiple components"
        And the page is analyzed for accessibility
        When the user enters the following
            | FIELD                  | VALUE       |
            | First name             | James       |
            | Middle name (optional) | Joseph      |
            | Last name              | Test-Farmer |
        And continues

        # optional-choice-task-page
        Then the user should be at URL "optional-choice-task-page"
        And should see task title "Example task one"
        And should see heading "Example optional choice"
        And the page is analyzed for accessibility
        When the user selects "No"
        And continues

        # single-component-task-page
        Then the user should be at URL "single-component-task-page"
        And should see task title "Example task one"
        And should see label heading "Example single component"
        And the page is analyzed for accessibility
        When the user enters "cl-defra-gae-test-applicant-email@equalexperts.com" for label heading "Example single component"
        And continues

        # tasks
        Then the user should be back at URL "tasks"
        And the page is analyzed for accessibility
        And should see the following task list with questions with 3 of 8 task pages completed
          | Example task one                 |                  |
          | Example multiple components      | Completed        |
          | Optional choice                  | Completed        |
          | Single component                 | Completed        |
          | Example task two                 |                  |
          | Compound component               | Not started      |
          | Land parcels                     | Cannot start yet |
          | Number with guidance             | Cannot start yet |
          | Example check and submit task    |                  |
          | Check your answers               | Cannot start yet |
          | Confirm and send                 | Cannot start yet |
        When the user selects task "Compound component"

        # compound-component-task-page
        Then the user should be at URL "compound-component-task-page"
        And should see task title "Example task two"
        And should see heading "Example compound component"
        And the page is analyzed for accessibility
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
        And the page is analyzed for accessibility
        When the user selects the following
            | SD6351 8781 |
        And continues

        # example-task-with-guidance
        Then the user should be at URL "example-task-with-guidance"
        And should see task title "Example task two"
        And should see heading "Example with guidance"
        And the page is analyzed for accessibility
        When the user enters "150000" for "Example number field"
        And continues

        # tasks
        Then the user should be back at URL "tasks"
        And the page is analyzed for accessibility
        And should see the following task list with questions with 6 of 8 task pages completed
          | Example task one                 |                  |
          | Example multiple components      | Completed        |
          | Optional choice                  | Completed        |
          | Single component                 | Completed        |
          | Example task two                 |                  |
          | Compound component               | Completed        |
          | Land parcels                     | Completed        |
          | Number with guidance             | Completed        |
          | Example check and submit task    |                  |
          | Check your answers               | Not started      |
          | Confirm and send                 | Cannot start yet |

        # revisit a task
        When the user selects task "Number with guidance"

        # example-task-with-guidance
        Then the user should be at URL "example-task-with-guidance"
        When the user enters "200000" for "Example number field"
        And continues

        # tasks
        Then the user should be back at URL "tasks"
        And the page is analyzed for accessibility
        And should see the following task list with questions with 6 of 8 task pages completed
        | Example task one                 |                  |
        | Example multiple components      | Completed        |
        | Optional choice                  | Completed        |
        | Single component                 | Completed        |
        | Example task two                 |                  |
        | Compound component               | Completed        |
        | Land parcels                     | Completed        |
        | Number with guidance             | Completed        |
        | Example check and submit task    |                  |
        | Check your answers               | Not started      |
        | Confirm and send                 | Cannot start yet |
        When the user selects task "Check your answers"

        # summary
        Then the user should be at URL "summary"
        And should see heading "Check your answers"
        And the page is analyzed for accessibility
        When the user continues

        # declaration
        Then the user should be at URL "declaration"
        And should see heading "Confirm and send"
        And the page is analyzed for accessibility
        When the user confirms and sends

        # confirmation
        Then the user should be at URL "confirmation"
        And should see heading "Details submitted"
        And the page is analyzed for accessibility
        And should see an "EGWT" reference number for their application
