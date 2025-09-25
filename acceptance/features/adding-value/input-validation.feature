Feature: Adding Value Validation

    # scenario can be re-enabled redis caching is re-moved
    @disabled
    Scenario: Explore all input validation at the highest page level
        Given there is no application state stored for SBI "106206183" and grant "adding-value"

        # start
        Given the user navigates to "/adding-value/start"
        And completes any login process as CRN "1100947604"
        Then the user should see heading "Check if you can apply for a Farming Transformation Fund Adding Value Grant"
        When the user clicks on "Start now"

        # nature-of-business
        Then the user should be at URL "nature-of-business"
        And should see heading "What is your business?"
        When the user continues
        Then the user should see error "Select the option that applies to your business"
        When the user selects "A grower or producer of agricultural or horticultural produce"
        And continues

        # legal-status
        Then the user should be at URL "legal-status"
        And should see heading "What is the legal status of the business?"
        When the user continues
        Then the user should see error "Select the legal status of the business"
        When the user selects "Sole trader"
        And continues

        # country
        Then the user should be at URL "country"
        And should see heading "Is the planned project in England?"
        When the user continues
        Then the user should see error "Is the planned project in England? - select yes or no"
        When the user selects "Yes"
        And continues

        # planning-permission
        Then the user should be at URL "planning-permission"
        And should see heading "Does the project have planning permission?"
        When the user continues
        Then the user should see error "Select when the project will have planning permission"
        When the user selects "Not needed"
        And continues

        # project-start
        Then the user should be at URL "project-start"
        And should see heading "Have you already started work on the project?"
        When the user continues
        Then the user should see error "Select the option that applies to your project"
        When the user selects "Yes, preparatory work"
        And continues

        # tenancy
        Then the user should be at URL "tenancy"
        And should see heading "Is the planned project on land the business owns?"
        When the user continues
        Then the user should see error "Is the planned project on land the business owns? - select yes or no"
        When the user selects "No"
        And continues

        # tenancy-length
        Then the user should be at URL "tenancy-length"
        And should see heading "Do you have a tenancy agreement for 5 years after the final grant payment?"
        When the user continues
        Then the user should see error "Do you have a tenancy agreement for 5 years after the final grant payment? - select yes or no"
        When the user selects "Yes"
        And continues

        # explore smaller abattoir journey

        # smaller-abattoir
        Then the user should be at URL "smaller-abattoir"
        And should see heading "Do you want to build a new smaller abattoir?"
        When the user continues
        Then the user should see error "Do you want to build a new smaller abattoir? - select yes or no"
        When the user selects "Yes"
        And continues

        # other-farmers
        Then the user should be at URL "other-farmers"
        And should see heading "Will this abattoir provide services to other farmers?"
        When the user continues
        Then the user should see error "Will this abattoir provide services to other farmers? - select yes or no"
        When the user navigates backward

        # explore top fruit journey

        # smaller-abattoir
        Then the user should be at URL "smaller-abattoir"
        And should see heading "Do you want to build a new smaller abattoir?"
        When the user selects "No"
        And continues

        # fruit-storage
        Then the user should be at URL "fruit-storage"
        And should see heading "Do you want to build new controlled atmosphere storage for top fruit?"
        When the user continues
        Then the user should see error "Do you want to build new controlled atmosphere storage for top fruit? - select yes or no"
        When the user selects "No"
        And continues

        # explore project items-only journey

        # project-items-needed
        Then the user should be at URL "project-items-needed"
        And should see heading "Does your project need eligible items?"
        When the user continues
        Then the user should see error "Does your project need eligible items? - select yes or no"
        When the user selects "Yes"
        And continues

        # project-items
        Then the user should be at URL "project-items"
        And should see heading "What eligible items does your project need?"
        When the user continues
        Then the user should see error "Select what eligible items does your project need?"
        When the user selects the following
            | Constructing or improving buildings for processing |
        And continues

        # storage
        Then the user should be at URL "storage"
        And should see heading "Does your project also need storage facilities?"
        When the user continues
        Then the user should see error "Select yes if you will need storage facilities"
        When the user selects "Yes, we will need storage facilities"
        And continues

        # project cost
        Then the user should be at URL "project-cost"
        And should see heading "What is the estimated cost of the items?"
        When the user continues
        Then the user should see error "Enter the estimated cost of the items"
        When the user enters "62500" for "Enter amount"
        And continues

        # potential-funding
        Then the user should be at URL "potential-funding"
        And should see heading "Potential grant funding"
        And continues

        # remaining-costs
        Then the user should be at URL "remaining-costs"
        And should see heading "Can you pay the remaining costs of £37,500?"
        When the user continues
        Then the user should see error "Can you pay the remaining costs? - select yes or no"
        When the user selects "Yes"
        And continues

        # produce-processed
        Then the user should be at URL "produce-processed"
        And should see heading "What type of produce is being processed?"
        When the user continues
        Then the user should see error "Select what type of produce is being processed"
        When the user selects "Arable produce"
        And continues

        # how-adding-value
        Then the user should be at URL "how-adding-value"
        And should see heading "How will this project add value to the produce?"
        When the user continues
        Then the user should see error "Select how this project will add value to the produce"
        When the user selects "Introducing a new product to your farm"
        And continues

        # project-impact
        Then the user should be at URL "project-impact"
        And should see heading "What impact will this project have?"
        When the user continues
        # Then the user should see error "Select what impact will this project have?" [TODO: raise defect]
        When the user selects the following
            | Increasing range of added-value products |
        And continues

        # mechanisation
        Then the user should be at URL "mechanisation"
        And should see heading "Will this project use any mechanisation instead of manual labour?"
        When the user continues
        Then the user should see error "Will this project use any mechanisation instead of manual labour? - select yes or no"
        When the user selects "Yes"
        And continues

        # manual-labour-amount
        Then the user should be at URL "manual-labour-amount"
        And should see heading "How much manual labour will the mechanisation be equal to?"
        When the user continues
        Then the user should see error "Select how much manual labour the mechanisation will be equal to"
        When the user selects "More than 10%"
        And continues

        # future-customers-exist
        Then the user should be at URL "future-customers-exist"
        And should see heading "Will you have new customers after this project?"
        When the user continues
        Then the user should see error "Will you have new customers after this project? - select yes or no"
        When the user selects "Yes"
        And continues

        # future-customers
        Then the user should be at URL "future-customers"
        And should see heading "Who will your new customers be after this project?"
        When the user continues
        Then the user should see error "Select who will your new customers be after this project?"
        When the user selects the following
            | Processors |
        And continues

        # collaboration
        Then the user should be at URL "collaboration"
        And should see heading "Will you work in partnership or collaborate with other farmers or producers?"
        When the user continues
        Then the user should see error "Will you work in partnership or collaborate with other farmers or producers? - select yes or no"
        When the user selects "Yes"
        And continues

        # environmental-impact-exist
        Then the user should be at URL "environmental-impact-exist"
        And should see heading "Will this project improve the environment?"
        When the user continues
        Then the user should see error "Will this project improve the environment? - select yes or no"
        When the user selects "Yes"
        And continues

        # environmental-impact
        Then the user should be at URL "environmental-impact"
        And should see heading "How will this project improve the environment?"
        When the user continues
        Then the user should see error "Select how will this project improve the environment?"
        When the user selects the following
            | Renewable energy |
        And continues

        # score-results
        Then the user should be at URL "score-results"
        When the user continues

        # business-details
        Then the user should be at URL "business-details"
        # And should see heading "Business details" [TODO: raise defect]
        When the user continues
        # Then the user should see the following errors [TO BE IMPLEMENTED]
        #     | Enter a project name          |
        #     | Enter a business name         |
        #     | Enter the number of employees |
        #     | Enter the business turnover   |
        # When the user enters the following
        #     | FIELD                            | VALUE                | ID               |
        #     | Project name                     | Adding Value Project | projectName      |
        #     | Business name                    | Test Farm Ltd        | businessName     |
        #     | Number of employees              | 10                   | numberEmployees  |
        #     | Annual business turnover (£)     | 20000000             | businessTurnover |
        #     | Single Business Identifier (SBI) | 123456789            | sbi              |
        # And continues

        # applying
        Then the user should be at URL "applying"
        And should see heading "Who is applying for this grant?"
        When the user continues
        Then the user should see error "Select who is applying for this grant"
        When the user selects "Agent"
        And continues

        # agent-details
        Then the user should be at URL "agent-details"
        And should see heading "Agent's details"
        When the user continues
        Then the user should see the following errors
            | Enter your first name      |
            | Enter your last name       |
            | Enter your business name   |
            | Enter your email address   |
            | Confirm your email address |
            | Enter a mobile number      |
            | Enter a landline number    |
            | Enter address line 1       |
            | Enter town or city         |
            | Enter postcode             |
        When the user enters the following
            | FIELD                     | VALUE                                          |
            | First name                | John                                           |
            | Last name                 | Test-Agent                                     |
            | Business name             | Test Agency Ltd                                |
            | Email address             | cl-defra-gae-test-agent-email@equalexperts.com |
            | Confirm email address     | cl-defra-gae-test-agent-email@equalexperts.com |
            | Mobile number             | 07777 654321                                   |
            | Landline number           | 01604 654321                                   |
            | Address line 1            | High Street                                    |
            | Address line 2 (optional) | Denton                                         |
            | Town                      | Northampton                                    |
            | County (optional)         | Northamptonshire                               |
            | Postcode                  | NN7 3NN                                        |
        And continues

        # applicant-details
        Then the user should be at URL "applicant-details"
        And should see heading "Applicant's details"
        When the user continues
        Then the user should see the following errors
            | Enter your first name      |
            | Enter your last name       |
            | Enter your email address   |
            | Confirm your email address |
            | Enter a mobile number      |
            | Enter a landline number    |
            | Enter address line 1       |
            | Enter town or city         |
            | Enter postcode             |
            # [Should be 'Enter project postcode' - to be fixed in TGC-666]
            | Enter postcode             |S
        When the user enters the following
            | FIELD                     | VALUE                                              |
            | First name                | James                                              |
            | Last name                 | Test-Farmer                                        |
            | Email address             | cl-defra-gae-test-applicant-email@equalexperts.com |
            | Confirm email address     | cl-defra-gae-test-applicant-email@equalexperts.com |
            | Mobile number             | 07777 123456                                       |
            | Landline number           | 01604 123456                                       |
            | Address line 1            | Test Farm                                          |
            | Address line 2 (optional) | Cogenhoe                                           |
            | Town                      | Northampton                                        |
            | County (optional)         | Northamptonshire                                   |
            | Postcode                  | NN7 1NN                                            |
            | Project postcode          | NN7 2NN                                            |
        And continues

        # check-details
        Then the user should be at URL "check-details"
        And should see heading "Check your details"
