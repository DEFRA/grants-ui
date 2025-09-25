Feature: Adding Value Eligibility and Elimination

    Scenario: Explore all common eligibility questions and elimination routes
        Given there is no application state stored for SBI "107173507" and grant "adding-value"

        # start
        Given the user navigates to "/adding-value/start"
        And completes any login process as CRN "1100943838"
        Then the user should see heading "Check if you can apply for a Farming Transformation Fund Adding Value Grant"
        When the user clicks on "Start now"

        # nature-of-business
        Then the user should be at URL "nature-of-business"
        And should see heading "What is your business?"
        When the user selects "None of the above"
        And continues

        # cannot-apply-nature-of-business
        Then the user should be at URL "cannot-apply-nature-of-business"
        And should see heading "You cannot apply for a grant from this scheme"
        When the user navigates backward

        # nature-of-business
        Then the user should be at URL "nature-of-business"
        And should see heading "What is your business?"
        When the user selects "A grower or producer of agricultural or horticultural produce"
        And continues

        # legal-status
        Then the user should be at URL "legal-status"
        And should see heading "What is the legal status of the business?"
        When the user selects "None of the above"
        And continues

        # legal-status-cannot-apply
        Then the user should be at URL "legal-status-cannot-apply"
        And should see heading "You cannot apply for a grant from this scheme"
        When the user navigates backward

        # legal-status
        Then the user should be at URL "legal-status"
        And should see heading "What is the legal status of the business?"
        When the user selects "Sole trader"
        And continues

        # country
        Then the user should be at URL "country"
        And should see heading "Is the planned project in England?"
        When the user selects "No"
        And continues

        # cannot-apply-country
        Then the user should be at URL "cannot-apply-country"
        And should see heading "You cannot apply for a grant from this scheme"
        When the user navigates backward

        # country
        Then the user should be at URL "country"
        And should see heading "Is the planned project in England?"
        When the user selects "Yes"
        And continues

        # planning-permission
        Then the user should be at URL "planning-permission"
        And should see heading "Does the project have planning permission?"
        When the user selects "Will not be in place by the time I make my full application"
        And continues

        # planning-permission-cannot-apply
        Then the user should be at URL "planning-permission-cannot-apply"
        And should see heading "You cannot apply for a grant from this scheme"
        When the user navigates backward

        # planning-permission
        Then the user should be at URL "planning-permission"
        And should see heading "Does the project have planning permission?"
        When the user selects "Secured"
        And continues

        # project-start
        Then the user should be at URL "project-start"
        And should see heading "Have you already started work on the project?"
        When the user selects "Yes, we have begun project work"
        And continues

        # cannot-apply-project-start
        Then the user should be at URL "cannot-apply-project-start"
        And should see heading "You cannot apply for a grant from this scheme"
