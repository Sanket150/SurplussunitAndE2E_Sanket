import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as searchAdminProducts } from "@/app/api/admin/products/search/route";
import { PATCH as updateCatalogue } from "@/app/api/admin/catalogues/[id]/route";
import {
  DELETE as deleteListing,
  PATCH as updateListing,
} from "@/app/api/admin/catalogues/[id]/listings/[listingId]/route";
import { GET as searchCatalogue } from "@/app/api/catalogues/[slug]/search/route";
import { POST as submitEnquiry } from "@/app/api/enquiries/route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  catalogueFindUnique: vi.fn(),
  catalogueUpdate: vi.fn(),
  listingFindMany: vi.fn(),
  listingUpdateMany: vi.fn(),
  listingDeleteMany: vi.fn(),
  enquiryCreate: vi.fn(),
  productFindMany: vi.fn(),
  findIncompleteProducts: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    catalogue: {
      findUnique: mocks.catalogueFindUnique,
      update: mocks.catalogueUpdate,
    },
    catalogueListing: {
      findMany: mocks.listingFindMany,
      updateMany: mocks.listingUpdateMany,
      deleteMany: mocks.listingDeleteMany,
    },
    enquiry: { create: mocks.enquiryCreate },
    product: { findMany: mocks.productFindMany },
  }),
}));
vi.mock("@/lib/incomplete", () => ({
  findIncompleteProducts: mocks.findIncompleteProducts,
  incompleteMessage: vi.fn(() => "Incomplete products."),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});

const catalogueId = "11111111-1111-4111-8111-111111111111";
const listingId = "33333333-3333-4333-8333-333333333333";
const productId = "44444444-4444-4444-8444-444444444444";

function staffSession() {
  return { user: { id: "staff-user", role: "staff" } };
}

function adminSession() {
  return { user: { id: "admin-user", role: "admin" } };
}

function validCatalogueEdit(status: "draft" | "published") {
  return {
    name: "A private catalogue",
    slug: "a-private-catalogue",
    description: "",
    category: "",
    notifyNumber: "",
    status,
    validUntil: null,
    banners: [],
  };
}

function validListing() {
  return {
    id: listingId,
    productId,
    product: {
      name: "Private product",
      sku: "PRIVATE-001",
      brand: "Private brand",
      offerPrice: "125.00",
      priceOnRequest: false,
      moq: 20,
      quantity: 100,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(null);
  mocks.findIncompleteProducts.mockResolvedValue([]);
  mocks.listingFindMany.mockResolvedValue([validListing()]);
  mocks.enquiryCreate.mockResolvedValue({});
});

describe("API access control regression tests", () => {
  it("rejects signed-out users from admin API routes before reading data", async () => {
    const response = await searchAdminProducts(
      new Request("http://localhost/api/admin/products/search?query=Atlas"),
    );

    expect(response.status).toBe(401);
    expect(mocks.productFindMany).not.toHaveBeenCalled();
  });

  it("does not allow Staff to publish through the catalogue PATCH API", async () => {
    mocks.auth.mockResolvedValue(staffSession());
    mocks.catalogueFindUnique.mockResolvedValue({ slug: "private", status: "draft" });
    mocks.catalogueUpdate.mockResolvedValue({
      id: catalogueId,
      name: "A private catalogue",
      slug: "private",
      description: "",
      category: null,
      status: "published",
      banners: [],
      notifyNumber: null,
      expiresAt: null,
      publishedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { listings: 0, enquiries: 0 },
      listings: [],
    });

    const response = await updateCatalogue(
      new Request("http://localhost/api/admin/catalogues", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validCatalogueEdit("published")),
      }),
      { params: Promise.resolve({ id: catalogueId }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.catalogueUpdate).not.toHaveBeenCalled();
  });

  it.each(["PATCH", "DELETE"] as const)(
    "does not let a listing ID from another catalogue be changed via %s",
    async (method) => {
      mocks.auth.mockResolvedValue(adminSession());
      mocks.catalogueFindUnique.mockResolvedValue({ slug: "catalogue-a" });
      const mutationResult = ({ where }: { where: { catalogueId?: string } }) => ({
        count: where.catalogueId === catalogueId ? 0 : 1,
      });
      mocks.listingUpdateMany.mockImplementation(async (args) => mutationResult(args));
      mocks.listingDeleteMany.mockImplementation(async (args) => mutationResult(args));

      const response = await (method === "PATCH" ? updateListing : deleteListing)(
        new Request("http://localhost/api/admin/catalogues", {
          method,
          ...(method === "PATCH"
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isVisible: false }),
              }
            : {}),
        }),
        { params: Promise.resolve({ id: catalogueId, listingId }) },
      );

      expect(response.status).toBe(404);
      const mutationMock = method === "PATCH" ? mocks.listingUpdateMany : mocks.listingDeleteMany;
      expect(mutationMock).toHaveBeenCalledWith({
        where: { id: listingId, catalogueId },
        ...(method === "PATCH" ? { data: { isVisible: false } } : {}),
      });
    },
  );

  it.each([
    ["draft", null],
    ["published", new Date("2020-01-01T00:00:00.000Z")],
  ])("does not expose search results for a %s catalogue", async (status, expiresAt) => {
    mocks.catalogueFindUnique.mockResolvedValue({
      id: catalogueId,
      status,
      expiresAt,
    });

    const response = await searchCatalogue(
      new Request("http://localhost/api/catalogues/hidden/search?q=Private"),
      { params: Promise.resolve({ slug: "hidden" }) },
    );

    expect(response.status).toBe(404);
    expect(mocks.listingFindMany).not.toHaveBeenCalled();
  });

  it.each([
    ["draft", null],
    ["published", new Date("2020-01-01T00:00:00.000Z")],
  ])("rejects enquiries for a %s catalogue", async (status, expiresAt) => {
    mocks.catalogueFindUnique.mockResolvedValue({
      status,
      expiresAt,
      notifyNumber: null,
    });

    const response = await submitEnquiry(
      new Request("http://localhost/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalogueId,
          name: "Test buyer",
          countryCode: "+91",
          phone: "9876543210",
          items: [{ productId, quantity: 20 }],
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(mocks.enquiryCreate).not.toHaveBeenCalled();
  });
});