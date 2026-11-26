Feature: Shuttering

    Scenario: A shuttered grant shows the shutter page after sign-in
        # login
        Given the user navigates to "/example-grant-shuttered"
        And logs in as CRN "9000000043"

        # shutter page
        Then the user should see heading "Sorry, Example Grant Shuttered is unavailable"
        And should see "Applications for this grant are paused while we update the eligibility guidance."
        And the page is analyzed for accessibility
