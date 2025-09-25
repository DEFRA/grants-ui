Feature: Adding Value Journeys

    Scenario: Successfully apply for a grant on the Project Items-only journey
        - checking storage facilities percentage
        - with storage facilities
        - with potential grant funding below the maximum
        - receiving an average score
        - as the applicant

        Given there is no application state stored for SBI "115371673" and grant "adding-value"

        # start
        Given the user navigates to "/adding-value/start"
        And completes any login process as CRN "1100946179"
        Then the user should see heading "Check if you can apply for a Farming Transformation Fund Adding Value Grant"
        When the user clicks on "Start now"

        # nature-of-business
        Then the user should be at URL "nature-of-business"
        And should see heading "What is your business?"
        When the user selects "A business processing agricultural or horticultural products that is at least 50% owned by agricultural or horticultural producers"
        And continues

        # legal-status
        Then the user should be at URL "legal-status"
        And should see heading "What is the legal status of the business?"
        When the user selects "Co-operative society (Co-Op)"
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
        When the user selects "Yes"
        And continues

        # project-items
        Then the user should be at URL "project-items"
        And should see heading "What eligible items does your project need?"
        And should see hint "Storage facilities will only be funded as part of a bigger project and cannot be more than 50% of the total grant funding."
        When the user selects the following
            | Constructing or improving buildings for processing |
            | Processing equipment or machinery                  |
            | Retail facilities                                  |
        And continues

        # storage
        Then the user should be at URL "storage"
        And should see heading "Does your project also need storage facilities?"
        And should see warning "Storage facilities cannot be more than 50% of the total grant funding."
        When the user selects "Yes, we will need storage facilities"
        And continues

        # project-cost
        Then the user should be at URL "project-cost"
        And should see heading "What is the estimated cost of the items?"
        When the user enters "125000" for "Enter amount"
        And continues

        # potential-funding
        Then the user should be at URL "potential-funding"
        And should see heading "Potential grant funding"
        And should see body "You may be able to apply for grant funding of up to £50,000 (40% of £125,000)."
        And continues

        # remaining-costs
        Then the user should be at URL "remaining-costs"
        And should see heading "Can you pay the remaining costs of £75,000?"
        When the user selects "Yes"
        And continues

        # produce-processed
        Then the user should be at URL "produce-processed"
        And should see heading "What type of produce is being processed?"
        When the user selects "Fibre produce"
        And continues

        # how-adding-value
        Then the user should be at URL "how-adding-value"
        And should see heading "How will this project add value to the produce?"
        When the user selects "Packing produce"
        And continues

        # project-impact
        Then the user should be at URL "project-impact"
        And should see heading "What impact will this project have?"
        When the user selects the following
            | Increasing range of added-value products  |
            | Increasing volume of added-value products |
            | Allow selling direct to consumer          |
        And continues

        # mechanisation
        Then the user should be at URL "mechanisation"
        And should see heading "Will this project use any mechanisation instead of manual labour?"
        When the user selects "No"
        And continues

        # future-customers-exist
        Then the user should be at URL "future-customers-exist"
        And should see heading "Will you have new customers after this project?"
        When the user selects "Yes"
        And continues

        # future-customers
        Then the user should be at URL "future-customers"
        And should see heading "Who will your new customers be after this project?"
        When the user selects the following
            | Processors                  |
            | Wholesalers                 |
            | Retailers                   |
        And continues

        # collaboration
        Then the user should be at URL "collaboration"
        And should see heading "Will you work in partnership or collaborate with other farmers or producers?"
        When the user selects "No"
        And continues

        # environmental-impact-exist
        Then the user should be at URL "environmental-impact-exist"
        And should see heading "Will this project improve the environment?"
        When the user selects "Yes"
        And continues

        # environmental-impact
        Then the user should be at URL "environmental-impact"
        And should see heading "How will this project improve the environment?"
        When the user selects the following
            | Renewable energy  |
            | Energy efficiency |
            | Water efficiency  |
        And continues

        # score-results
        Then the user should be at URL "score-results"
        And should see "Average" for their project score
        And should see the following score results
            | TOPIC                | ANSWERS                                   | SCORE   | FUNDING PRIORITIES                                                                            |
            | Produce processed    | Fibre produce                             | Weak    | Create and expand processing capacity to provide more English-grown food for consumers to buy |
        # Adding Value topic text does not appear, nor funding priorities. To be fixed in TGC-659.
        #   | Adding value         | Packing produce                           | Weak    | Improve processing and supply chains                                                          |
        #   |                      |                                           |         | Grow your business                                                                            |
            |                      | Packing produce                           | Weak    |                                                                                               |
            | Project impact       | Increasing range of added-value products  | Average | Improve processing and supply chains                                                          |
            |                      | Increasing volume of added-value products |         | Grow your business                                                                            |
            |                      | Allow selling direct to consumer          |         |                                                                                               |
        # Mechanisation, Future Customers and Environmental impact can all be answered 'No' and will not appear in the results. To be fixed in TGC-659.
        #   | Mechanisation        | No                                        | Weak    |                                                                                               | 
            | New customers        | Processors                                | Strong  | Improve processing and supply chains                                                          |
            |                      | Wholesalers                               |         | Grow your business                                                                            |
            |                      | Retailers                                 |         |                                                                                               |
            | Collaboration        | No                                        | Weak    | Improve processing and supply chains                                                          |
            |                      |                                           |         | Encourage collaboration and partnerships                                                      |
            | Environmental impact | Renewable energy                          | Strong  | Improve processing and supply chains                                                          |
            |                      | Energy efficiency                         |         | Encourage collaboration and partnerships                                                      |
            |                      | Water efficiency                          |         |                                                                                               |
        When the user continues

        # business-details
        Then the user should be at URL "business-details"
        # And should see heading "Business details" [TODO: raise defect]
        # When the user enters the following  [TO BE IMPLEMENTED]
        #     | FIELD                            | VALUE                      | ID               |
        #     | Project name                     | Project Items-only Project | projectName      |
        #     | Business name                    | Test Farm Ltd              | businessName     |
        #     | Number of employees              | 10                         | numberEmployees  |
        #     | Annual business turnover (£)     | 20000000                   | businessTurnover |
        #     | Single Business Identifier (SBI) | 123456789                  | sbi              |
        And continues

        # applying
        Then the user should be at URL "applying"
        And should see heading "Who is applying for this grant?"
        When the user selects "Applicant"
        And continues

        # applicant-details
        Then the user should be at URL "applicant-details"
        And should see heading "Applicant's details"
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

        # summary
        Then the user should be at URL "summary"
        And should see heading "Check your answers"
        And continues

        # declaration
        Then the user should be at URL "declaration"
        And should see heading "Confirm and send"
        When the user confirms and sends

        # confirmation
        Then the user should be at URL "confirmation"
        And should see heading "Details submitted"
        And should see an "AV" reference number for their application
