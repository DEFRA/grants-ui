Feature: Forms map dependency compatibility
    Exercise the installed map libraries through the production browser bundle.
    Map styles are served locally; map creation, plugins and events are real.

    Scenario: Location maps support saved answers, input changes, marker placement and help options
        Given the forms map compatibility fixture is open
        Then the installed map dependencies should support the location adapter
