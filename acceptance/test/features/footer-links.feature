Feature: Footer Links

    Scenario: Footer should contain expected links
        Given there is no application state stored for CRN "1100961682" and SBI "106281016" and grant "example-grant-with-auth"

        # start
        Given the user navigates to "/example-grant-with-auth"
        And completes any login process as CRN "1100961682"
        Then the user should see heading "Example Grant"

        # footer links
        Then the footer should contain the following links
            | TEXT                           | URL                                                                                                                   |
            | Privacy (opens in new tab)     | https://www.gov.uk/government/organisations/rural-payments-agency/about/personal-information-charter                  |
            | Cookies                        |                                                                                                                       |
