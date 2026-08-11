Feature: Mapping

    Scenario: User selects land parcels from a map
        Given there is no application data for SBI "106842593" and grant "example-grant-with-map"

        # start
        Given the user navigates to "/example-grant-with-map"
        And logs in as CRN "1100945520"
        Then the user should see heading "Apply for Example Grant with Map"
        When the user clicks on "Start now"

        # select-land-parcel
        Then the user should be at URL "select-land-parcel"
        Given the map has the following land parcels available for selection
            | PARCEL      | HECTARES |
            | SD6352-8774 | 11.1006  |
            | SD6351-8781 | 68.0498  |
        Then the user should see "Wilson Arable Crops" has 2 available land parcels totalling "79.1504" hectares

        # select a land parcel
        When the user selects parcel "SD6352-8774" of area "11.1006" hectares on the map
        Then the user should see "SD6352-8774" totalling "11.1006" hectares in the selected parcel summary

        # clear selection
        When the user decides to change their selected parcel
        Then the user should not see a selected parcel summary

        # select a different land parcel
        When the user selects parcel "SD6351-8781" of area "68.0498" hectares on the map
        Then the user should see "SD6351-8781" totalling "68.0498" hectares in the selected parcel summary
        And continues

        # select-actions-for-land-parcel
        Then the user should be at URL "select-actions-for-land-parcel"
        And should see heading "Select actions for this land parcel"

    Scenario: User exiting without choosing actions should resume on the select land parcel page
        Given there is no application data for SBI "106842593" and grant "example-grant-with-map"

        # start
        Given the user navigates to "/example-grant-with-map"
        And logs in as CRN "1100945520"
        Then the user should see heading "Apply for Example Grant with Map"
        When the user clicks on "Start now"

        # select-land-parcel
        Then the user should be at URL "select-land-parcel"
        Given the map has the following land parcels available for selection
            | PARCEL      | HECTARES |
            | SD6352-8774 | 11.1006  |
            | SD6351-8781 | 68.0498  |
        And the user selects parcel "SD6352-8774" of area "11.1006" hectares on the map
        Then the user should see "SD6352-8774" totalling "11.1006" hectares in the selected parcel summary
        And continues

        # select-actions-for-land-parcel
        Then the user should be at URL "select-actions-for-land-parcel"
        # no action selected

        # reload the browser session and resume the journey
        Given the user starts a new browser session
        And navigates to "/example-grant-with-map"
        And logs in as CRN "1100945520"

        # resume should return to select-land-parcel, not select-actions-for-land-parcel
        Then the user should be at URL "select-land-parcel"
