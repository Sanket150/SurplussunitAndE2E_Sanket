import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as submitEnquiry } from "@/app/api/enquiries/route";
import { effectiveStatus } from "@/lib/catalogue-status";
import { autoMap, parseNumber, validateRows, type ParsedFile } from "@/lib/import-mapping";
import { discountPercent, needsPricesForSale, priceLabel } from "@/lib/pricing";

const mocks = vi.hoisted(() => ({
  listingFindMany: vi.fn(),
  catalogueFindUnique: vi.fn(),
  enquiryCreate: vi.fn(),
  notifyTeam: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    catalogueListing: { findMany: mocks.listingFindMany },
    catalogue: { findUnique: mocks.catalogueFindUnique },
    enquiry: { create: mocks.enquiryCreate },
  }),
}));

vi.mock("@/lib/notifications", () => ({ notifyTeam: mocks.notifyTeam }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});

const catalogueId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";

describe("pricing rules", () => {
  it("rounds the discount to the nearest whole percent", () => {
    expect(discountPercent({ priceOnRequest: false, mrp: 5999, offerPrice: 2499 })).toBe(58);
    expect(discountPercent({ priceOnRequest: false, mrp: 3, offerPrice: 2 })).toBe(33);
  });

  it("does not show a discount for request pricing or incomplete prices", () => {
    expect(discountPercent({ priceOnRequest: true, mrp: 100, offerPrice: 50 })).toBe(0);
    expect(discountPercent({ priceOnRequest: false, mrp: null, offerPrice: 50 })).toBe(0);
    expect(discountPercent({ priceOnRequest: false, mrp: 100, offerPrice: null })).toBe(0);
  });

  it("labels request pricing without exposing an offer price", () => {
    expect(priceLabel({ priceOnRequest: true, offerPrice: 125 }, String)).toBe("Price on Request");
    expect(priceLabel({ priceOnRequest: false, offerPrice: null }, String)).toBe("Price on enquiry");
    expect(needsPricesForSale({ priceOnRequest: true, mrp: null, offerPrice: null })).toBe(false);
    expect(needsPricesForSale({ priceOnRequest: false, mrp: 100, offerPrice: null })).toBe(true);
  });
});

describe("spreadsheet import mapping and validation", () => {
  it("maps common spreadsheet headings without assigning a field twice", () => {
    expect(autoMap(["Item Code", "Product Name", "Sale Price", "Qty", "Product"])).toEqual({
      "Item Code": "sku",
      "Product Name": "name",
      "Sale Price": "offerPrice",
      Qty: "quantity",
      Product: "attribute",
    });
  });

  it("parses currency-formatted values and rejects invalid numbers", () => {
    expect(parseNumber("₹ 1,299.50")).toBe(1299.5);
    expect(parseNumber("$2,499")).toBe(2499);
    expect(parseNumber("not a price")).toBeNull();
  });

  it("blocks missing, duplicate, and invalid-stock rows while retaining valid rows", () => {
    const file: ParsedFile = {
      name: "products.csv",
      sizeKB: 1,
      headers: ["SKU", "Product Name", "Quantity"],
      rows: [
        { SKU: "A-1", "Product Name": "Trolley", Quantity: "20" },
        { SKU: "A-1", "Product Name": "Duplicate", Quantity: "5" },
        { SKU: "B-2", "Product Name": "Bottle", Quantity: "1.5" },
        { SKU: "", "Product Name": "Missing SKU", Quantity: "10" },
      ],
    };

    const result = validateRows(file, autoMap(file.headers));

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ sku: "A-1", name: "Trolley", quantity: 20 });
    expect(result.issues).toHaveLength(3);
    expect(result.issues.every((issue) => issue.blocking)).toBe(true);
  });

  it("skips insecure image links with a non-blocking warning", () => {
    const file: ParsedFile = {
      name: "products.csv",
      sizeKB: 1,
      headers: ["SKU", "Product Name", "Quantity", "Image URL"],
      rows: [{ SKU: "A-1", "Product Name": "Trolley", Quantity: "20", "Image URL": "http://example.test/item.jpg" }],
    };

    const result = validateRows(file, autoMap(file.headers));

    expect(result.rows[0].imageUrl).toBeUndefined();
    expect(result.warnings).toBe(1);
    expect(result.issues).toMatchObject([{ blocking: false }]);
  });
});

describe("catalogue lifecycle", () => {
  it("keeps drafts and published catalogues without an expiry in their current states", () => {
    expect(effectiveStatus("draft", null)).toBe("draft");
    expect(effectiveStatus("published", null)).toBe("published");
  });

  it("keeps a future-dated catalogue published", () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(effectiveStatus("published", tomorrow)).toBe("published");
  });

  it("marks a published catalogue with a past validity date as expired", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(effectiveStatus("published", yesterday)).toBe("expired");
  });
});

function validEnquiry(overrides: Record<string, unknown> = {}) {
  return {
    catalogueId,
    name: "Test buyer",
    countryCode: "+91",
    phone: "9876543210",
    items: [{ productId, quantity: 20 }],
    ...overrides,
  };
}

function enquiryRequest(payload: unknown) {
  return new Request("http://localhost/api/enquiries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listingFindMany.mockResolvedValue([{
    id: "33333333-3333-4333-8333-333333333333",
    productId,
    product: {
      name: "Atlas cabin trolley",
      sku: "TRV-1024",
      brand: "Aristocrat",
      offerPrice: 2499,
      priceOnRequest: false,
      moq: 20,
      quantity: 480,
    },
  }]);
  mocks.catalogueFindUnique.mockResolvedValue({ notifyNumber: null });
  mocks.enquiryCreate.mockResolvedValue({});
});

describe("enquiry validation and price integrity", () => {
  it("rejects malformed contact details before querying or writing", async () => {
    const response = await submitEnquiry(enquiryRequest(validEnquiry({ phone: "", email: "" })));

    expect(response.status).toBe(400);
    expect(mocks.listingFindMany).not.toHaveBeenCalled();
    expect(mocks.enquiryCreate).not.toHaveBeenCalled();
  });

  it.each([19, 481])("rejects a requested quantity outside MOQ/stock limits (%i)", async (quantity) => {
    const response = await submitEnquiry(enquiryRequest(validEnquiry({
      items: [{ productId, quantity }],
    })));

    expect(response.status).toBe(400);
    expect(mocks.enquiryCreate).not.toHaveBeenCalled();
  });

  it("rejects a valid product ID that is not listed in the requested catalogue", async () => {
    mocks.listingFindMany.mockResolvedValue([]);

    const response = await submitEnquiry(enquiryRequest(validEnquiry()));

    expect(response.status).toBe(409);
    expect(mocks.enquiryCreate).not.toHaveBeenCalled();
  });

  it("persists the server-side product price rather than a client-supplied price", async () => {
    const response = await submitEnquiry(enquiryRequest(validEnquiry({
      items: [{ productId, quantity: 20, unitPrice: 0.01 }],
    })));

    expect(response.status).toBe(201);
    expect(mocks.enquiryCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        items: { create: [expect.objectContaining({ unitPrice: 2499 })] },
      }),
    }));
  });
});