Feature: Mapping

    Scenario: User selects a land parcel from an interactive map
        Given there is no application data for SBI "106842593" and grant "example-grant-with-map"

        # start
        Given the user navigates to "/example-grant-with-map"
        And logs in as CRN "1100945520"
        Then the user should see heading "Apply for Example Grant with Map"
        When the user clicks on "Start now"

        # select-land-parcel
        Then the user should be at URL "select-land-parcel"
        When the user selects parcel "SD6352-8774" on the map
        Then the user should see "SD6352-8774" in the selected parcel summary
        And continues

        # select-actions-for-land-parcel
        Then the user should be at URL "select-actions-for-land-parcel"
        And should see heading "Select actions for land parcel SD6352 8774"

    Scenario: User selects a parcel but leaves before choosing actions and resumes on the select land parcel page
        Given there is no application data for SBI "106842593" and grant "example-grant-with-map"

        # start
        Given the user navigates to "/example-grant-with-map"
        And logs in as CRN "1100945520"
        Then the user should see heading "Apply for Example Grant with Map"
        When the user clicks on "Start now"

        # select-land-parcel
        Then the user should be at URL "select-land-parcel"
        When the user selects parcel "SD6352-8774" on the map
        Then the user should see "SD6352-8774" in the selected parcel summary
        And continues

        # select-actions-for-land-parcel (leave without selecting any actions)
        Then the user should be at URL "select-actions-for-land-parcel"

        # reload the browser session and resume the journey
        Given the user starts a new browser session
        And navigates to "/example-grant-with-map"
        And logs in as CRN "1100945520"

        # resume should return to select-land-parcel, not check your answers
        Then the user should be at URL "select-land-parcel"
