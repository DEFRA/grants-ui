Feature: HEF1 building maintenance

    # Requires the Grasslands form definition to include HEF1 in enabledLandActions.
    # The existing action quantity step is named "hectares", but fills the input
    # by action code. HEF1 is still entered, displayed and submitted in square metres.
    # Scenario 8 requires Grasslands with HEF1 removed from enabledLandActions;
    # configuration switching is verified separately rather than adding step logic.

    Background:
        Given there is no application data for SBI "106841262" and grant "grasslands"
        And the user navigates to "/grasslands/check-details"
        And logs in as CRN "1101092483"
        Then the user should be at URL "check-details"
        When the user selects "Yes"
        And clicks button "Continue"
        Then the user should be at URL "check-your-land-details"
        When the user selects "Yes"
        And clicks button "Save and continue"
        Then the user should be at URL "management-control-of-land"
        When the user selects "Yes"
        And clicks button "Save and continue"
        Then the user should be at URL "tasks"
        When the user navigates to "/grasslands/select-land-parcel"

    Scenario Outline: HEF1 is offered on backend-returned parcels with its guidance and square-metre input
        When the user selects parcel "<parcel>" of area "<area>" hectares on the map
        And continues
        Then the user should be at URL "select-actions-for-land-parcel"
        And should see the following actions with guidance
            | ACTION | DESCRIPTION                                                       | GUIDANCE                        | URL |
            | HEF1   | Maintain weatherproof traditional farm or forestry buildings: HEF1 | Payment rate per year: £5.00/sqm | Yes |
        When the user selects action "HEF1"
        Then the user should see "square metres"
        And should see action "HEF1" selected

        Examples:
            | parcel      | area    |
            | ST1237 9525 | 16.0165 |
            | ST1437 7349 | 35.6517 |

    Scenario Outline: Invalid HEF1 quantities are rejected
        When the user selects parcel "ST1437 7349" of area "35.6517" hectares on the map
        And continues
        And selects action "HEF1"
        And enters "<quantity>" hectares for action "HEF1"
        Then the user should see "<error>" for action "HEF1"
        When the user clicks button "Save and continue"
        Then the user should still be at URL "select-actions-for-land-parcel"
        And should see "<error>" for action "HEF1"

        Examples:
            | quantity | error                        |
            | 0        | Value must be greater than 0 |
            | -11      | Value must be greater than 0 |
            | 11.22001 | Must be a whole number       |
            | as       | Must be numbers              |

    Scenario: Apply a whole-number HEF1 quantity on designated land and retain HEFER warnings through submission
        # This seeded parcel has SSSI and HEFER designations. HEF1 only requires HEFER.
        When the user selects parcel "ST1437 7349" of area "35.6517" hectares on the map
        And continues
        Then the user should see the following actions with guidance
            | ACTION | DESCRIPTION                                                       | GUIDANCE              | URL |
            | HEF1   | Maintain weatherproof traditional farm or forestry buildings: HEF1 | Requires an SFI HEFER | Yes |
        When the user selects action "HEF1"
        And enters "4" hectares for action "HEF1"
        And clicks button "Save and continue"
        Then the user should be at URL "confirm-land-and-actions"
        And should see "Maintain weatherproof traditional farm or forestry buildings (HEF1)"
        And should see "4.0000 sqm"
        And should see "Requires an SFI HEFER"
        And should see total yearly payment "£20.00"
        When the user clicks button "Save and continue"
        Then the user should be at URL "you-must-have-consent"
        And should see "SFI HEFER"
        When the user continues
        Then the user should be at URL "tasks"
        When the user navigates to "/grasslands/summary"
        Then the user should see heading "Check your answers"
        And should see "Requires an SFI HEFER"
        And should see "4.0000 sqm"
        When the user continues
        Then the user should be at URL "declaration"
        When the user clicks button "I agree - submit my application"
        Then the user should be at URL "confirmation"
        When the user navigates to "/grasslands/print-submitted-application"
        Then the user should see "Maintain weatherproof traditional farm or forestry buildings (HEF1)"
        And should see "Requires an SFI HEFER"
        And should see "4.0000 sqm"
        And should see total yearly payment "£20.00"
