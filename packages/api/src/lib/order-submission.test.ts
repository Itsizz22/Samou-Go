import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => {
  type Row = {
    customerId: string;
    requestId: string;
    requestHash: string;
    response: string;
  };
  const rows = new Map<string, Row>();
  const key = (value: { customerId: string; requestId: string }) =>
    `${value.customerId}:${value.requestId}`;
  const adapter = (target: Map<string, Row>) => ({
    findUnique: async ({
      where,
    }: {
      where: {
        customerId_requestId: { customerId: string; requestId: string };
      };
    }) => target.get(key(where.customerId_requestId)) ?? null,
    create: async ({ data }: { data: Row }) => {
      if (target.has(key(data)))
        throw Object.assign(new Error("duplicate"), { code: "P2002" });
      target.set(key(data), data);
      return data;
    },
    update: async ({
      where,
      data,
    }: {
      where: {
        customerId_requestId: { customerId: string; requestId: string };
      };
      data: { response: string };
    }) => {
      const id = key(where.customerId_requestId);
      const row = target.get(id);
      if (!row) throw Error("missing");
      target.set(id, { ...row, ...data });
    },
  });
  return {
    rows,
    prisma: {
      orderSubmission: adapter(rows),
      $transaction: async <T>(
        work: (tx: {
          orderSubmission: ReturnType<typeof adapter>;
        }) => Promise<T>,
      ) => {
        const pending = new Map(rows);
        const result = await work({ orderSubmission: adapter(pending) });
        rows.clear();
        pending.forEach((value, id) => rows.set(id, value));
        return result;
      },
    },
  };
});
vi.mock("./prisma", () => ({ prisma: state.prisma }));
import { isReplayedSubmission, withOrderSubmission } from "./order-submission";
beforeEach(() => state.rows.clear());
describe("atomic checkout attempts", () => {
  it("replays an equivalent request without executing checkout twice", async () => {
    const work = vi.fn(async () => ({ id: "order-1" }));
    const first = await withOrderSubmission(
      "customer",
      "request",
      "single",
      { a: 1, b: 2 },
      work,
    );
    const second = await withOrderSubmission(
      "customer",
      "request",
      "single",
      { b: 2, a: 1 },
      work,
    );
    expect(second).toEqual(first);
    expect(work).toHaveBeenCalledTimes(1);
    expect(isReplayedSubmission(first)).toBe(false);
    expect(isReplayedSubmission(second)).toBe(true);
  });
  it("rejects reusing a key with another basket or operation", async () => {
    const work = vi.fn(async () => ({ id: "order-1" }));
    await withOrderSubmission(
      "customer",
      "request",
      "single",
      { quantity: 1 },
      work,
    );
    await expect(
      withOrderSubmission(
        "customer",
        "request",
        "single",
        { quantity: 2 },
        work,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      withOrderSubmission(
        "customer",
        "request",
        "multi",
        { quantity: 1 },
        work,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(work).toHaveBeenCalledTimes(1);
  });
  it("rolls back the attempt when checkout fails, allowing corrected retry", async () => {
    await expect(
      withOrderSubmission("customer", "request", "single", {}, async () => {
        throw Error("unavailable");
      }),
    ).rejects.toThrow("unavailable");
    expect(state.rows.size).toBe(0);
    expect(
      await withOrderSubmission(
        "customer",
        "request",
        "single",
        {},
        async () => ({ id: "retry" }),
      ),
    ).toEqual({ id: "retry" });
  });
  it("scopes keys to the authenticated customer", async () => {
    await withOrderSubmission("a", "same", "single", {}, async () => ({
      id: "a",
    }));
    expect(
      await withOrderSubmission("b", "same", "single", {}, async () => ({
        id: "b",
      })),
    ).toEqual({ id: "b" });
  });
});
