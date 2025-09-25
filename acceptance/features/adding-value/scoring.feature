Feature: Adding Value Scoring

    Scenario: Generate a Weak score, improve it to an Average score using 'Change' links and then improve it to a Strong score
        Given there is no application state stored for SBI "115384462" and grant "adding-value"

        # start
        Given the user navigates to "/adding-value/start"
        And completes any login process as CRN "1100949763"
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
        When the user selects "Sole trader"
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
        When the user selects "Yes"
        And continues

        # other-farmers
        Then the user should be at URL "other-farmers"
        And should see heading "Will this abattoir provide services to other farmers?"
        When the user selects "Yes"
        And continues

        # project-items-needed
        Then the user should be at URL "project-items-needed"
        And should see heading "Does your project need eligible items?"
        When the user selects "Yes"
        And continues 

        # project-items
        Then the user should be at URL "project-items"
        And should see heading "What eligible items does your project need?"
        When the user selects the following
            | Constructing or improving buildings for processing |
        And continues

        # storage
        Then the user should be at URL "storage"
        And should see heading "Does your project also need storage facilities?"
        When the user selects "Yes, we will need storage facilities"
        And continues

        # project-cost
        Then the user should be at URL "project-cost"
        And should see heading "What is the estimated cost of the items?"
        When the user enters "1000000" for "Enter amount"
        And continues

        # potential-funding
        Then the user should be at URL "potential-funding"
        And should see heading "Potential grant funding"
        And should see body "You may be able to apply for grant funding of up to £300,000, based on the estimated cost of £1,000,000."
        And continues

        # remaining-costs
        Then the user should be at URL "remaining-costs"
        And should see heading "Can you pay the remaining costs of £700,000?"
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
        When the user selects "Introducing a new product to your farm"
        And continues

        # project-impact
        Then the user should be at URL "project-impact"
        And should see heading "What impact will this project have?"
        When the user selects the following
            | Allow selling direct to consumer |
        And continues

        # mechanisation
        Then the user should be at URL "mechanisation"
        And should see heading "Will this project use any mechanisation instead of manual labour?"
        When the user selects "No"
        And continues

        # future-customers-exist
        Then the user should be at URL "future-customers-exist"
        And should see heading "Will you have new customers after this project?"
        When the user selects "No"
        And continues

        # collaboration
        Then the user should be at URL "collaboration"
        And should see heading "Will you work in partnership or collaborate with other farmers or producers?"
        When the user selects "No"
        And continues

        # environmental-impact-exist
        Then the user should be at URL "environmental-impact-exist"
        And should see heading "Will this project improve the environment?"
        When the user selects "No"
        And continues

        # score-results
        Then the user should be at URL "score-results"
        And should see "Weak" for their project score
        And should see the following score results
            | TOPIC                | ANSWERS                                | SCORE | FUNDING PRIORITIES                                                                            |
            | Produce processed    | Fibre produce                          | Weak  | Create and expand processing capacity to provide more English-grown food for consumers to buy |
            |                      | Introducing a new product to your farm | Weak  |                                                                                               |
            | Project impact       | Allow selling direct to consumer       | Weak  | Improve processing and supply chains                                                          |
            |                      |                                        |       | Grow your business                                                                            |
            | Collaboration        | No                                     | Weak  | Improve processing and supply chains                                                          |
            |                      |                                        |       | Encourage collaboration and partnerships                                                      |

        # improve score to average
        When the user chooses to change their "Produce processed" scoring answer

        # produce-processed
        Then the user should be at URL "produce-processed"
        When the user selects "Wild venison meat produce"
        And continues

        # how-adding-value
        Then the user should be at URL "how-adding-value"
        When the user continues

        # project-impact
        Then the user should be at URL "project-impact"
        When the user continues

        # mechanisation
        Then the user should be at URL "mechanisation"
        When the user continues

        # future-customers-exist
        Then the user should be at URL "future-customers-exist"
        When the user continues

        # collaboration
        Then the user should be at URL "collaboration"
        When the user continues

        # environmental-impact-exist
        Then the user should be at URL "environmental-impact-exist"
        When the user continues

        # score-results
        Then the user should be at URL "score-results"
        And should see "Average" for their project score
        And should see the following score results
            | TOPIC                | ANSWERS                                | SCORE  | FUNDING PRIORITIES                                                                            |
            | Produce processed    | Wild venison meat produce              | Strong | Create and expand processing capacity to provide more English-grown food for consumers to buy |
            |                      | Introducing a new product to your farm | Strong |                                                                                               |
            | Project impact       | Allow selling direct to consumer       | Weak   | Improve processing and supply chains                                                          |
            |                      |                                        |        | Grow your business                                                                            |
            | Collaboration        | No                                     | Weak   | Improve processing and supply chains                                                          |
            |                      |                                        |        | Encourage collaboration and partnerships                                                      |

        # improve score to average
        When the user chooses to change their "Project impact" scoring answer

        # project-impact
        Then the user should be at URL "project-impact"
        And should see heading "What impact will this project have?"
        When the user selects the following
            | Increasing range of added-value products                 |
            | Increasing volume of added-value products                |
            | Allow selling direct to consumer                         |
            | Starting to make added-value products for the first time |
        And continues

        # mechanisation
        Then the user should be at URL "mechanisation"
        And should see heading "Will this project use any mechanisation instead of manual labour?"
        When the user selects "Yes"
        And continues

        # manual-labour-amount
        Then the user should be at URL "manual-labour-amount"
        And should see heading "How much manual labour will the mechanisation be equal to?"
        When the user selects "More than 10%"
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
            | Selling direct to consumers |
        And continues

        # collaboration
        Then the user should be at URL "collaboration"
        And should see heading "Will you work in partnership or collaborate with other farmers or producers?"
        When the user selects "Yes"
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
            | Renewable energy                       |
            | Energy efficiency                      |
            | Water efficiency                       |
            | Waste efficiency                       |
            | Sustainable packaging measures         |
            | Reduce harmful emissions or pollutants |
        And continues

        # score-results
        Then the user should be at URL "score-results"
        And should see "Strong" for their project score
        And should see the following score results
            | TOPIC                | ANSWERS                                                  | SCORE   | FUNDING PRIORITIES                                                                            |
            | Produce processed    | Wild venison meat produce                                | Strong  | Create and expand processing capacity to provide more English-grown food for consumers to buy |
            |                      | Introducing a new product to your farm                   | Strong  |                                                                                               |
            | Project impact       | Increasing range of added-value products                 | Strong  | Improve processing and supply chains                                                          |
            |                      | Increasing volume of added-value products                |         | Grow your business                                                                            |
            |                      | Allow selling direct to consumer                         |         |                                                                                               |
            |                      | Starting to make added-value products for the first time |         |                                                                                               |
            | Mechanisation        | More than 10%                                            | Strong  | Improve processing and supply chains                                                          |
            |                      |                                                          |         | Grow your business                                                                            |
            | New customers        | Processors                                               | Strong  | Improve processing and supply chains                                                          |
            |                      | Wholesalers                                              |         | Grow your business                                                                            |
            |                      | Retailers                                                |         |                                                                                               |
            |                      | Selling direct to consumers                              |         |                                                                                               |
            | Collaboration        | Yes                                                      | Strong  | Improve processing and supply chains                                                          |
            |                      |                                                          |         | Encourage collaboration and partnerships                                                      |
            | Environmental impact | Renewable energy                                         | Strong  | Improve processing and supply chains                                                          |
            |                      | Energy efficiency                                        |         | Encourage collaboration and partnerships                                                      |
            |                      | Water efficiency                                         |         |                                                                                               |
            |                      | Waste efficiency                                         |         |                                                                                               |
            |                      | Sustainable packaging measures                           |         |                                                                                               |
            |                      | Reduce harmful emissions or pollutants                   |         |                                                                                               |
