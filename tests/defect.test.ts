
import { describe, it, expect, vi, beforeEach } from "vitest";
import { effectiveStatus } from "@/lib/catalogue-status";
import { deleteCatalogue } from "@/app/admin/actions";
// Mock dependencies used by the server action
const { currentActorMock, isAdminMock, deleteMock } = vi.hoisted(() => ({
  currentActorMock: vi.fn(),
  isAdminMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock("@/auth-guards", () => ({
  currentActor: currentActorMock,
  isAdmin: isAdminMock,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    catalogue: {
      delete: deleteMock,
    },
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/auth", () => ({
  signOut: vi.fn(),
}));

vi.mock("@/lib/incomplete", () => ({
  findIncompleteProducts: vi.fn(),
  incompleteMessage: vi.fn(),
}));



describe("Defect Regression Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =====================================================
  // DEFECT-001: Catalogue Expiry Logic
  // =====================================================

  describe("DEFECT-001: Catalogue Expiry Logic", () => {
    it("should remain published when expiry date is in the future", () => {
      const currentDate = new Date();
      const futureDate = new Date(
        currentDate.getTime() + 24 * 60 * 60 * 1000
      );

      const result = effectiveStatus("published", futureDate);

      expect(result).toBe("published");
    });

    it("should become expired when expiry date is in the past", () => {
      const currentDate = new Date();
      const pastDate = new Date(
        currentDate.getTime() - 24 * 60 * 60 * 1000
      );

      const result = effectiveStatus("published", pastDate);

      expect(result).toBe("expired");
    });
  });

  // =====================================================
  // DEFECT-002: Staff Catalogue Deletion Authorization
  // =====================================================

  describe("DEFECT-002: Staff Catalogue Deletion Authorization", () => {
    it("should prevent Staff users from deleting a catalogue", async () => {
      const catalogueId =
        "0dbf6c0f-f91e-4a6a-a70d-a195d03f5efb";

      currentActorMock.mockResolvedValue({
        id: "staff-user-id",
        email: "staff@catalogue.test",
        role: "staff",
      });

      isAdminMock.mockReturnValue(false);

      deleteMock.mockResolvedValue({
        slug: "dummy-sanket",
        name: "dummy_sanket",
      });

      const result = await deleteCatalogue(catalogueId);

      expect(result).toHaveProperty("error");
      expect(deleteMock).not.toHaveBeenCalled();
    });
  });
});