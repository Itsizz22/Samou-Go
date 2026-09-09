import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import type { Prisma } from "./prisma-types";
import { conflict } from "./http-error";
const replays = new WeakSet<object>();
export const isReplayedSubmission = (value: object) => replays.has(value);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export async function withOrderSubmission<T extends object>(
  customerId: string,
  requestId: string | undefined,
  kind: string,
  body: unknown,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!requestId) return prisma.$transaction(work);
  const where = { customerId_requestId: { customerId, requestId } };
  const requestHash = createHash("sha256")
    .update(kind + canonical(body))
    .digest("hex");
  const decode = (row: { requestHash: string; response: string }): T => {
    if (row.requestHash !== requestHash)
      throw conflict(
        "هذه المحاولة مرتبطة بطلب مختلف. راجع طلباتك قبل الإرسال.",
      );
    const result = JSON.parse(row.response) as T;
    replays.add(result);
    return result;
  };
  const previous = await prisma.orderSubmission.findUnique({ where });
  if (previous) return decode(previous);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.orderSubmission.create({
        data: { customerId, requestId, requestHash, response: "{}" },
      });
      const result = await work(tx);
      await tx.orderSubmission.update({
        where,
        data: { response: JSON.stringify(result) },
      });
      return result;
    });
  } catch (error) {
    // A concurrent identical attempt may have committed while this one waited.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      const previous = await prisma.orderSubmission.findUnique({ where });
      if (previous) return decode(previous);
    }
    throw error;
  }
}
