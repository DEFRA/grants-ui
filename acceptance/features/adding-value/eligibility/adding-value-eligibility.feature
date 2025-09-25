Feature: Adding Value Eligibility and Elimination

    Background:
        Given there is no application state stored for SBI "113593357" and grant "adding-value"

        # start
        Given the user navigates to "/adding-value/start"
        And completes any login process as CRN "1100943757"
        Then the user should see heading "Check if you can apply for a Farming Transformation Fund Adding Value Grant"
        When the user clicks on "Start now"

        # nature-of-business
        Then the user should be at URL "nature-of-business"
        And should see heading "What is your business?"
        When the user selects "A woodland manager processing wild venison products"
        And continues

        # legal-status
        Then the user should be at URL "legal-status"
        And should see heading "What is the legal status of the business?"
        When the user selects "Community interest company"
        And continues

        # country
        Then the user should be at URL "country"
        And should see heading "Is the planned project in England?"
        When the user selects "Yes"
        And continues

        # planning-permission
        Then the user should be at URL "planning-permission"
        And should see heading "Does the project have planning permission?"
        When the user selects "Secured"
        And continues

        # project-start
        Then the user should be at URL "project-start"
        And should see heading "Have you already started work on the project?"
        When the user selects "No, we have not done any work on this project yet"
        And continues

        # tenancy
        Then the user should be at URL "tenancy"
        And should see heading "Is the planned project on land the business owns?"
        When the user selects "Yes"
        And continues

    Scenario: Explore Smaller Abattoir eligibility questions and elimination
        # smaller-abattoir
        Then the user should be at URL "smaller-abattoir"
        And should see heading "Do you want to build a new smaller abattoir?"
        When the user selects "Yes"
        And continues

        # other-farmers
        Then the user should be at URL "other-farmers"
        And should see heading "Will this abattoir provide services to other farmers?"
        When the user selects "No"
        And continues

        # cannot-apply-other-farmers
        Then the user should be at URL "cannot-apply-other-farmers"
        And should see heading "You cannot apply for a grant from this scheme"

    Scenario: Explore Project Items-only eligibility questions and elimination
        # smaller-abattoir
        Then the user should be at URL "smaller-abattoir"
        And should see heading "Do you want to build a new smaller abattoir?"
        When the user selects "No"
        And continues

        # fruit-storage
        Then the user should be at URL "fruit-storage"
        And should see heading "Do you want to build new controlled atmosphere storage for top fruit?"
        When the user selects "No"
        And continues

        # project-items-needed
        Then the user should be at URL "project-items-needed"
        And should see heading "Does your project need eligible items?"
        When the user selects "No"
        And continues

        # cannot-apply-project-items
        Then the user should be at URL "cannot-apply-project-items"
        And should see heading "You cannot apply for a grant from this scheme"
