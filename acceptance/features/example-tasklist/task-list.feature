Feature: Task Lists

    Background:
        Given there is no application state stored for SBI "106281016" and grant "example-tasklist"

        # tasklist
        Given the user navigates to "example-tasklist/tasklist"
        And completes any login process as CRN "1100957579"
        Then the user should be at URL "tasklist"
        Then the user should see heading "Apply for example grant"
        And should see the following task list
            | 1. Check before you start |                  |
            | Business status           | Not yet started  |
            | Project preparation       | Not yet started  |
            |                           |                  |
            | 2. Facilities             |                  |
            | Facilities                | Not yet started  |
            |                           |                  |
            | 3. Costs                  |                  |
            | Costs                     | Not yet started  |
            |                           |                  |
            | 4. Impact                 |                  |
            | Mechanisation             | Not yet started  |
            | Future customers	        | Not yet started  |
            | Collaboration	            | Not yet started  |
            | Environment	            | Not yet started  |
            |                           |                  |
            | 5. Finalisation           |                  |
            | Score results             | Cannot start yet |
            | Business Details	        | Not yet started  |
            | Who is applying?	        | Not yet started  |
            | Check your details        | Cannot start yet |
            | Confirm and send          | Cannot start yet |

    Scenario: Complete a task
        When the user selects task "Business status"

        # nature-of-business
        Then the user should be at URL "nature-of-business"
        And should see banner "Business status"
        And should see section title "Business status"
        And should see heading "What is your business?"
        When the user selects "A grower or producer of agricultural or horticultural produce"
        And continues

        # legal-status
        Then the user should be at URL "legal-status"
        And should see banner "Business status"
        And should see section title "Business status"
        And should see heading "What is the legal status of the business?"
        When the user selects "Sole trader"
        And continues

        # country
        Then the user should be at URL "country"
        And should see banner "Business status"
        And should see section title "Business status"
        And should see heading "Is the planned project in England?"
        When the user selects "Yes"
        And continues

        # summary
        Then the user should be at URL "summary"
        And should see banner "Business status"
        Then the user should see heading "Business status"
        And should see the following task summary
            | What is your business?                    | A grower or producer of agricultural or horticultural produce |
            | What is the legal status of the business? | Sole trader                                                   |
            | Is the planned project in England?        | Yes                                                           |
        When the user confirms and continues

        # tasklist
        Then the user should be at URL "tasklist"
        And should see heading "Apply for example grant"
        And should see the following task list
            | 1. Check before you start |                  |
            | Business status           | Completed        |
            | Project preparation       | Not yet started  |
            |                           |                  |
            | 2. Facilities             |                  |
            | Facilities                | Not yet started  |
            |                           |                  |
            | 3. Costs                  |                  |
            | Costs                     | Not yet started  |
            |                           |                  |
            | 4. Impact                 |                  |
            | Mechanisation             | Not yet started  |
            | Future customers	        | Not yet started  |
            | Collaboration	            | Not yet started  |
            | Environment	            | Not yet started  |
            |                           |                  |
            | 5. Finalisation           |                  |
            | Score results             | Cannot start yet |
            | Business Details	        | Not yet started  |
            | Who is applying?	        | Not yet started  |
            | Check your details        | Cannot start yet |
            | Confirm and send          | Cannot start yet |

    Scenario: Enable a hidden task
        When the user selects task "Who is applying?"

        # applying
        Then the user should be at URL "applying"
        And should see banner "Who is applying"
        And should see section title "Who is applying"
        And should see heading "Who is applying for this grant"
        When the user selects "Applicant"
        And continues

        # summary
        Then the user should be at URL "summary"
        And should see banner "Who is applying"
        Then the user should see heading "Who is applying"
        And should see the following task summary
            | Who is applying for this grant? | Applicant |
        When the user confirms and continues

        # tasklist
        Given the user navigates to "/example-tasklist/tasklist"
        Then the user should be at URL "tasklist"
        Then the user should see heading "Apply for example grant"
        And should see the following task list
            | 1. Check before you start |                  |
            | Business status           | Not yet started  |
            | Project preparation       | Not yet started  |
            |                           |                  |
            | 2. Facilities             |                  |
            | Facilities                | Not yet started  |
            |                           |                  |
            | 3. Costs                  |                  |
            | Costs                     | Not yet started  |
            |                           |                  |
            | 4. Impact                 |                  |
            | Mechanisation             | Not yet started  |
            | Future customers	        | Not yet started  |
            | Collaboration	            | Not yet started  |
            | Environment	            | Not yet started  |
            |                           |                  |
            | 5. Finalisation           |                  |
            | Score results             | Cannot start yet |
            | Business Details	        | Not yet started  |
            | Who is applying?	        | Completed        |
            | Applicant                 | Not yet started  |
            | Check your details        | Cannot start yet |
            | Confirm and send          | Cannot start yet |

    Scenario: Resume a task
        When the user selects task "Business status"

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
        When the user navigates backward

        # legal-status
        Then the user should be at URL "legal-status"
        When the user navigates backward

        # nature-of-business
        Then the user should be at URL "nature-of-business"
        When the user navigates backward

        # tasklist
        Then the user should be at URL "tasklist"
        Then the user should see heading "Apply for example grant"
        And should see the following task list
            | 1. Check before you start |                  |
            | Business status           | In progress      |
            | Project preparation       | Not yet started  |
            |                           |                  |
            | 2. Facilities             |                  |
            | Facilities                | Not yet started  |
            |                           |                  |
            | 3. Costs                  |                  |
            | Costs                     | Not yet started  |
            |                           |                  |
            | 4. Impact                 |                  |
            | Mechanisation             | Not yet started  |
            | Future customers	        | Not yet started  |
            | Collaboration	            | Not yet started  |
            | Environment	            | Not yet started  |
            |                           |                  |
            | 5. Finalisation           |                  |
            | Score results             | Cannot start yet |
            | Business Details	        | Not yet started  |
            | Who is applying?	        | Not yet started  |
            | Check your details        | Cannot start yet |
            | Confirm and send          | Cannot start yet |

        When the user selects task "Business status"

        # nature-of-business
        Then the user should be at URL "nature-of-business"
        When the user continues

        # legal-status
        Then the user should be at URL "legal-status"
        When the user continues

        # country
        Then the user should be at URL "country"
        And should see section title "Business status"
        And should see heading "Is the planned project in England?"
        When the user selects "Yes"
        And continues

        # summary
        Then the user should be at URL "summary"
        And should see heading "Business status"
        And should see the following task summary
            | What is your business?                    | A grower or producer of agricultural or horticultural produce |
            | What is the legal status of the business? | Sole trader                                                   |
            | Is the planned project in England?        | Yes                                                           |
        When the user confirms and continues

        # tasklist
        Then the user should be at URL "tasklist"
        Then the user should see heading "Apply for example grant"
        And should see the following task list
            | 1. Check before you start |                  |
            | Business status           | Completed        |
            | Project preparation       | Not yet started  |
            |                           |                  |
            | 2. Facilities             |                  |
            | Facilities                | Not yet started  |
            |                           |                  |
            | 3. Costs                  |                  |
            | Costs                     | Not yet started  |
            |                           |                  |
            | 4. Impact                 |                  |
            | Mechanisation             | Not yet started  |
            | Future customers	        | Not yet started  |
            | Collaboration	            | Not yet started  |
            | Environment	            | Not yet started  |
            |                           |                  |
            | 5. Finalisation           |                  |
            | Score results             | Cannot start yet |
            | Business Details	        | Not yet started  |
            | Who is applying?	        | Not yet started  |
            | Check your details        | Cannot start yet |
            | Confirm and send          | Cannot start yet |

    Scenario: Change answers for a task
        When the user selects task "Business status"

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

        # summary
        Then the user should be at URL "summary"
        And should see banner "Business status"
        Then the user should see heading "Business status"
        And should see the following task summary
            | What is your business?                    | A grower or producer of agricultural or horticultural produce |
            | What is the legal status of the business? | Sole trader                                                   |
            | Is the planned project in England?        | Yes                                                           |
        When the user chooses to change their sub-task answer to question "What is your business?"

        # nature-of-business
        Then the user should be at URL "nature-of-business"
        And should see heading "What is your business?"
        When the user selects "A woodland manager processing wild venison products"
        And continues

        # summary
        Then the user should be at URL "summary"
        And should see banner "Business status"
        Then the user should see heading "Business status"
        And should see the following task summary
            | What is your business?                    | A woodland manager processing wild venison products |
            | What is the legal status of the business? | Sole trader                                         |
            | Is the planned project in England?        | Yes                                                 |
        When the user confirms and continues

        # tasklist
        Then the user should be at URL "tasklist"
        And should see heading "Apply for example grant"
        And should see the following task list
            | 1. Check before you start |                  |
            | Business status           | Completed        |
            | Project preparation       | Not yet started  |
            |                           |                  |
            | 2. Facilities             |                  |
            | Facilities                | Not yet started  |
            |                           |                  |
            | 3. Costs                  |                  |
            | Costs                     | Not yet started  |
            |                           |                  |
            | 4. Impact                 |                  |
            | Mechanisation             | Not yet started  |
            | Future customers	        | Not yet started  |
            | Collaboration	            | Not yet started  |
            | Environment	            | Not yet started  |
            |                           |                  |
            | 5. Finalisation           |                  |
            | Score results             | Cannot start yet |
            | Business Details	        | Not yet started  |
            | Who is applying?	        | Not yet started  |
            | Check your details        | Cannot start yet |
            | Confirm and send          | Cannot start yet |
