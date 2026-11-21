Feature: Task Lists Hiding Questions
@runme
    Scenario: Complete a task list based grant application hiding all questions
        Given there is no application data for SBI "800000012" and grant "example-grant-with-task-list-hide-questions"

        # start
        Given the user navigates to "example-grant-with-task-list-hide-questions"
        And logs in as CRN "9000000014"
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
        And should see the following task list without questions with 0 of 9 task pages completed
            | Example task one              | Not started      |
            | Example task two              | Cannot start yet |
            | Example check and submit task | Cannot start yet |
        When the user selects task "Example task one"

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

        # optional-choice-task-page - back out to task list
        Then the user should be at URL "optional-choice-task-page"
        And should see task title "Example task one"
        And should see heading "Example optional choice"
        And the page is analyzed for accessibility
        When the user navigates backward

        # multiple-components-task-page - back to task list
        Then the user should be at URL "multiple-components-task-page"
        When the user clicks on "Back to task list"

        # tasks - task one in progress
        Then the user should be back at URL "tasks"
        And the page is analyzed for accessibility
        And should see the following task list without questions with 1 of 9 task pages completed
            | Example task one              | In progress      |
            | Example task two              | Cannot start yet |
            | Example check and submit task | Cannot start yet |
        When the user selects task "Example task one"

        # optional-choice-task-page - resume task one
        Then the user should be at URL "optional-choice-task-page"
        And should see heading "Example optional choice"
        When the user selects "No"
        And continues

        # single-component-task-page
        Then the user should be at URL "single-component-task-page"
        And should see task title "Example task one"
        And should see label heading "Example single component"
        And the page is analyzed for accessibility
        When the user enters "cl-defra-gae-test-applicant-email@equalexperts.com" for label heading "Example single component"
        And continues

        # repeat-page (item entry)
        Then the user should be at URL "repeat-page"
        And should see task title "Example task one: Repeat Item 1"
        And should see heading "RepeatPage Example"
        And the page is analyzed for accessibility
        When the user enters the following
            | FIELD  | VALUE               |
            | Name   | Repeat item example |
            | Amount | 12000               |
        And continues

        # repeat-page (list summary)
        Then the user should be at URL "repeat-page/summary"
        And should see task title "Example task one"
        And should see heading "You have added 1 repeat item"
        And the page is analyzed for accessibility
        When the user continues

        # tasks
        Then the user should be back at URL "tasks"
        And the page is analyzed for accessibility
        And should see the following task list without questions with 4 of 9 task pages completed
          | Example task one              | Completed        |
          | Example task two              | Not started      |
          | Example check and submit task | Cannot start yet |
        When the user selects task "Example task two"

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

        # select-land-parcel - back out to task list
        Then the user should be at URL "select-land-parcel"
        And should see task title "Example task two"
        And the page is analyzed for accessibility
        When the user navigates backward

        # compound-component-task-page - back to task list
        Then the user should be at URL "compound-component-task-page"
        When the user clicks on "Back to task list"

        # tasks - task one completed, task two in progress, go into task one to change optional choice
        Then the user should be back at URL "tasks"
        And the page is analyzed for accessibility
        And should see the following task list without questions with 5 of 9 task pages completed
          | Example task one              | Completed        |
          | Example task two              | In progress      |
          | Example check and submit task | Cannot start yet |
        When the user selects task "Example task one"

        # multiple-components-task-page
        Then the user should be at URL "multiple-components-task-page"
        When the user continues

        # optional-choice-task-page - change answer to Yes
        Then the user should be at URL "optional-choice-task-page"
        When the user selects "Yes"
        And continues

        # conditional-question - back out to task list
        Then the user should be at URL "conditional-question"
        And should see task title "Example task one"
        When the user navigates backward

        # optional-choice-task-page
        Then the user should be at URL "optional-choice-task-page"
        When the user navigates backward

        # multiple-components-task-page
        Then the user should be at URL "multiple-components-task-page"
        When the user clicks on "Back to task list"

        # tasks - task one in progress, task two on hold
        Then the user should be back at URL "tasks"
        And the page is analyzed for accessibility
        And should see the following task list without questions with 5 of 10 task pages completed
          | Example task one              | In progress      |
          | Example task two              | On hold          |
          | Example check and submit task | Cannot start yet |
        When the user selects task "Example task one"

        # optional-choice-task-page - complete task one
        Then the user should be at URL "conditional-question"
        And should see task title "Example task one"
        And should see heading "Example conditional question"
        When the user selects "No"
        And continues

        # single-component-task-page
        Then the user should be at URL "single-component-task-page"
        And should see label heading "Example single component"
        When the user continues

        # repeat-page (list summary) - retain the existing item
        Then the user should be at URL "repeat-page/summary"
        And should see heading "You have added 1 repeat item"
        When the user continues

        # tasks - task one completed again, task two back to in progress, complete task two
        Then the user should be back at URL "tasks"
        And the page is analyzed for accessibility
        And should see the following task list without questions with 6 of 10 task pages completed
          | Example task one              | Completed        |
          | Example task two              | In progress      |
          | Example check and submit task | Cannot start yet |
        When the user selects task "Example task two"

        # select-land-parcel - complete task two
        Then the user should be at URL "select-land-parcel"
        And should see task title "Example task two"
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
        And should see the following task list without questions with 8 of 10 task pages completed
          | Example task one              | Completed   |
          | Example task two              | Completed   |
          | Example check and submit task | Not started |
        When the user selects task "Example check and submit task"

        # summary
        Then the user should be at URL "summary"
        And should see task title "Example check and submit task"
        And should see heading "Check your answers"
        And the page is analyzed for accessibility
        And should see the following answers
            | QUESTION                                  | ANSWER                                             |
            | First name                                | James                                              |
            | Middle name (optional)                    | Joseph                                             |
            | Last name                                 | Test-Farmer                                        |
            | Optional choice                           | Yes                                                |
            | Conditional question                      | No                                                 |
            | Single component                          | cl-defra-gae-test-applicant-email@equalexperts.com |
            | Compound component                        | Test Farm                                          |
            |                                           | Cogenhoe                                           |
            |                                           | Northampton                                        |
            |                                           | Northamptonshire                                   |
            |                                           | NN7 1NN                                            |
            | Land parcels                              | SD6351-8781                                        |
            | Number with guidance                      | 150,000.00                                         |
            | Are you eligible to apply for this grant? | Yes                                                |
            | First item amount                         | £12,000.00                                         |
            | Example number field                      | 150,000                                            |
        And should see the following summary cards
            | CARD          | QUESTION  | ANSWER              |
            | Repeat Item 1 | Item name | Repeat item example |
            |               | Amount    | £12,000.00          |
        When the user continues

        # declaration
        Then the user should be at URL "declaration"
        And should see task title "Example check and submit task"
        And should see heading "Confirm and send"
        And the page is analyzed for accessibility
        When the user confirms and sends

        # confirmation
        Then the user should be at URL "confirmation"
        And should see heading "Details submitted"
        And the page is analyzed for accessibility
        And should see an "EGWTHQ" reference number for their application
        When the user clicks on "View / Print submitted application (opens in new tab)"
        Then a new tab should be opened at URL "print-submitted-application" and closed by the user

        # print-submitted-application
        Given the user navigates to "/example-grant-with-task-list-hide-questions/print-submitted-application"
        Then the page is analyzed for accessibility
        And the user should see the following submitted application details
            | Application number   | {REFERENCE NUMBER} |
            | Submitted answers    |                    |
            | Number with guidance | 150,000.00         |
            | First item amount    | £12,000.00         |
            | Example number field | 150,000            |
