Feature: Google Analytics

    Scenario: Grants should not fire GA requests before analytics cookie consent is given, and should fire after accepting cookies
        Given there is no application state stored for CRN "1100943757" and SBI "113593357" and grant "example-grant-with-auth"
        And the user starts a new browser session with GA request tracking
        And the user navigates to "/example-grant-with-auth"
        And logs in as CRN "1100943757"
        Then the user should see heading "Example Grant"
        And no GA collect requests should have fired after waiting 5 seconds
        When the user clicks on "Accept analytics cookies"
        Then the user should see notification "You've accepted analytics cookies"
        And a GA collect request should fire

    Scenario: Grants should fire GA no-script request when JavaScript is disabled
        Given there is no application state stored for CRN "1100943838" and SBI "107173507" and grant "example-grant-with-auth"
        And the user starts a new browser session with JavaScript disabled
        And the user navigates to "/example-grant-with-auth"
        And logs in as CRN "1100943838"
        When the user clicks on "Accept analytics cookies"
        And the user navigates to "/example-grant-with-auth/start"
        Then a GA ns.html request should have fired
