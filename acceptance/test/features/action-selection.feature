Feature: Action Selection

    Scenario: Add and remove land parcels and select actions
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
            |        |                                                       | 0.276 hectares available          |     |
            | CLIG3  | Manage grassland with very low nutrient inputs: CLIG3 | Payment rate per year: £151.00/ha | Yes |
            |        |                                                       | 0.276 hectares available          |     |
            | SCR2   | Manage scrub and open habitat mosaics: SCR2           | Payment rate per year: £350.00/ha | Yes |
            |        |                                                       | hectares available                |     |
        When the user selects action "CSAM3"

        # RULE: partial action hectares cannot be zero
        When the user enters "0" hectares for action "CSAM3"
        And continues
        Then the user should see "Enter a quantity for Herbal leys: CSAM3" for action "CSAM3"

        # RULE: partial action hectares cannot exceed available hectares
        When the user enters "0.277" hectares for action "CSAM3"
        And continues
        Then the user should see "The amount of land must be the same as or less than the available area" for action "CSAM3"

        # RULE: partial action hectares must be 4 decimal places or less
        When the user enters "0.27666" hectares for action "CSAM3"
        And continues
        Then the user should see "Quantity for Herbal leys: CSAM3 must be 4 decimal places or fewer" for action "CSAM3"

        # RULE: partial action hectares cannot be empty
        When the user enters "" hectares for action "CSAM3"
        And continues
        Then the user should see "Enter a quantity for Herbal leys: CSAM3" for action "CSAM3"

        # RULE: partial action cannot be selected once a total action has been selected taking all available hectares
        When the user deselects action "CSAM3"
        And the user selects action "CLIG3"
        Then the user should be unable to select action "CSAM3"

        # RULE: selecting a partial area action with less than the available hectares allows a total area action to subsequently be selected
        When the user deselects action "CLIG3"
        And the user selects action "CSAM3"
        And enters "0.1" hectares for action "CSAM3"
        Then the user should be able to select action "CLIG3"

        # RULE: selecting a partial area action with all available hectares does not allow a total area action to subsequently be selected
        When the user enters "0.276" hectares for action "CSAM3"
        Then the user should be unable to select action "CLIG3"

        # RULE: partial area action can be applied to an eligible land parcel
        When the user selects action "CSAM3"
        When the user enters "0.276" hectares for action "CSAM3"
        And continues

        # confirm-land-and-actions
        Then the user should be at URL "confirm-land-and-actions"
        And should see heading "Review land parcels and actions"
        And should see the following parcel summary cards
            | PARCEL      | ACTION              | QUANTITY  | YEARLY PAYMENT |
            | SK0972 6820 | Herbal leys (CSAM3) | 0.2760 ha | £61.82         |
            |             | Subtotal            |           | £61.82         |
        And should see total yearly payment "£61.82"

        # add another parcel
        When the user clicks on "Add another land parcel"
        Then the user should be at URL "select-land-parcel"
        When the user selects parcel "SK0971 5039" of area "2.5674" hectares on the map
        And continues

        # select actions for second parcel
        Then the user should be at URL "select-actions-for-land-parcel"
        When the user selects action "CSAM3"
        And enters "1.25" hectares for action "CSAM3"
        And selects action "SCR2"
        And enters "0.75" hectares for action "SCR2"
        And selects action "CLIG3"
# TODO: remove when https://eaflood.atlassian.net/browse/TGC-1625 is fixed
        And waits for 3 seconds
# TODO
        And continues

        # confirm-land-and-actions (both parcels)
        Then the user should be at URL "confirm-land-and-actions"
        And should see the following parcel summary cards
            | PARCEL      | ACTION                                                       | QUANTITY  | YEARLY PAYMENT |
            | SK0972 6820 | Herbal leys (CSAM3)                                          | 0.2760 ha | £61.82         |
            |             | Subtotal                                                     |           | £61.82         |
            | SK0971 5039 | Herbal leys (CSAM3)                                          | 1.2500 ha | £280.00        |
            |             | Manage grassland with very low nutrient inputs (CLIG3)       | 0.5674 ha | £85.68         |
            |             | Manage scrub and open habitat mosaics (SCR2)                 | 0.7500 ha | £262.50        |
            |             | Subtotal                                                     |           | £628.18        |
        And should see total yearly payment "£690.00"

        # use a change link
        When the user clicks the change link for action "CLIG3" for parcel "SK0971 5039"
        Then the user should be at URL "select-actions-for-land-parcel"
        And should see action "CSAM3" selected with "1.25" hectares
        And should see action "CLIG3" selected
        And should see action "SCR2" selected with "0.75" hectares
        When the user deselects action "CLIG3"
        And enters "1.5" hectares for action "CSAM3"
# TODO: remove when https://eaflood.atlassian.net/browse/TGC-1625 is fixed
        And waits for 3 seconds
# TODO
        And continues

        # confirm-land-and-actions, amended parcel
        Then the user should be at URL "confirm-land-and-actions"
        And should see the following parcel summary cards
            | PARCEL      | ACTION                                                       | QUANTITY  | YEARLY PAYMENT |
            | SK0972 6820 | Herbal leys (CSAM3)                                          | 0.2760 ha | £61.82         |
            |             | Subtotal                                                     |           | £61.82         |
            | SK0971 5039 | Herbal leys (CSAM3)                                          | 1.5000 ha | £336.00        |
            |             | Manage scrub and open habitat mosaics (SCR2)                 | 0.7500 ha | £262.50        |
            |             | Subtotal                                                     |           | £598.50        |
        And should see total yearly payment "£660.32"

        # use the "Add more actions to this parcel" link
        When the user clicks the add more actions link for parcel "SK0971 5039"
        Then the user should be at URL "select-actions-for-land-parcel"
        And should see action "CSAM3" selected with "1.5" hectares
        And should see action "SCR2" selected with "0.75" hectares
        When the user selects action "CLIG3"
# TODO: remove when https://eaflood.atlassian.net/browse/TGC-1625 is fixed
        And waits for 3 seconds
# TODO
        And continues

        # confirm-land-and-actions, action added back to parcel
        Then the user should be at URL "confirm-land-and-actions"
        And should see the following parcel summary cards
            | PARCEL      | ACTION                                                       | QUANTITY  | YEARLY PAYMENT |
            | SK0972 6820 | Herbal leys (CSAM3)                                          | 0.2760 ha | £61.82         |
            |             | Subtotal                                                     |           | £61.82         |
            | SK0971 5039 | Herbal leys (CSAM3)                                          | 1.5000 ha | £336.00        |
            |             | Manage grassland with very low nutrient inputs (CLIG3)       | 0.3174 ha | £47.93         |
            |             | Manage scrub and open habitat mosaics (SCR2)                 | 0.7500 ha | £262.50        |
            |             | Subtotal                                                     |           | £646.43        |
        And should see total yearly payment "£708.25"

        # remove a land parcel, then cancel
        When the user clicks the remove parcel link for parcel "SK0972 6820"
        Then the user should be at URL "remove-parcel"
        And should see heading "Remove this land parcel?"
        And should see "Land parcel SK0972 6820 and all related actions will be removed from your application."
        When the user clicks on "Cancel"

        # confirm-land-and-actions, parcel removal cancelled
        Then the user should be at URL "confirm-land-and-actions"
        And should see the following parcel summary cards
            | PARCEL      | ACTION                                                       | QUANTITY  | YEARLY PAYMENT |
            | SK0972 6820 | Herbal leys (CSAM3)                                          | 0.2760 ha | £61.82         |
            |             | Subtotal                                                     |           | £61.82         |
            | SK0971 5039 | Herbal leys (CSAM3)                                          | 1.5000 ha | £336.00        |
            |             | Manage grassland with very low nutrient inputs (CLIG3)       | 0.3174 ha | £47.93         |
            |             | Manage scrub and open habitat mosaics (SCR2)                 | 0.7500 ha | £262.50        |
            |             | Subtotal                                                     |           | £646.43        |
        And should see total yearly payment "£708.25"

        # remove a land parcel, this time confirming
        When the user clicks the remove parcel link for parcel "SK0972 6820"
        Then the user should be at URL "remove-parcel"
        When the user clicks button "Remove this land parcel"

        # confirm-land-and-actions, first parcel removed
        Then the user should be at URL "confirm-land-and-actions"
        And should see a notification banner saying "SK0972 6820 and its actions have been removed."
        And should see the following parcel summary cards
            | PARCEL      | ACTION                                                       | QUANTITY  | YEARLY PAYMENT |
            | SK0971 5039 | Herbal leys (CSAM3)                                          | 1.5000 ha | £336.00        |
            |             | Manage grassland with very low nutrient inputs (CLIG3)       | 0.3174 ha | £47.93         |
            |             | Manage scrub and open habitat mosaics (SCR2)                 | 0.7500 ha | £262.50        |
            |             | Subtotal                                                     |           | £646.43        |
        And should see total yearly payment "£646.43"

        # remove the last remaining land parcel
        When the user clicks the remove parcel link for parcel "SK0971 5039"
        Then the user should be at URL "remove-parcel"
        And should see "Land parcel SK0971 5039 and all related actions will be removed from your application."
        When the user clicks button "Remove this land parcel"

        # confirm-land-and-actions, last parcel removed - stays on this page rather than navigating to select-land-parcel
        Then the user should be at URL "confirm-land-and-actions"
        And should see a notification banner saying "SK0971 5039 and its actions have been removed."
        And should see "You removed the last land parcel. You must add at least one land parcel to continue your application."
        When the user clicks on "Select a land parcel and add actions"

        # RULE: a land parcel with no eligible action is rejected on the map page
        Then the user should be at URL "select-land-parcel"
        When the user selects parcel "SK0972 7313" of area "0.2460" hectares on the map
        And continues
        Then the user should still be at URL "select-land-parcel"
        And should see the following error messages
            | There are no eligible actions for parcel SK0972 7313.                              |
            | Change the parcel land cover or choose a different parcel to view eligible actions. |
