Feature: Adding Value Eligibility and Elimination

    Background:
        Given there is no application state stored for SBI "106842593" and grant "adding-value"

        # start
        Given the user navigates to "/adding-value/start"
        And completes any login process as CRN "1100945520"
        Then the user should see heading "Check if you can apply for a Farming Transformation Fund Adding Value Grant"
        When the user clicks on "Start now"

        # nature-of-business
        Then the user should be at URL "nature-of-business"
        And should see heading "What is your business?"
        When the user selects "A grower or producer of agricultural or horticultural produce"
        And continues

        # legal-status
        Then the user should be at URL "legal-status"
        And should see heading "What is the legal status of the business?"
        When the user selects "Limited company"
        And continues

        # country
        Then the user should be at URL "country"
        And should see heading "Is the planned project in England?"
        When the user selects "Yes"
        And continues

        # planning-permisssion
        Then the user should be at URL "planning-permission"
        And should see heading "Does the project have planning permission?"
        When the user selects "Not needed"
        And continues

        # project-start
        Then the user should be at URL "project-start"
        And should see heading "Have you already started work on the project?"
        When the user selects "Yes, preparatory work"
        And continues

        # tenancy
        Then the user should be at URL "tenancy"
        And should see heading "Is the planned project on land the business owns?"
        When the user selects "Yes"
        And continues

        # smaller-abattoir
        Then the user should be at URL "smaller-abattoir"
        And should see heading "Do you want to build a new smaller abattoir?"
        When the user selects "No"
        And continues

        # fruit-storage
        Then the user should be at URL "fruit-storage"
        And should see heading "Do you want to build new controlled atmosphere storage for top fruit?"
        When the user selects "Yes"
        And continues

    Scenario: Explore project costs eligibility questions and elimination by project cost under minimum grant threshold
        # project cost elimination
        Then the user should be at URL "project-cost"
        And should see heading "What is the estimated cost of the items?"
        When the user enters "62499" for "Enter amount"
        And continues

        # project-cost-cannot-apply
        Then the user should be at URL "project-cost-cannot-apply"
        And should see heading "You cannot apply for a grant from this scheme"
        And should see body "The minimum grant you can apply for is £25,000 (40% of £62,500)."

    Scenario: Explore project costs eligibility questions and elimination by remaining costs not being met
        # project cost
        Then the user should be at URL "project-cost"
        And should see heading "What is the estimated cost of the items?"
        When the user enters "62500" for "Enter amount"
        And continues

        # potential-funding
        Then the user should be at URL "potential-funding"
        And should see heading "Potential grant funding"
        And continues

        # remaining-costs
        Then the user should be at URL "remaining-costs"
        And should see heading "Can you pay the remaining costs of £37,500?"
        When the user selects "No"
        And continues

        # cannot-apply-remaining-costs
        Then the user should be at URL "cannot-apply-remaining-costs"
        And should see heading "You cannot apply for a grant from this scheme"
