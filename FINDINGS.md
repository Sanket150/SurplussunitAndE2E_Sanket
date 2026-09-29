# FINDINGS.md

## DEFECT-001: Incorrect Catalogue Expiry Logic

**Category:** Functional / Business Logic
**Severity:** High

### Description

The catalogue expiry logic uses an incorrect date comparison. A published catalogue with a future validity date is incorrectly marked as expired, while a catalogue whose validity date has passed remains published.

### Steps to Reproduce

1. Log in as Admin.
2. Navigate to the catalogue management section.
3. Create or edit a catalogue.
4. Set its status to Published.
5. Set the validity date to tomorrow.
6. Save the catalogue and observe its displayed status.
7. Repeat with a validity date in the past.

### Expected Behavior

* A published catalogue with a future validity date should remain Published.
* A published catalogue whose validity date has passed should be marked Expired.

### Actual Behavior

* Future-dated catalogue is marked Expired.
* Past-dated catalogue remains Published.

### Business Impact

Buyers may be unable to access valid catalogues, resulting in lost enquiries and potential revenue. Expired catalogues may also remain available when they should no longer be accessible.

### Automated Test

File: `tests/defect.test.ts`

Test cases:

* `should remain published when expiry date is in the future`
* `should become expired when expiry date is in the past`

**Test Result:** Both tests failed against the current implementation, confirming the incorrect expiry behavior.

---

## DEFECT-002: Staff Can Delete Catalogues Without Admin Authorization

**Category:** Security / Authorization
**Severity:** High

### Description

The `deleteCatalogue()` server action checks whether a user is signed in but does not enforce an Admin role before performing the database deletion. Consequently, a Staff user can invoke the deletion action.

### Steps to Reproduce

1. Log in using the Staff account:

   * Email: `staff@catalogue.test`
2. Identify a catalogue ID.
3. Invoke the `deleteCatalogue()` server action with a valid catalogue ID.
4. Observe the returned result.

### Expected Behavior

The server should verify that the requesting user has the Admin role before allowing catalogue deletion.

A Staff user should receive an authorization error, and the database deletion operation should not execute.

### Actual Behavior

The server action returns a successful deletion result for a Staff user.

The automated test returned:

`{ ok: true, name: 'dummy_sanket' }`

### Business Impact

An unauthorized Staff user could delete catalogues, potentially causing loss of product information, business disruption, and loss of buyer access to catalogue data.

### Automated Test

File: `tests/defect.test.ts`

Test case:

* `should prevent Staff users from deleting a catalogue`

**Test Result:** Failed because the action returned success instead of rejecting the Staff request.

The test uses mocked database dependencies, so no real catalogue was deleted during this test.

### Recommendation

Enforce Admin authorization inside the server action before executing the database deletion. UI restrictions alone are insufficient because server actions can be invoked independently of the UI.

---

## DEFECT-003: Staff Can Publish Through Catalogue Creation and Update

**Category:** Security / Authorization
**Severity:** High

### Description

The catalogue edit API and `createCatalogueWithProducts()` server action check only that a user is signed in. They do not enforce the Admin-only publishing rule. A Staff user can send a valid payload with `status: "published"` to the catalogue PATCH route, or `publish: true` to the create action, bypassing the role check in `setCatalogueStatus()` and the UI's hidden publishing control.

### Expected Behavior

Staff may create or edit draft catalogues, but publishing must be rejected server-side. No update or create transaction should run for an unauthorized publish request.

### Automated Tests

Files: `tests/api-security.test.ts`, `tests/admin-actions-security.test.ts`

The Staff publish tests fail against the current implementation: the PATCH route returns 200 and the create action returns success.

### Recommendation

Apply an Admin role check in both server entry points whenever the requested catalogue state is published. Do not rely on the UI or a separate status action to protect the same capability.

---

## DEFECT-004: Draft and Expired Catalogue Search Data Is Public

**Category:** Security / Confidentiality
**Severity:** High

### Description

The public catalogue search route retrieves the catalogue status and validity date but does not use them before returning matching listing IDs, product names, SKUs, and offer prices. A caller who knows a draft or expired catalogue slug can query its contents without signing in.

### Steps to Reproduce

1. Start the app with the seeded local database.
2. Request `/api/catalogues/festive-overstock-2026/search?q=Atlas` while signed out.
3. Observe that the response includes matching product data even though the catalogue is draft. Repeat with an expired catalogue slug.

### Expected Behavior

Only published catalogues whose validity has not passed should return search results.

### Automated Test

File: `tests/api-security.test.ts`

Draft and expired search tests fail because the route returns 200 and queries the listings.

---

## DEFECT-005: Enquiries Can Be Created for Draft or Expired Catalogues

**Category:** Security / Business Logic
**Severity:** High

### Description

The public enquiry endpoint validates the catalogue ID and listing membership but never checks the catalogue's publication status or validity date. A caller can submit an enquiry directly for a product in a draft or expired catalogue, bypassing the normal buyer-facing catalogue availability.

### Expected Behavior

Reject the request before creating an enquiry unless the catalogue is published and has not expired.

### Automated Test

File: `tests/api-security.test.ts`

The draft and expired submission tests fail: the endpoint currently creates the enquiry and responds with 201.

---

## DEFECT-006: Listing Mutations Do Not Scope IDs to the Catalogue in the URL

**Category:** Security / Data Integrity
**Severity:** Medium

### Description

The listing PATCH and DELETE routes confirm that the catalogue in the URL exists, but then update or delete a listing using only `listingId`. They do not include the URL's catalogue ID in the mutation filter. Supplying a valid listing ID from another catalogue can therefore mutate that other catalogue's listing while the request is addressed to the first catalogue.

### Expected Behavior

The listing mutation should be scoped by both `id: listingId` and `catalogueId: id`. A mismatch should return 404 without changing any listing.

### Automated Test

File: `tests/api-security.test.ts`

The cross-catalogue PATCH and DELETE tests fail because the routes report success and issue unscoped mutations.
