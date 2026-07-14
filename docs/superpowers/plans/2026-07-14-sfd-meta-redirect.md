# SFD Meta Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route users who need to update their details through the `/update-details` GET document, where an immediate meta refresh navigates to SFD and a plain link provides the fallback.

**Architecture:** Keep the generic forms-engine POST lifecycle deterministic by proceeding to the existing injected terminal page in both feature-flag states. The terminal page controller owns validated SFD URL construction, while `incorrect-details.njk` selects either the SFD redirect/fallback variant or the existing RPA guidance variant.

**Tech Stack:** Node.js 24, ES modules, Hapi, Defra Forms Engine, Nunjucks, Vitest, Cheerio

## Global Constraints

- Preserve the existing `ssoOrgId` query parameter behavior using `request.auth.credentials.currentRelationshipId`.
- Do not persist the configured confirmation field with the value `false` on the SFD-enabled path.
- Set `checkDetailsChangesPending: true` before navigating to `/update-details` when SFD is enabled.
- Do not return an external redirect from the check-details POST.
- The meta refresh is the primary SFD navigation; the `Update details` anchor is the fallback.
- Do not add a dedicated Hapi route or broaden the `form-action` Content Security Policy.
- Preserve the current incorrect-details content when SFD is disabled.
- Do not mutate `context.state` in place.
- Use ES modules, 2-space indentation, single quotes, no semicolons, and no trailing commas.

---

## File Map

- Modify `src/server/details-page/check-details.controller.js`: register the terminal page for both flag states, move SFD URL construction to its GET controller, and make the POST proceed internally.
- Modify `src/server/details-page/check-details.controller.test.js`: cover forms-engine navigation, state persistence, SFD URL construction, and invalid configuration.
- Modify `src/server/details-page/views/incorrect-details.njk`: add the head meta refresh and the link-only SFD body variant.
- Create `src/server/details-page/views/incorrect-details.test.js`: render the full Nunjucks page and assert primary/fallback navigation and content isolation.

### Task 1: Route SFD-enabled POSTs through `/update-details`

**Files:**

- Modify: `src/server/details-page/check-details.controller.js:128-197,249-280`
- Test: `src/server/details-page/check-details.controller.test.js:393-491,690-745`

**Interfaces:**

- Consumes: `CheckDetailsController.isSfdEnabled`, `this.setState(request, state)`, `this.getNextPath(context)`, and `this.proceed(request, h, path)`.
- Produces: an injected `UpdateDetailsPageController` for every check-details model and an internal forms-engine redirect after SFD-enabled POSTs.

- [ ] **Step 1: Replace the direct-redirect test with the desired internal-navigation test**

Replace the SFD-enabled test in `confirmationValue === false` with:

```js
it('should save pending state and proceed to update-details when sfd.enabled is true', async () => {
  vi.mocked(config.get).mockImplementation((key) => {
    if (key === 'externalLinks.sfd.enabled') {
      return true
    }
    return undefined
  })
  const sfdModel = { ...mockModel, lists: [], pages: [], def: { ...mockModel.def, pages: [] } }
  const sfdController = new CheckDetailsController(sfdModel, mockPageDef)
  setupControllerMocks(sfdController)
  mockContext.state = { someState: 'value', detailsConfirmed: true }
  mockContext.payload = { detailsConfirmed: false }

  const result = await sfdController.makePostRouteHandler()(mockRequest, mockContext, mockH)

  expect(sfdController.setState).toHaveBeenCalledWith(mockRequest, {
    someState: 'value',
    checkDetailsChangesPending: true
  })
  expect(sfdController.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
  expect(mockH.redirect).not.toHaveBeenCalled()
  expect(result).toBe('redirected')
})
```

Replace `should not inject update-details when sfd.enabled is true` with:

```js
it('should inject update-details when sfd.enabled is true', () => {
  vi.mocked(config.get).mockImplementation((key) => {
    if (key === 'externalLinks.sfd.enabled') {
      return true
    }
    return undefined
  })

  const sfdModel = {
    ...mockModel,
    lists: [],
    pages: [],
    pageMap: new Map(),
    conditions: {},
    def: { ...mockModel.def, pages: [] }
  }
  const sfdController = new CheckDetailsController(sfdModel, mockPageDef)
  sfdModel.pages.push(sfdController)

  sfdController.ensureUpdateDetailsPage()

  expect(sfdModel.pages.some((page) => page.path === '/update-details')).toBe(true)
  expect(sfdModel.def.pages.some((page) => page.path === '/update-details')).toBe(true)
})
```

Delete the tests that expect falsy or malformed SFD URLs to fall through inside the POST handler; URL validation moves to `UpdateDetailsPageController` in Task 2.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npx vitest run src/server/details-page/check-details.controller.test.js
```

Expected: FAIL because the current POST calls `h.redirect(...)` and `ensureUpdateDetailsPage()` returns early while SFD is enabled.

- [ ] **Step 3: Implement internal navigation and unconditional terminal-page registration**

In `ensureUpdateDetailsPage()`, remove the `this.isSfdEnabled` early return and update its comments to state that both flag states use the terminal page.

Replace the SFD-enabled POST branch with:

```js
if (confirmationValue === false && this.isSfdEnabled) {
  // Do not persist detailsConfirmed: false. The forms engine must show check-details
  // again when the user returns from SFD.
  const { [this.confirmationFieldName]: _removed, ...stateWithoutConfirmation } = state
  await this.setState(request, { ...stateWithoutConfirmation, checkDetailsChangesPending: true })
  return this.proceed(request, h, this.getNextPath(context))
}
```

This removes `currentRelationshipId`, `externalLinks.sfd.updateUrl`, `URL.canParse`, `new URL`, logging, and `h.redirect` from the POST branch.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
npx vitest run src/server/details-page/check-details.controller.test.js
```

Expected: PASS with the updated controller test count and no warnings.

- [ ] **Step 5: Commit the routing change**

```bash
git add src/server/details-page/check-details.controller.js src/server/details-page/check-details.controller.test.js
git commit -S -m "fix(TGC-1472): route SFD updates through GET page"
```

### Task 2: Build the SFD destination in the terminal page controller

**Files:**

- Modify: `src/server/details-page/check-details.controller.js:17-44`
- Test: `src/server/details-page/check-details.controller.test.js:849-967`

**Interfaces:**

- Consumes: `config.get('externalLinks.sfd.enabled')`, `config.get('externalLinks.sfd.updateUrl')`, and `request.auth.credentials.currentRelationshipId`.
- Produces: `UpdateDetailsPageController.getSfdUpdateUrl(request): string | null` and the `sfdUpdateUrl` view-model property.

- [ ] **Step 1: Add failing controller tests for the SFD view model**

At the start of the `UpdateDetailsPageController` `beforeEach`, restore the default config mock so tests cannot leak flag values:

```js
vi.mocked(config.get).mockImplementation((key) => {
  if (key === 'externalLinks.sfd.enabled') {
    return false
  }
  if (key === 'externalLinks.sfd.updateUrl') {
    return 'http://localhost:3000/sfd/update-sbi'
  }
  return undefined
})
```

Update the existing disabled view assertions to include `sfdUpdateUrl: null`. Then add:

```js
it('should provide the SFD URL with ssoOrgId and suppress the back link when enabled', async () => {
  vi.mocked(config.get).mockImplementation((key) => {
    if (key === 'externalLinks.sfd.enabled') {
      return true
    }
    if (key === 'externalLinks.sfd.updateUrl') {
      return 'https://sfd.example/update?source=grants'
    }
    return undefined
  })
  vi.mocked(findFormBySlug).mockResolvedValue({
    title: 'Test Form',
    metadata: {
      incorrectDetailsContent: { heading: 'This content must not be rendered' },
      supportEmail: 'support@example.com'
    }
  })

  await updateController.makeGetRouteHandler()(mockRequest, mockContext, mockH)

  expect(mockH.view).toHaveBeenCalledWith('incorrect-details', {
    pageTitle: 'Update your details',
    serviceName: 'Test Form',
    serviceUrl: '/test-form',
    backLink: null,
    incorrectDetailsContent: { heading: 'This content must not be rendered' },
    supportEmail: 'support@example.com',
    sfdUpdateUrl: 'https://sfd.example/update?source=grants&ssoOrgId=REL123'
  })
})

it.each([
  ['missing', ''],
  ['malformed', 'not-a-valid-url']
])('should omit the SFD redirect when the update URL is %s', async (_description, updateUrl) => {
  vi.mocked(config.get).mockImplementation((key) => {
    if (key === 'externalLinks.sfd.enabled') {
      return true
    }
    if (key === 'externalLinks.sfd.updateUrl') {
      return updateUrl
    }
    return undefined
  })
  vi.mocked(findFormBySlug).mockResolvedValue({ title: 'Test Form', metadata: {} })

  await updateController.makeGetRouteHandler()(mockRequest, mockContext, mockH)

  expect(mockH.view).toHaveBeenCalledWith(
    'incorrect-details',
    expect.objectContaining({
      backLink: { href: '/test-form/check-details' },
      sfdUpdateUrl: null
    })
  )
  expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.SFD_UPDATE_URL_MISSING_ON_REDIRECT, { updateUrl }, mockRequest)
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npx vitest run src/server/details-page/check-details.controller.test.js
```

Expected: FAIL because `sfdUpdateUrl` is absent, the back link is still present, and invalid URL configuration is not checked by the terminal controller.

- [ ] **Step 3: Implement validated SFD URL construction**

Update `UpdateDetailsPageController` to contain:

```js
export class UpdateDetailsPageController extends TerminalPageController {
  getSfdUpdateUrl(request) {
    if (!config.get('externalLinks.sfd.enabled')) {
      return null
    }

    const updateUrl = config.get('externalLinks.sfd.updateUrl')?.trim()

    if (!updateUrl || !URL.canParse(updateUrl)) {
      log(LogCodes.SYSTEM.SFD_UPDATE_URL_MISSING_ON_REDIRECT, { updateUrl: updateUrl ?? '' }, request)
      return null
    }

    const url = new URL(updateUrl)
    url.searchParams.set('ssoOrgId', request.auth.credentials.currentRelationshipId)
    return url.toString()
  }

  makeGetRouteHandler() {
    return async (request, _context, h) => {
      const { slug } = request.params
      const form = await findFormBySlug(slug)
      const formMetadata = /** @type {Record<string, unknown>} */ (form?.metadata ?? {})
      const modelMetadata = /** @type {Record<string, unknown>} */ (this.model.def.metadata ?? {})
      const metadata = { ...formMetadata, ...modelMetadata }
      const sfdUpdateUrl = this.getSfdUpdateUrl(request)

      return h.view('incorrect-details', {
        pageTitle: 'Update your details',
        serviceName: this.model.def.name ?? form?.title,
        serviceUrl: `/${slug}`,
        backLink: sfdUpdateUrl ? null : { href: `/${slug}/check-details` },
        incorrectDetailsContent: metadata.incorrectDetailsContent ?? null,
        supportEmail: metadata.supportEmail ?? null,
        sfdUpdateUrl
      })
    }
  }
}
```

Update the class comment to describe both the SFD redirect document and the existing SFD-disabled terminal content.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
npx vitest run src/server/details-page/check-details.controller.test.js
```

Expected: PASS, including both missing/malformed URL cases and existing-query preservation.

- [ ] **Step 5: Commit the terminal-controller change**

```bash
git add src/server/details-page/check-details.controller.js src/server/details-page/check-details.controller.test.js
git commit -S -m "feat(TGC-1472): prepare SFD redirect document"
```

### Task 3: Render the meta refresh and fallback link

**Files:**

- Modify: `src/server/details-page/views/incorrect-details.njk:1-48`
- Create: `src/server/details-page/views/incorrect-details.test.js`

**Interfaces:**

- Consumes: `sfdUpdateUrl: string | null` from `UpdateDetailsPageController`.
- Produces: a `<meta http-equiv="refresh" content="0; url=...">` in the document head and a single `Update details` anchor in the page content when the URL is present.

- [ ] **Step 1: Create failing full-page Nunjucks tests**

Create `src/server/details-page/views/incorrect-details.test.js`:

```js
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'cheerio'
import nunjucks from 'nunjucks'
import * as filters from '~/src/config/nunjucks/filters/filters.js'
import * as globals from '~/src/config/nunjucks/globals.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(dirname, '../../../..')
const environment = nunjucks.configure(
  [
    path.join(projectRoot, 'node_modules/govuk-frontend/dist'),
    dirname,
    path.join(projectRoot, 'src/server/common/components'),
    path.join(projectRoot, 'src/server/common/templates'),
    path.join(projectRoot, 'src/server/land-grants/components')
  ],
  { autoescape: true, trimBlocks: true, lstripBlocks: true }
)

Object.entries(globals).forEach(([name, global]) => environment.addGlobal(name, global))
Object.entries(filters).forEach(([name, filter]) => environment.addFilter(name, filter))

const renderPage = (viewModel) =>
  load(
    environment.render('incorrect-details.njk', {
      pageTitle: 'Update your details',
      serviceName: 'Test grant',
      serviceUrl: '/test-grant',
      breadcrumbs: [],
      cookiesPolicy: { confirmed: true },
      auth: {},
      ...viewModel
    })
  )

describe('incorrect-details view', () => {
  it('should use meta refresh as the primary SFD redirect and an anchor as fallback', () => {
    const sfdUpdateUrl = 'https://sfd.example/update?source=grants&ssoOrgId=REL123'
    const $ = renderPage({
      sfdUpdateUrl,
      incorrectDetailsContent: {
        heading: 'Incorrect details content',
        paragraphs: ['This must not be displayed'],
        showRpaSupport: true
      },
      supportEmail: 'support@example.com'
    })

    expect($('head meta[http-equiv="refresh"]').attr('content')).toBe(`0; url=${sfdUpdateUrl}`)
    expect($('main a[href="https://sfd.example/update?source=grants&ssoOrgId=REL123"]').text().trim()).toBe(
      'Update details'
    )
    expect($('main a')).toHaveLength(1)
    expect($('main form')).toHaveLength(0)
    expect($('main').text()).not.toContain('Incorrect details content')
    expect($('main').text()).not.toContain('This must not be displayed')
    expect($('main').text()).not.toContain('Contact the Rural Payments Agency')
  })

  it('should preserve the existing incorrect-details content when no SFD URL is provided', () => {
    const $ = renderPage({
      sfdUpdateUrl: null,
      incorrectDetailsContent: {
        heading: 'Update needed',
        paragraphs: ['Contact us to update your details.'],
        showRpaSupport: false
      }
    })

    expect($('head meta[http-equiv="refresh"]')).toHaveLength(0)
    expect($('main h1').text().trim()).toBe('Update needed')
    expect($('main').text()).toContain('Contact us to update your details.')
    expect($('main a').filter((_, element) => $(element).text().trim() === 'Update details')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the view test and verify RED**

Run:

```bash
npx vitest run src/server/details-page/views/incorrect-details.test.js
```

Expected: FAIL because no refresh meta element or SFD fallback anchor exists and normal incorrect-details content is still rendered.

- [ ] **Step 3: Implement the SFD-specific head and content blocks**

Add this block after the imports in `incorrect-details.njk`:

```njk
{% block head %}
  {{ super() }}
  {% if sfdUpdateUrl %}
    <meta http-equiv="refresh" content="0; url={{ sfdUpdateUrl }}">
  {% endif %}
{% endblock %}
```

Change the content block to select the link-only variant before the existing content:

```njk
{% block content %}
  {% call appTwoThirdsColumn() %}
    {% if sfdUpdateUrl %}
      <a class="govuk-link" href="{{ sfdUpdateUrl }}">Update details</a>
    {% elif incorrectDetailsContent %}
      <h1 class="govuk-heading-l">{{ incorrectDetailsContent.heading }}</h1>

      {% for p in incorrectDetailsContent.paragraphs %}
        {% if p is string %}
          <p class="govuk-body">{{ p }}</p>
        {% else %}
          <p class="govuk-body">{{ p.textBefore }}<a class="govuk-link" href="{{ p.link.href }}">{{ p.link.text }}</a>{{ p.textAfter }}</p>
        {% endif %}
      {% endfor %}

      {% if incorrectDetailsContent.showRpaSupport %}
        {{ defraSupportDetails({ typeOfSupport: 'update', email: supportEmail }) }}
      {% endif %}
    {% else %}
      <h1 class="govuk-heading-l">Contact the RPA to update your details</h1>

      <p class="govuk-body">
        You have indicated that your details are not correct.
      </p>

      <p class="govuk-body">
        You will need to contact the Rural Payments Agency (RPA) to let them know of any changes to your details before you can continue with your application.
      </p>

      {{ defraSupportDetails({ typeOfSupport: 'update', email: supportEmail }) }}

      <p class="govuk-body govuk-!-margin-top-6">
        Once your details have been updated, you can return to this service and continue with your application.
      </p>
    {% endif %}
  {% endcall %}
{% endblock %}
```

- [ ] **Step 4: Run the view and controller tests and verify GREEN**

Run:

```bash
npx vitest run src/server/details-page/views/incorrect-details.test.js src/server/details-page/check-details.controller.test.js
```

Expected: PASS for both files. Inspect the rendered-HTML assertions to confirm Nunjucks escaped query separators in source while Cheerio resolves the anchor and meta attribute values correctly.

- [ ] **Step 5: Commit the rendered redirect page**

```bash
git add src/server/details-page/views/incorrect-details.njk src/server/details-page/views/incorrect-details.test.js
git commit -S -m "feat(TGC-1472): render SFD meta redirect"
```

### Task 4: Verify the complete change

**Files:**

- Verify: all files changed since `c2eaddf9`

**Interfaces:**

- Consumes: the complete controller and template behavior from Tasks 1-3.
- Produces: formatting, lint, type, unit-test, and build evidence for handoff.

- [ ] **Step 1: Check formatting and repository whitespace**

Run:

```bash
npx prettier --check src/server/details-page/check-details.controller.js src/server/details-page/check-details.controller.test.js src/server/details-page/views/incorrect-details.njk src/server/details-page/views/incorrect-details.test.js
git diff --check c2eaddf9..HEAD
```

Expected: Prettier reports all four files use its code style; `git diff --check` emits no output.

- [ ] **Step 2: Run focused tests**

```bash
npx vitest run src/server/details-page/check-details.controller.test.js src/server/details-page/views/incorrect-details.test.js
```

Expected: both test files PASS with no failures.

- [ ] **Step 3: Run repository linting**

```bash
npm run lint
```

Expected: JavaScript, SCSS, and TypeScript lint/type checks all exit 0.

- [ ] **Step 4: Run the broader unit suite**

```bash
npm run test:unit
```

Expected: all unit test files PASS. Any unrelated pre-existing failure must be reported separately and not hidden.

- [ ] **Step 5: Build production assets**

```bash
npm run build
```

Expected: frontend and server builds complete successfully.

- [ ] **Step 6: Review the final diff and signed commits**

```bash
git status --short
git diff --stat c2eaddf9..HEAD
git log --show-signature --oneline c2eaddf9..HEAD
```

Expected: the worktree is clean, the diff is limited to the planned controller/template/tests, and every implementation commit has a good signature.
