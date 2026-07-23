Feature: Pigs Might Fly

    Scenario: Application is successfully submitted through the pigs-might-fly journey
        Given there is no application data for SBI "106498131" and grant "pigs-might-fly"

        # start
        Given the user navigates to "/pigs-might-fly"
        And logs in as CRN "1100946268"
        Then the user should see heading "Check if you can apply for a Pigs Might Fly Grant"
        When the user clicks on "Start now"

        # are-you-pig-farmer
        Then the user should be at URL "are-you-pig-farmer"
        And should see heading "Are you a pig farmer?"
        When the user selects "Yes"
        And continues

        # pig-count
        Then the user should be at URL "pig-count"
        And should see heading "How many pigs do you have?"
        When the user enters "100" for "Enter number of pigs"
        And continues

        # what-type-of-pigs
        Then the user should be at URL "what-type-of-pigs"
        And should see heading "What type of pigs?"
        When the user selects the following
            | Large White       |
            | British Landrace  |
            | Berkshire         |
            | Other             |
        And continues

        # how-many-white-pigs
        Then the user should be at URL "how-many-white-pigs"
        And should see heading "How many White pigs do you have?"
        When the user enters "25" for "How many White pigs do you have?"
        And continues

        # how-many-british-landrace
        Then the user should be at URL "how-many-british-landrace"
        And should see heading "How many British Landrace pigs do you have?"
        When the user enters "25" for "How many British Landrace pigs do you have?"
        And continues

        # how-many-berkshire-pigs
        Then the user should be at URL "how-many-berkshire-pigs"
        And should see heading "How many Berkshire pigs do you have?"
        When the user enters "25" for "How many Berkshire pigs do you have?"
        And continues

        # how-many-other-pigs
        Then the user should be at URL "how-many-other-pigs"
        And should see heading "How many Other pigs do you have?"
        When the user enters "25" for "How many Other pigs do you have?"
        And continues

        # potential-funding
        Then the user should be at URL "potential-funding"
        And should see heading "Potential funding"
        When the user continues

        # check-answers
        Then the user should be at URL "check-answers"
        And should see heading "Check your answers"
        When the user submits their form

        # confirmation
        Then the user should be at URL "confirmation"
        And should see heading "Application complete"
        And should see a reference number for their application

        # validate Mongo state storage
        And the following application state should be stored for CRN "1100946268" and SBI "106498131" and grant "pigs-might-fly"
            | FIELD                | VALUE              |
            | $$__referenceNumber  | {REFERENCE NUMBER} |
            | applicationStatus    | SUBMITTED          |
            | submittedBy          | 1100946268         |

        # validate Mongo submission storage
        And the following application submissions should be stored for CRN "1100946268" and SBI "106498131" and grant "pigs-might-fly"
            | REFERENCE NUMBER   | CRN        |
            | {REFERENCE NUMBER} | 1100946268 |
