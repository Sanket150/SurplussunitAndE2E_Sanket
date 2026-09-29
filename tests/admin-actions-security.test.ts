import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCatalogueWithProducts } from "@/app/admin/catalogues/actions";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  transaction: vi.fn(),
  catalogueCreate: vi.fn(),
  listingCreateMany: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    $transaction: mocks.transaction,
  }),
}));
vi.mock("@/lib/incomplete", () => ({
  INCOMPLETE_PRODUCT_WHERE: {},
  incompleteMessage: vi.fn(() => "Incomplete products."),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const catalogueId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(null);
  mocks.catalogueCreate.mockResolvedValue({ id: catalogueId, slug: "private-catalogue" });
  mocks.listingCreateMany.mockResolvedValue({ count: 0 });
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      catalogue: { create: mocks.catalogueCreate },
      catalogueListing: { createMany: mocks.listingCreateMany },
    }),
  );
});

const publishInput = {
  name: "Private catalogue",
  slug: "private-catalogue",
  description: "",
  category: "",
  validUntil: null,
  banners: [],
  publish: true,
  productIds: [],
};

describe("Admin server action access control", () => {
  it("rejects a signed-out user before creating a catalogue", async () => {
    const result = await createCatalogueWithProducts(publishInput);

    expect(result).toHaveProperty("error");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not allow Staff to publish a catalogue", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "staff-user", role: "staff" },
    });

    const result = await createCatalogueWithProducts(publishInput);

    expect(result).toHaveProperty("error");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});