Feature: Application Amendment

    @ci
    Scenario: A submitted application can be amended and re-submitted as a new application multiple times
        Given there is no application state stored for CRN "1100964517" and SBI "115482347" and grant "example-grant-with-auth"

        # start
        Given the user navigates to "/example-grant-with-auth/start"
        And completes any login process as CRN "1100964517"
        Then the user should see heading "Example Grant"
        When the user clicks on "Start now"

        # yes-no-field
        Then the user should be at URL "yes-no-field"
        When the user selects "Yes"
        And continues

        # autocomplete-field
        Then the user should be at URL "autocomplete-field"
        When the user selects "England" for AutocompleteField "Country"
        And continues

        # radios-field
        Then the user should be at URL "radios-field"
        When the user selects "Option two"
        And continues

        # checkboxes-field
        Then the user should be at URL "checkboxes-field"
        When the user selects the following
            | Option two   |
        And continues

        # number-field
        Then the user should be at URL "number-field"
        When the user enters "100000" for "Enter amount"
        And continues

        # date-parts-field
        Then the user should be at URL "date-parts-field"
        When the user enters the date in a week for DatePartsField "datePartsField"
        And continues

        # month-year-field
        Then the user should be at URL "month-year-field"
        When the user enters month "08" and year "2025" for MonthYearField "monthYearField"
        And continues

        # select-field
        Then the user should be at URL "select-field"
        When the user selects "Option two" for "Select option"
        And continues

        # multiline-text-field
        Then the user should be at URL "multiline-text-field"
        When the user enters "Lorem ipsum" for MultilineTextField "MultilineTextField Example"
        And continues

        # select-land-parcel
        Then the user should be at URL "select-land-parcel"
        When the user selects the following
            | SD6351 8781 |
        And continues

        # multi-field-form
        Then the user should be at URL "multi-field-form"
        When the user enters the following
            | FIELD                     | VALUE                                              |
            | Name                      | James Test-Farmer                                  |
            | Email address             | cl-defra-gae-test-applicant-email@equalexperts.com |
            | Mobile number             | 07777 123456                                       |
            | Address line 1            | Test Farm                                          |
            | Address line 2 (optional) | Cogenhoe                                           |
            | Town                      | Northampton                                        |
            | County (optional)         | Northamptonshire                                   |
            | Postcode                  | NN7 1NN                                            |
        And continues

        # check-details
        Then the user should be at URL "check-details"
        And should see heading "Check your details"
        When the user selects "Yes"
        And continues

        # summary
        Then the user should be at URL "summary"
        And should see the following answers
            | QUESTION            | ANSWER                                             |
            | Yes or No           | Yes                                                |
            | Country             | England                                            |
            | Radio option        | Option two                                         |
            | Checkbox options    | Option two                                         |
            | Enter amount        | 100000                                             |
            | Date                | {DATE IN A WEEK}                                   |
            | Month and year      | August 2025                                        |
            | Select option       | Option two                                         |
            | Description         | Lorem ipsum                                        |
            | Select land parcels | SD6351-8781                                        |
            | Name                | James Test-Farmer                                  |
            | Email address       | cl-defra-gae-test-applicant-email@equalexperts.com |
            | Mobile number       | 07777 123456                                       |
            | Address             | Test Farm                                          |
            |                     | Cogenhoe                                           |
            |                     | Northampton                                        |
            |                     | Northamptonshire                                   |
            |                     | NN7 1NN                                            |
        When the user continues

        # declaration
        Then the user should be at URL "declaration"
        When the user confirms and sends

        # confirmation
        Then the user should be at URL "confirmation"
        And should see heading "Details submitted"
        And should see an "EGWA" reference number for their application

        # validate Mongo state storage
        And the following application state should be stored for CRN "1100964517" and SBI "115482347" and grant "example-grant-with-auth"
            | FIELD                   | VALUE                    |
            | $$__referenceNumber     | {FIRST REFERENCE NUMBER} |
            | applicationStatus       | SUBMITTED                |
            | submittedBy             | 1100964517               |
            | autocompleteField       | ENG                      |
            | multilineTextField      | Lorem ipsum              |
            | applicantName           | James Test-Farmer        |

        # validate Mongo submission storage
        And the following application submissions should be stored for CRN "1100964517" and SBI "115482347" and grant "example-grant-with-auth"
            | REFERENCE NUMBER         | CRN        |
            | {FIRST REFERENCE NUMBER} | 1100964517 |

        # GAS
        And the reference number along with SBI "115482347" and CRN "1100964517" should be submitted to GAS

        # application is marked as awaiting amendment in GAS
        Given the application status in GAS is now "APPLICATION_AMEND"

        # user revisits grants-ui
        And the user starts a new browser session
        And navigates to "/example-grant-with-auth/yes-no-field"
        And completes any login process as CRN "1100964517"
        Then the user should be at URL "summary"
        And the grants-ui application status for CRN "1100964517" and SBI "115482347" and grant "example-grant-with-auth" should be "REOPENED"

        # validate Mongo state storage
        And the following application state should be stored for CRN "1100964517" and SBI "115482347" and grant "example-grant-with-auth"
            | FIELD                   | VALUE                    |
            | previousReferenceNumber | {FIRST REFERENCE NUMBER} |
            | applicationStatus       | REOPENED                 |

        # summary - user amends the application
        When the user chooses to change their summary answer to question "Country"

        # autocomplete-field
        Then the user should be at URL "autocomplete-field"
        When the user selects "Wales" for AutocompleteField "Country"
        And continues

        # summary
        Then the user should be at URL "summary"
        And should see the following answers
            | QUESTION            | ANSWER                                             |
            | Yes or No           | Yes                                                |
            | Country             | Wales                                              |
            | Radio option        | Option two                                         |
            | Checkbox options    | Option two                                         |
            | Enter amount        | 100000                                             |
            | Date                | {DATE IN A WEEK}                                   |
            | Month and year      | August 2025                                        |
            | Select option       | Option two                                         |
            | Description         | Lorem ipsum                                        |
            | Select land parcels | SD6351-8781                                        |
            | Name                | James Test-Farmer                                  |
            | Email address       | cl-defra-gae-test-applicant-email@equalexperts.com |
            | Mobile number       | 07777 123456                                       |
            | Address             | Test Farm                                          |
            |                     | Cogenhoe                                           |
            |                     | Northampton                                        |
            |                     | Northamptonshire                                   |
            |                     | NN7 1NN                                            |
        When the user continues

        # declaration
        Then the user should be at URL "declaration"
        When the user confirms and sends

        # confirmation
        Then the user should be at URL "confirmation"
        And should see heading "Details submitted"
        And should see an "EGWA" reference number for their application

        # validate Mongo state storage
        And the following application state should be stored for CRN "1100964517" and SBI "115482347" and grant "example-grant-with-auth"
            | FIELD                   | VALUE                     |
            | $$__referenceNumber     | {SECOND REFERENCE NUMBER} |
            | previousReferenceNumber | {FIRST REFERENCE NUMBER}  |
            | applicationStatus       | SUBMITTED                 |
            | submittedBy             | 1100964517                |
            | autocompleteField       | WLS                       |
            | multilineTextField      | Lorem ipsum               |
            | applicantName           | James Test-Farmer         |

        # validate Mongo submission storage, we should we have 2 entries now
        And the following application submissions should be stored for CRN "1100964517" and SBI "115482347" and grant "example-grant-with-auth"
            | REFERENCE NUMBER          | PREVIOUS REFERENCE NUMBER | CRN        |
            | {SECOND REFERENCE NUMBER} | {FIRST REFERENCE NUMBER}  | 1100964517 |
            | {FIRST REFERENCE NUMBER}  |                           | 1100964517 |

        # GAS
        And the reference number and previous reference number along with SBI "115482347" and CRN "1100964517" should be submitted to GAS

        # application is marked as awaiting amendment for the second time in GAS
        Given the application status in GAS is now "APPLICATION_AMEND"

        # user revisits grants-ui
        And the user starts a new browser session
        And navigates to "/example-grant-with-auth/yes-no-field"
        And completes any login process as CRN "1100964517"
        Then the user should be at URL "summary"
        And the grants-ui application status for CRN "1100964517" and SBI "115482347" and grant "example-grant-with-auth" should be "REOPENED"

        # validate Mongo state storage
        And the following application state should be stored for CRN "1100964517" and SBI "115482347" and grant "example-grant-with-auth"
            | FIELD                   | VALUE                     |
            | previousReferenceNumber | {SECOND REFERENCE NUMBER} |
            | applicationStatus       | REOPENED                  |

        # summary - user amends the application
        When the user chooses to change their summary answer to question "Country"

        # autocomplete-field
        Then the user should be at URL "autocomplete-field"
        When the user selects "France" for AutocompleteField "Country"
        And continues

        # summary
        Then the user should be at URL "summary"
        And should see the following answers
            | QUESTION            | ANSWER                                             |
            | Yes or No           | Yes                                                |
            | Country             | France                                             |
            | Radio option        | Option two                                         |
            | Checkbox options    | Option two                                         |
            | Enter amount        | 100000                                             |
            | Date                | {DATE IN A WEEK}                                   |
            | Month and year      | August 2025                                        |
            | Select option       | Option two                                         |
            | Description         | Lorem ipsum                                        |
            | Select land parcels | SD6351-8781                                        |
            | Name                | James Test-Farmer                                  |
            | Email address       | cl-defra-gae-test-applicant-email@equalexperts.com |
            | Mobile number       | 07777 123456                                       |
            | Address             | Test Farm                                          |
            |                     | Cogenhoe                                           |
            |                     | Northampton                                        |
            |                     | Northamptonshire                                   |
            |                     | NN7 1NN                                            |
        When the user continues

        # declaration
        Then the user should be at URL "declaration"
        When the user confirms and sends

        # confirmation
        Then the user should be at URL "confirmation"
        And should see heading "Details submitted"
        And should see an "EGWA" reference number for their application

        # validate Mongo state storage
        And the following application state should be stored for CRN "1100964517" and SBI "115482347" and grant "example-grant-with-auth"
            | FIELD                   | VALUE                     |
            | $$__referenceNumber     | {THIRD REFERENCE NUMBER}  |
            | previousReferenceNumber | {SECOND REFERENCE NUMBER} |
            | applicationStatus       | SUBMITTED                 |
            | submittedBy             | 1100964517                |
            | autocompleteField       | FRA                       |
            | multilineTextField      | Lorem ipsum               |
            | applicantName           | James Test-Farmer         |

        # validate Mongo submission storage, we should we have 3 entries now
        And the following application submissions should be stored for CRN "1100964517" and SBI "115482347" and grant "example-grant-with-auth"
            | REFERENCE NUMBER          | PREVIOUS REFERENCE NUMBER | CRN        |
            | {THIRD REFERENCE NUMBER}  | {SECOND REFERENCE NUMBER} | 1100964517 |
            | {SECOND REFERENCE NUMBER} | {FIRST REFERENCE NUMBER}  | 1100964517 |
            | {FIRST REFERENCE NUMBER}  |                           | 1100964517 |

        # GAS
        And the reference number and previous reference number along with SBI "115482347" and CRN "1100964517" should be submitted to GAS
