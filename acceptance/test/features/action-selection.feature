Feature: Action Selection
@runme
    Scenario: Select an action for a land parcel
        Given there is no application data for SBI "300000003" and grant "example-grant-with-map"

        # start
        Given the user navigates to "/example-grant-with-map"
        And logs in as CRN "1300000003"
        Then the user should see heading "Apply for Example Grant with Map"
        When the user clicks on "Start now"

        # select-land-parcel
        Then the user should be at URL "select-land-parcel"
        And should see heading "Select a land parcel"
        When the user selects parcel "SD5551-1107" of area "21.5106" hectares on the map
        And continues

        # select-actions-for-land-parcel
        Then the user should be at URL "select-actions-for-land-parcel"
        And should see heading "Select actions for this land parcel"
        And should see the following selected land parcel
            | FIELD             | VALUE            |
            | Parcel reference  | SD5551 1107      |
            | Total area        | 21.5106 hectares |
        And should see the following actions with guidance
            | ACTION | GUIDANCE                          |
            | CLIG3  | Payment rate per year: £151.00/ha |
            |        | Requires SSSI consent             |
            |        | 21.5106 hectares available        |
            | CSAM3  | Payment rate per year: £224.00/ha |
            |        | 0.0639 hectares available         |
