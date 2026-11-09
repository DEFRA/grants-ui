Feature: Mapping

    Scenario: User selects land parcels from a map
        Given there is no application data for SBI "800000012" and grant "example-grant-with-map"

        # start
        Given the user navigates to "/example-grant-with-map"
        And logs in as CRN "9000000014"
        Then the user should see heading "Apply for Example Grant with Map"
        When the user clicks on "Start now"

        # select-land-parcel
        Then the user should be at URL "select-land-parcel"
        And should see heading "Select a land parcel"
        Given the map has the following land parcels available for selection
            | PARCEL      | HECTARES |
            | SD6352-8774 | 11.1006  |
            | SD6351-8781 | 68.0498  |
        Then the user should see "Test Juniper Fold Farm" has 2 available land parcels totalling "79.1504" hectares

        # select a land parcel
        When the user selects parcel "SD6351 8781" of area "68.0498" hectares on the map
        Then the user should see "SD6351 8781" totalling "68.0498" hectares in the selected parcel summary

        # clear selection
        When the user decides to change their selected parcel
        Then the user should not see a selected parcel summary

        # select a different land parcel. SD6352 8774 is carried forward because
        # SD6351 8781 has no action with land left, so Continue is rejected here.
        When the user selects parcel "SD6352 8774" of area "11.1006" hectares on the map
        Then the user should see "SD6352 8774" totalling "11.1006" hectares in the selected parcel summary
        And continues

        # select-actions-for-land-parcel
        Then the user should be at URL "select-actions-for-land-parcel"
        And should see heading "Select actions for this land parcel"

    Scenario: User exiting without choosing actions should resume on the select land parcel page
        Given there is no application data for SBI "800000023" and grant "example-grant-with-map"

        # start
        Given the user navigates to "/example-grant-with-map"
        And logs in as CRN "9000000032"
        Then the user should see heading "Apply for Example Grant with Map"
        When the user clicks on "Start now"

        # select-land-parcel
        Then the user should be at URL "select-land-parcel"
        And should see heading "Select a land parcel"
        # WBD1_26 is available on this parcel, so Continue reaches action selection.
        Given the map has the following land parcels available for selection
            | PARCEL      | HECTARES |
            | SD5349-3815 | 6.3614   |
        When the user selects parcel "SD5349 3815" of area "6.3614" hectares on the map
        Then the user should see "SD5349 3815" totalling "6.3614" hectares in the selected parcel summary
        And continues

        # select-actions-for-land-parcel
        Then the user should be at URL "select-actions-for-land-parcel"
        # no action selected

        # reload the browser session and resume the journey
        Given the user starts a new browser session
        And navigates to "/example-grant-with-map"
        And logs in as CRN "9000000032"

        # resume should return to select-land-parcel, not select-actions-for-land-parcel
        Then the user should be at URL "select-land-parcel"

    Scenario: User selects land parcels from the text list alternative to the map
        Given there is no application data for SBI "800000032" and grant "example-grant-with-map"

        # start
        Given the user navigates to "/example-grant-with-map"
        And logs in as CRN "9000000041"
        Then the user should see heading "Apply for Example Grant with Map"
        When the user clicks on "Start now"

        # select-land-parcel, map view by default
        Then the user should be at URL "select-land-parcel"
        And should see heading "Select a land parcel"
        And should see the land parcels on a map

        # switch to the list view
        When the user clicks on "View parcels as a list"
        Then the user should see the following land parcels as a list
            | PARCEL      | TOTAL AREA  | STATUS |
            | NY1215 1016 | 308.6793 ha |        |
            | SD5349 3815 | 6.3614 ha   |        |
            | SD6251 8952 | 0.7196 ha   |        |
        And should see "Test Hawthorn Gill Farm" has 3 available land parcels totalling "315.7603" hectares

        # selecting a parcel expands its details
        When the user selects "NY1215 1016"
        Then the user should see the following details for land parcel "NY1215 1016" in the list
            | FIELD             | VALUE       |
            | Total area        | 308.6793 ha |
            | Available actions | 5           |
        And should see the following requirements for land parcel "NY1215 1016" in the list
            | Some actions require:                                  |
            | site of special scientific interest (SSSI) consent     |
            | a Historic Environment Farm Environment Record (HEFER) |

        # select a different parcel
        When the user selects "SD5349 3815"
        Then the user should see the following details for land parcel "SD5349 3815" in the list
            | FIELD             | VALUE     |
            | Total area        | 6.3614 ha |
            | Available actions | 1         |
        And should see the following requirements for land parcel "SD5349 3815" in the list
            | Some actions require:                              |
            | site of special scientific interest (SSSI) consent |
        And continues

        # select-actions-for-land-parcel
        Then the user should be at URL "select-actions-for-land-parcel"
        And should see the following selected land parcel
            | FIELD            | VALUE           |
            | Parcel reference | SD5349 3815     |
            | Total area       | 6.3614 hectares |
        When the user selects action "WBD1_26"
        And enters "1" ponds for action "WBD1_26"
        And continues

        # confirm-land-and-actions
        Then the user should be at URL "confirm-land-and-actions"
        When the user clicks on "Add another land parcel"

        # select-land-parcel, the list view is remembered and the added parcel is tagged
        Then the user should be at URL "select-land-parcel"
        And should see the following land parcels as a list
            | PARCEL      | TOTAL AREA  | STATUS               |
            | NY1215 1016 | 308.6793 ha |                      |
            | SD5349 3815 | 6.3614 ha   | Added to application |
            | SD6251 8952 | 0.7196 ha   |                      |
