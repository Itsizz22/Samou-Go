import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateOptionGroup } from "./options.service";
const h = vi.hoisted(() => {
  const saved = {
    id: "g",
    productId: "p",
    name: "صلصات",
    kind: "ADDON",
    required: false,
    minSelect: 0,
    maxSelect: 2,
    sortOrder: 0,
    items: [
      {
        id: "i",
        groupId: "g",
        name: "ثوم",
        price: 2,
        sortOrder: 0,
        isActive: true,
        isDefault: false,
        imageUrl: null,
      },
    ],
    product: { storeId: "s" },
  };
  const tx = {
    productOptionItem: {
      deleteMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    productOptionGroup: {
      findUnique: vi.fn().mockResolvedValue(saved),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
  };
  return { saved, tx };
});
vi.mock("../../lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: typeof h.tx) => Promise<unknown>) => fn(h.tx),
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  h.tx.productOptionGroup.findUnique.mockResolvedValue(h.saved);
});
const actor = { sub: "admin", role: "ADMIN" };
describe("editing customization", () => {
  it("updates retained option IDs without deleting them", async () => {
    await updateOptionGroup(actor, "s", "g", {
      name: "صلصات جديدة",
      items: [{ id: "i", name: "ثوم جديد", price: 3 }],
    });
    expect(h.tx.productOptionItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "i" },
        data: expect.objectContaining({ name: "ثوم جديد", price: 3 }),
      }),
    );
    expect(h.tx.productOptionItem.deleteMany).toHaveBeenCalledWith({
      where: { groupId: "g", id: { notIn: ["i"] } },
    });
  });
  it("rejects an option ID from another group", async () => {
    await expect(
      updateOptionGroup(actor, "s", "g", {
        items: [{ id: "foreign", name: "خيار", price: 0 }],
      }),
    ).rejects.toMatchObject({ code: "INVALID_OPTION" });
    expect(h.tx.productOptionItem.deleteMany).not.toHaveBeenCalled();
  });
  it("rejects negative prices", async () => {
    await expect(
      updateOptionGroup(actor, "s", "g", {
        items: [{ name: "خيار", price: -1 }],
      }),
    ).rejects.toMatchObject({ code: "INVALID_OPTIONS" });
  });
  it("rejects impossible limits", async () => {
    await expect(
      updateOptionGroup(actor, "s", "g", { minSelect: 3, maxSelect: 1 }),
    ).rejects.toMatchObject({ code: "MIN_GT_MAX" });
  });
  it("does not allow another store to modify a group", async () => {
    await expect(
      updateOptionGroup(actor, "other", "g", { name: "x" }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it("requires exactly one size and positive full prices", async () => {
    await updateOptionGroup(actor, "s", "g", {
      kind: "SIZE",
      items: [{ id: "i", name: "كبير", price: 30 }],
    });
    expect(h.tx.productOptionGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          required: true,
          minSelect: 1,
          maxSelect: 1,
          kind: "SIZE",
        }),
      }),
    );
  });
  it("fixed ingredients cannot add extra charges", async () => {
    await expect(
      updateOptionGroup(actor, "s", "g", {
        kind: "FIXED",
        items: [{ id: "i", name: "ثوم", price: 3 }],
      }),
    ).rejects.toMatchObject({ code: "INGREDIENT_PRICE" });
  });
});
