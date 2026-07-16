# grants-ui

A YAML-configured DEFRA grants application service for rendering form journeys, collecting submissions, and integrating with grant administration systems.

## Language

**Grant**
A conditional payment or financial assistance programme offered by DEFRA for a specific farming, land, woodland, or rural activity.
_Avoid_: Loan, Benefit, Entitlement, Reward

**Grant application**
The farmer or business user's in-progress or submitted request for a grant, including answers, status, reference numbers, and submission metadata.
_Avoid_: Claim, Case, Order, Ticket

**Grant journey**
The end-to-end user flow for one grant, from start page through questions, review, declaration, submission, and post-submission pages.
_Avoid_: Wizard, Survey, Questionnaire, Funnel

**Form definition**
A grants-ui-backend supplied description of a grant journey, including pages, components, validation, task lists, redirects, and metadata.
_Avoid_: Template, Schema, Form code, Screen config

**Grant code**
The stable identifier used to connect a Grants UI journey to external grant definitions and submission handling.
_Avoid_: Slug, Name, Reference number, Campaign ID

**Slug**
The URL-facing identifier for a grant journey, used in paths such as `/{slug}/start`.
_Avoid_: Grant code, Route ID, Form name

**GAS**
The Grants Application Service, the external service that stores grant definitions, accepts submitted application payloads, and returns administration statuses.
_Avoid_: Grants UI Backend, Casework, Payment service

**Grants UI Backend**
The persistence API used by Grants UI to save and fetch form state so users can refresh, leave, and return to an application, and to serve grant form definitions for configured slugs.
_Avoid_: GAS, Redis, DAL

**Application status**
The Grants UI status that represents where an application is in its lifecycle, such as `CLEARED`, `SUBMITTED`, or `REOPENED`.
_Avoid_: GAS status, Task status, HTTP status, Page state

**GAS status**
The status returned by GAS for a submitted application, such as `APPLICATION_AMEND` or `APPLICATION_WITHDRAWN`, used to decide redirects and local status transitions.
_Avoid_: Application status, Task status, Page status

**Submitted**
The application status after the user completes the declaration and Grants UI sends the application to GAS.
_Avoid_: Completed, Closed, Sent, Finished

**Reopened**
The application status used when a submitted application needs amendments and the user should return to the journey to update answers.
_Avoid_: Draft, Unsubmitted, Open, Reset

**Cleared**
The application status used when the local application state should be treated as clear for a new or withdrawn journey.
_Avoid_: Deleted, Cancelled, Empty, Archived

**Reference number**
The user-facing identifier for an application submission, shown on confirmation and print views.
_Avoid_: Grant code, Slug, Case ID, SBI

**Client reference**
The reference sent to GAS when querying or submitting an application; for reopened journeys it may use the previous reference number.
_Avoid_: Reference number when discussing user display, Case ID, Session ID

**CRN**
Customer Reference Number: the Defra ID identifier for an individual user, used in authentication and access checks.
_Avoid_: SBI, User ID, Contact ID, Account number

**SBI**
Single Business Identifier: the identifier for the farm business or organisation represented by the signed-in user.
_Avoid_: CRN, Business name, Holding number, Parcel ID

**Organisation ID**
An external Defra ID, Siti Agri, or audit-schema contract term for an organisation identifier. Inside Grants UI, use SBI for the signed-in business identifier; do not treat `organisationId` as an SBI alias. In `audit.accounts`, `organisationId` means the primary key from the customer database.
_Avoid_: SBI when naming internal state keys or view variables, CRN, Relationship ID

**Relationship ID**
The Defra ID relationship selector value that identifies which user-to-business relationship is active for the current sign-in.
_Avoid_: SBI, Organisation ID, CRN

**SSO organisation ID**
The `ssoOrgId` query hint passed between services so Defra ID can preselect an organisation relationship during sign-in.
_Avoid_: SBI, Organisation ID, Relationship ID once the user is authenticated

**Whitelist**
A grant-specific access list of allowed CRNs or SBIs that determines whether a signed-in user can enter a journey.
_Avoid_: Allowlist unless renaming the feature, Permission, Role, Feature flag

**Task list**
A structured progress page that groups a grant journey into sections and tasks, showing whether work is not started, unavailable, or completed.
_Avoid_: Dashboard, Checklist, Menu, Summary page

**Task**
A configured unit of work in a task list, usually backed by one or more form pages whose required answers determine completion.
_Avoid_: Page, Step, Section, Component

**Section**
A named grouping of related tasks within a task list, such as applicant details or business information.
_Avoid_: Category, Chapter, Page group, Tab

**Check answers**
The review page where users inspect and change entered answers before declaration and submission.
_Avoid_: Summary when referring to user-facing copy, Confirmation, Declaration

**Declaration**
The final pre-submission page where the user confirms the truth of their answers and submits the application.
_Avoid_: Confirmation, Consent, Agreement, Check answers

**Confirmation**
The post-submission page showing that an application has been submitted, usually including reference number and next steps.
_Avoid_: Declaration, Success screen, Receipt, Summary

**Terminal page**
An end-of-journey page shown when a user cannot or should not continue, often due to eligibility or access rules.
_Avoid_: Error page, Confirmation, Dead end, Failure page

**Landing page**
An off-journey interstitial page reached by redirect rule or direct link to explain an application state before sending the user onward.
_Avoid_: Start page, Terminal page, Marketing page, Summary page

**State guard**
A configured rule that prevents access to a route unless required form state exists or matches an expected value.
_Avoid_: Permission, Validation, Redirect rule, Feature flag

**Grant redirect rule**
A configured mapping from Grants UI status and GAS status to a new Grants UI status and destination path.
_Avoid_: Route, State guard, Permission rule, Navigation link

**Land parcel**
A registered area of land associated with a user's SBI, selected in land-grant journeys and used for action and payment calculations.
_Avoid_: Field, Plot, Property, Holding

**Payment**
The calculated grant amount shown to a user, often derived from selected land parcels, actions, and payment strategy rules.
_Avoid_: Invoice, Fee, Charge, Salary

**Agreement**
The downstream arrangement or service reached after certain offer statuses, distinct from the grant application journey itself.
_Avoid_: Declaration, Contract when unspecified, Payment, Submission
