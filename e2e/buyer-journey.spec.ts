
import { test, expect } from "@playwright/test";
import { createBuyerJourneyData } from "./fixtures/buyer-journey.data";

test("Buyer can submit an enquiry and Admin can view it in Leads Inbox", async ({
  page,
}) => {
  const testData = createBuyerJourneyData();

  // --------------------------------------------------
  // STEP 1: Open the published catalogue
  // --------------------------------------------------

  await page.goto(`/catalogue/${testData.catalogue.slug}`);

  await expect(
    page.getByRole("heading", { name: testData.catalogue.name })
  ).toBeVisible();

  // --------------------------------------------------
  // STEP 2: Browse and select a product
  // --------------------------------------------------

  await page.getByText(testData.product.name, { exact: true }).click();

  await expect(
    page.getByRole("heading", { name: testData.product.name })
  ).toBeVisible();

  // --------------------------------------------------
  // STEP 3: Open the enquiry form
  // --------------------------------------------------

  await page.getByRole("button", { name: /contact us/i }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Contact supplier", level: 2 })
  ).toBeVisible();

  // --------------------------------------------------
  // STEP 4: Enter buyer details
  // --------------------------------------------------

  await page.getByLabel(/your name/i).fill(testData.buyer.name);

  await page.getByLabel(/whatsapp number/i).fill(testData.buyer.phoneNumber);

  // Verify the seeded product's default quantity.
  await expect(page.locator("#contact-quantity")).toHaveValue(String(testData.product.quantity));

  // --------------------------------------------------
  // STEP 5: Submit the enquiry
  // --------------------------------------------------

  await page.getByRole("button", { name: /send enquiry/i }).click();

  // Verify successful submission.
  await expect(
    page.getByText("Enquiry sent")
  ).toBeVisible();

  // Capture the generated enquiry reference.
  const referenceText = page.getByText(/ENQ-\d+/);

  await expect(referenceText).toBeVisible();

  const enquiryReference = (await referenceText.textContent())?.trim();

  expect(enquiryReference).toMatch(/^ENQ-\d+$/);

  // --------------------------------------------------
  // STEP 6: Navigate to Admin login
  // --------------------------------------------------

  await page.goto("/login");

  await page.getByLabel("Email").fill(testData.admin.email);

  await page.getByLabel("Password").fill(testData.admin.password);

  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/admin/);

  // --------------------------------------------------
  // STEP 7: Open Admin Leads Inbox
  // --------------------------------------------------

  await page.goto("/admin/leads");

  await expect(
    page.getByRole("heading", { name: "Leads" })
  ).toBeVisible();

  // Search for the enquiry created by this test.
  await page
    .getByPlaceholder(/search buyer, reference/i)
    .fill(enquiryReference!);

  // --------------------------------------------------
  // STEP 8: Verify the submitted enquiry
  // --------------------------------------------------

  const leadRow = page
    .getByRole("row")
    .filter({ hasText: enquiryReference! });

  await expect(leadRow).toBeVisible();

  await expect(leadRow).toContainText(testData.buyer.name);

  await expect(leadRow).toContainText(testData.buyer.phoneNumber);

  await expect(leadRow).toContainText(testData.catalogue.name);

  await expect(leadRow).toContainText(`${testData.product.quantity} units`);

  await expect(leadRow).toContainText("New");
});