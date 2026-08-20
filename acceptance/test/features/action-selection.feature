Feature: Action Selection

    # Disabled until both land:
    #   1. the seeded land-grants dataset offers SCR2 for parcel SK0972 6820
    #      (actions.enabled is currently false, and it is not linked to that
    #      parcel's land covers), so the SCR2 row below can render
    #   2. the example-grant-with-map config adding /confirm-land-and-actions is
    #      released (DEFRA/grants-config-example-grants#157)
    @disabled
    Scenario: Select a partial area action for a land parcel
        Given there is no application data for SBI "106514040" and grant "example-grant-with-map"

        # start
        Given the user navigates to "/example-grant-with-map"
        And logs in as CRN "1103313150"
        Then the user should see heading "Apply for Example Grant with Map"
        When the user clicks on "Start now"

        # select-land-parcel
        Then the user should be at URL "select-land-parcel"
        And should see heading "Select a land parcel"
        When the user selects parcel "SK0972 6820" of area "0.2774" hectares on the map
        And continues

        # select-actions-for-land-parcel
        Then the user should be at URL "select-actions-for-land-parcel"
        And should see heading "Select actions for this land parcel"
        And should see the following selected land parcel
            | FIELD             | VALUE           |
            | Parcel reference  | SK0972 6820     |
            | Total area        | 0.2774 hectares |
        And should see the following actions with guidance
            | ACTION | DESCRIPTION                                           | GUIDANCE                          | URL |
            | CSAM3  | Herbal leys: CSAM3                                    | Payment rate per year: £224.00/ha | Yes |
            | CLIG3  | Manage grassland with very low nutrient inputs: CLIG3 | Payment rate per year: £151.00/ha | Yes |
            |        |                                                       | 0.276 hectares available          |     |
            | SCR2   | Manage scrub and open habitat mosaics: SCR2           | Payment rate per year: £350.00/ha | Yes |

        When the user selects action "CSAM3"

        # RULE: partial action hectares cannot be zero
        When the user enters "0" hectares for action "CSAM3"
        And continues
        Then the user should see "Enter a quantity for Herbal leys: CSAM3" for action "CSAM3"

        # RULE: partial action hectares cannot exceed available hectares
        When the user enters "0.277" hectares for action "CSAM3"
        And continues
        Then the user should see "The amount of land must be the same as or less than the available area" for action "CSAM3"

        # RULE: partial action hectares must be 4 decimal places or fewer
        When the user enters "0.27666" hectares for action "CSAM3"
        And continues
        Then the user should see "Quantity for Herbal leys: CSAM3 must be 4 decimal places or fewer" for action "CSAM3"

        # RULE: partial action hectares must be be given
        When the user enters "" hectares for action "CSAM3"
        And continues
        Then the user should see "Enter a quantity for Herbal leys: CSAM3" for action "CSAM3"

        # RULE: partial action cannot be selected once a total action is selected taking all available hectares
        When the user deselects action "CSAM3"
        And the user selects action "CLIG3"
        Then the user should be unable to select action "CSAM3"

        # RULE: selecting a partial action with less than the available hectares allows a total action to subsequently be selected
        When the user deselects action "CLIG3"
        And the user selects action "CSAM3"
        And the user enters "0.1" hectares for action "CSAM3"
        Then the user should be able to select action "CLIG3"

        # RULE: selecting a partial action with all available hectares does not allow a total action to subsequently be selected
        When the user enters "0.276" hectares for action "CSAM3"
        Then the user should be unable to select action "CLIG3"

        # RULE: partial area action can be applied to an eligible land parcel
        When the user selects action "CSAM3"
        When the user enters "0.276" hectares for action "CSAM3"
        And continues

        # confirm-land-and-actions, go back to select a different land parcel
        Then the user should be at URL "confirm-land-and-actions"
        And should see heading "Your land and actions"
        When the user clicks on "Add another land parcel"

        # RULE: an action cannot be applied to a land parcel it is not eligible for
        Then the user should be at URL "select-land-parcel"
        When the user selects parcel "SK0972 7313" of area "0.2460" hectares on the map
        And continues
        Then the user should be at URL "select-actions-for-land-parcel"
        Then the user should not see action "CSAM3"
